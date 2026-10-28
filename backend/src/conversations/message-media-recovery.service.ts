import { assertConversationStartedForMedia } from "./conversation-media-access";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  MessageDirection,
  MessageMediaState,
  MessageType,
  MessagingProviderType,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import {
  MessagingMediaStorageService,
  maxSizeBytes,
} from "../messaging/media/messaging-media-storage.service";
import { lockMessagingServiceState } from "../messaging/service-availability";
import { conversationVisibilityWhere } from "./conversation-visibility";

@Injectable()
export class MessageMediaRecoveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
    @Inject(MessagingMediaStorageService) private readonly storage: MessagingMediaStorageService,
  ) {}

  async recover(conversationId: string, messageId: string, current: AuthenticatedUser) {
    let newObjectKey: string | undefined;
    let callbackCompleted = false;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const visibleWhere = {
            id: conversationId,
            tenantId: current.tenantId,
            archivedAt: null,
            ...conversationVisibilityWhere(current),
          };
          const conversation = await tx.conversation.findFirst({ where: visibleWhere });
          if (!conversation) throw new NotFoundException("Conversa não encontrada.");
          assertConversationStartedForMedia(conversation.protocol);
          const original = await tx.message.findFirst({
            where: { id: messageId, tenantId: current.tenantId, conversationId },
          });
          if (!original) throw new NotFoundException("Mensagem não encontrada.");
          if (!original.connectionId || original.connectionId !== conversation.connectionId)
            throw new BadRequestException("Instância original indisponível para recuperação.");
          await lockMessagingServiceState(tx, current.tenantId, original.connectionId);
          const connection = await tx.messagingConnection.findFirst({
            where: { id: original.connectionId, tenantId: current.tenantId, archivedAt: null },
          });
          if (
            !connection ||
            connection.serviceEnabled === false ||
            connection.providerType !== MessagingProviderType.EVOLUTION ||
            !connection.externalReference
          )
            throw new BadRequestException("Instância original indisponível para recuperação.");
          const providerId = original.externalMessageId ?? original.providerMessageId;
          if (!providerId)
            throw new ConflictException("Identificador original indisponível para recuperação.");
          const owner =
            connection.ownerPhoneNormalized?.replace(/\D/g, "") ||
            connection.ownerExternalId?.split("@", 1)[0]?.replace(/\D/g, "") ||
            `connection:${connection.id}`;
          const lockKey = `inbound-message:${current.tenantId}:${owner}:${providerId}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          // Keep assignment and visibility stable while acquiring media. Match inbound lock
          // order: instance admission, message identity, conversation, then message row.
          await tx.$queryRaw`SELECT id FROM "conversations" WHERE id = ${conversationId} AND "tenantId" = ${current.tenantId} FOR SHARE`;
          await tx.$queryRaw`SELECT id FROM "messages" WHERE id = ${messageId} AND "tenantId" = ${current.tenantId} AND "conversationId" = ${conversationId} FOR UPDATE`;
          const message = await tx.message.findFirst({
            where: { id: messageId, tenantId: current.tenantId, conversationId },
          });
          const currentConversation = await tx.conversation.findFirst({ where: visibleWhere });
          if (!message || !currentConversation)
            throw new NotFoundException("Mensagem não encontrada.");
          assertConversationStartedForMedia(currentConversation.protocol);
          if (
            message.direction !== MessageDirection.INBOUND ||
            message.type !== MessageType.DOCUMENT ||
            isDeleted(message.interactiveData)
          )
            throw new BadRequestException("Esta mensagem não permite recuperação de documento.");
          if (
            message.connectionId !== connection.id ||
            currentConversation.connectionId !== connection.id ||
            (message.externalMessageId ?? message.providerMessageId) !== providerId
          )
            throw new ConflictException("Identidade original da mensagem foi alterada.");
          if (message.mediaStorageKey) {
            try {
              await this.storage.readObject(message.mediaStorageKey);
              if (message.mediaState !== MessageMediaState.READY)
                await tx.message.update({
                  where: { tenantId_id: { tenantId: current.tenantId, id: messageId } },
                  data: { mediaState: MessageMediaState.READY },
                });
              return { messageId, state: "ready" as const, recovered: false };
            } catch (error) {
              if ((error as NodeJS.ErrnoException)?.code !== "ENOENT")
                throw new ServiceUnavailableException(
                  "Não foi possível ler o documento armazenado.",
                );
            }
          }
          const remoteJid = message.providerChatId ?? conversation.externalChatId;
          if (
            !remoteJid ||
            (message.providerChatId &&
              conversation.externalChatId &&
              message.providerChatId !== conversation.externalChatId)
          )
            throw new ConflictException("Chat original indisponível para recuperação.");
          let record: Record<string, unknown>;
          let downloaded: { body: Buffer; mimeType?: string | null; fileName?: string | null };
          try {
            let records = await this.evolution.findMessages({
              instanceName: connection.externalReference,
              remoteJid,
              messageId: providerId,
              page: 1,
              pageSize: 10,
            });
            // Evolution may store the primary chat as @lid and retain the exact
            // original chat in remoteJidAlt. Only an empty exact lookup permits
            // this bounded lookup by original ID in the same instance.
            if (records.length === 0) {
              records = await this.evolution.findMessages({
                instanceName: connection.externalReference,
                messageId: providerId,
                page: 1,
                pageSize: 10,
              });
            }
            const matches = records
              .map((candidate) => originalRecord(candidate, providerId, remoteJid))
              .filter((candidate): candidate is Record<string, unknown> => candidate !== null);
            if (matches.length !== 1)
              throw new ConflictException("Documento original não está disponível no provedor.");
            record = matches[0] as Record<string, unknown>;
            downloaded = await this.evolution.getBase64FromMediaMessage({
              instanceName: connection.externalReference,
              message: record,
              maxBytes: maxSizeBytes(MessageType.DOCUMENT),
            });
          } catch (error) {
            if (error instanceof ConflictException) throw error;
            throw new ServiceUnavailableException(
              "Não foi possível recuperar o documento no provedor.",
            );
          }
          if (!downloaded.body?.byteLength)
            throw new ConflictException("Documento original sem conteúdo recuperável.");
          const stored = await this.storage.storeDownloaded({
            tenantId: current.tenantId,
            conversationId,
            body: downloaded.body,
            mimeType: downloaded.mimeType ?? message.mediaMimeType ?? "application/octet-stream",
            fileName: downloaded.fileName ?? message.mediaFileName,
            messageType: MessageType.DOCUMENT,
          });
          newObjectKey = stored.objectKey;
          await tx.message.update({
            where: { tenantId_id: { tenantId: current.tenantId, id: messageId } },
            data: {
              mediaStorageKey: stored.objectKey,
              mediaMimeType: stored.mimeType,
              mediaFileName: stored.fileName,
              mediaSize: stored.sizeBytes,
              mediaChecksum: stored.checksum,
              mediaState: MessageMediaState.READY,
            },
          });
          callbackCompleted = true;
          return { messageId, state: "ready" as const, recovered: true };
        },
        { timeout: 120000 },
      );
    } catch (error) {
      if (newObjectKey && !callbackCompleted) {
        // A completed callback followed by a transaction error has an ambiguous commit.
        // A fresh lookup can still be empty while that commit is in flight; preserve its bytes.
        // Only callback failures permit conservative cleanup after checking references.
        try {
          const referenced = await this.prisma.message.findFirst({
            where: { tenantId: current.tenantId, mediaStorageKey: newObjectKey },
            select: { id: true },
          });
          if (!referenced) await this.storage.deleteObject(newObjectKey);
        } catch {
          /* Preserve bytes when cleanup cannot establish that they are unreferenced. */
        }
      }
      throw error;
    }
  }
}

function isDeleted(data: unknown) {
  return (
    !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as Record<string, unknown>).deletedForEveryone === true
  );
}

function originalRecord(record: unknown, id: string, chat: string) {
  const root = asRecord(record);
  if (!root) return null;
  const data = asRecord(root.data);
  const candidates = [root, data, asRecord(root.message), asRecord(data?.message)].filter(
    (candidate): candidate is Record<string, unknown> => candidate !== null,
  );
  const identities = candidates.filter((candidate) => Object.hasOwn(candidate, "key"));
  if (!identities.length) return null;
  // Every identity supplied in a supported envelope must agree. Do not let a
  // valid nested identity conceal a conflicting or incomplete outer identity.
  const firstKey = asRecord(identities[0].key);
  for (const candidate of identities) {
    const key = asRecord(candidate.key);
    if (
      !key ||
      key.id !== id ||
      key.fromMe !== false ||
      typeof key.remoteJid !== "string" ||
      !/^[^@\s]+@[^@\s]+$/.test(key.remoteJid) ||
      (key.remoteJid !== chat && key.remoteJidAlt !== chat) ||
      key.remoteJid !== firstKey?.remoteJid ||
      key.remoteJidAlt !== firstKey?.remoteJidAlt
    )
      return null;
  }
  // A redundant outer key can accompany a complete record inside data. Prefer
  // the matching record that actually contains the provider message payload.
  return identities.find((candidate) => asRecord(candidate.message) !== null) ?? identities[0];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
