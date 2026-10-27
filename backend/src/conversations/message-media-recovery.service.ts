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
            const records = await this.evolution.findMessages({
              instanceName: connection.externalReference,
              remoteJid,
              messageId: providerId,
              page: 1,
              pageSize: 10,
            });
            const matches = records.filter((candidate) =>
              matchesOriginal(candidate, providerId, remoteJid),
            );
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

function matchesOriginal(record: unknown, id: string, chat: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const key = (record as Record<string, unknown>).key;
  if (!key || typeof key !== "object" || Array.isArray(key)) return false;
  const candidate = key as Record<string, unknown>;
  return candidate.id === id && candidate.remoteJid === chat && candidate.fromMe === false;
}
