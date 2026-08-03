import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConversationStatus, MessageDirection, MessageStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { InboundMessageEvent } from "./messaging.contracts";
import { normalizeRemotePhoneCandidates } from "./messaging-identity";

@Injectable()
export class MessagingInboundService {
  private readonly logger = new Logger(MessagingInboundService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async process(event: InboundMessageEvent) {
    const normalizedPhoneCandidates = uniqueNormalizedPhones([
      ...(event.metadata?.normalizedPhoneCandidates ?? []),
      event.sender.normalizedPhone,
      ...normalizeRemotePhoneCandidates(event.sender.phone),
    ]);
    const canonicalPhone = normalizedPhoneCandidates[0];

    const result = await this.prisma.$transaction(async (tx) => {
      const connection = await tx.messagingConnection.findFirst({
        where: { id: event.connectionId, tenantId: event.tenantId },
      });
      if (!connection) throw new Error("Messaging connection not found for tenant.");

      const duplicateWhere = this.duplicateWhere(event, connection.ownerPhoneNormalized);
      const duplicate = await tx.message.findFirst({
        where: duplicateWhere,
      });
      if (duplicate) return { message: duplicate, duplicate: true };

      const existingContact = await tx.contact.findFirst({
        where: {
          tenantId: event.tenantId,
          normalizedPhone: { in: normalizedPhoneCandidates },
          archivedAt: null,
        },
        orderBy: { updatedAt: "desc" },
      });
      const contact = existingContact
        ? await tx.contact.update({
            where: { tenantId_id: { tenantId: event.tenantId, id: existingContact.id } },
            data: {
              phone: event.sender.phone,
              name: event.metadata?.displayName ?? event.sender.displayName ?? undefined,
              instance: connection.externalReference ?? existingContact.instance,
            },
          })
        : await tx.contact.create({
            data: {
              tenantId: event.tenantId,
              name: event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone,
              phone: event.sender.phone,
              normalizedPhone: canonicalPhone,
              instance: connection.externalReference,
            },
          });

      const conversation = await this.findOrCreateConversation(tx, event, contact.id, connection);
      const createdConversation = !conversation.lastMessageAt && conversation.unreadCount === 0;
      const preview = event.content ?? mediaPreview(event.type);
      const message = await tx.message.create({
        data: {
          tenantId: event.tenantId,
          conversationId: conversation.id,
          connectionId: event.connectionId,
          direction: MessageDirection.INBOUND,
          type: event.type,
          status: MessageStatus.DELIVERED,
          content: event.content ?? null,
          externalMessageId: event.externalMessageId,
          providerMessageId: event.externalMessageId,
          providerStatus: "inbound_received",
          createdAt: event.occurredAt,
        },
      });
      const updatedConversation = await tx.conversation.update({
        where: { tenantId_id: { tenantId: event.tenantId, id: conversation.id } },
        data: {
          unreadCount: { increment: 1 },
          lastMessagePreview: truncatePreview(preview),
          lastMessageAt: event.occurredAt,
          status:
            conversation.status === ConversationStatus.FECHADA
              ? ConversationStatus.ABERTA
              : conversation.status,
          closedAt:
            conversation.status === ConversationStatus.FECHADA ? null : conversation.closedAt,
        },
      });
      return {
        message,
        duplicate: false,
        contactId: contact.id,
        createdConversation,
        unreadCount: updatedConversation.unreadCount,
      };
    });

    this.logger.log({
      event: "messaging.inbound.processed",
      tenantId: event.tenantId,
      messageId: result.message.id,
      connectionId: event.connectionId,
      externalMessageId: event.externalMessageId,
      eventType: event.type,
      duplicate: result.duplicate,
      resolutionResult: result.duplicate ? "ignored_duplicate" : "persisted",
    });
    if (!result.duplicate) {
      this.realtime?.publishMessageCreated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        contactId: result.contactId,
        connectionId: event.connectionId,
        message: {
          id: result.message.id,
          direction: "inbound",
          status: result.message.status.toLowerCase(),
          createdAt: result.message.createdAt,
        },
      });
      this.realtime?.publishConversationUpdated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        reason: result.createdConversation ? "inbound.created" : "inbound.updated",
      });
      this.realtime?.publishUnreadUpdated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        unreadCount: result.unreadCount ?? 0,
      });
    }
    return result;
  }

  private duplicateWhere(
    event: InboundMessageEvent,
    ownerPhoneNormalized: string | null,
  ): Prisma.MessageWhereInput {
    const exactConnection: Prisma.MessageWhereInput = {
      tenantId: event.tenantId,
      connectionId: event.connectionId,
      externalMessageId: event.externalMessageId,
    };
    if (!ownerPhoneNormalized) return exactConnection;
    return {
      tenantId: event.tenantId,
      externalMessageId: event.externalMessageId,
      OR: [{ connectionId: event.connectionId }, { connection: { is: { ownerPhoneNormalized } } }],
    };
  }

  private async findOrCreateConversation(
    tx: Prisma.TransactionClient,
    event: InboundMessageEvent,
    contactId: string,
    connection: { ownerPhoneNormalized: string | null },
  ) {
    const existing = await tx.conversation.findFirst({
      where: {
        tenantId: event.tenantId,
        contactId,
        connectionId: event.connectionId,
        archivedAt: null,
        status: { not: ConversationStatus.FECHADA },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) return existing;

    if (connection.ownerPhoneNormalized) {
      const existingByOwner = await tx.conversation.findFirst({
        where: {
          tenantId: event.tenantId,
          contactId,
          archivedAt: null,
          status: { not: ConversationStatus.FECHADA },
          connection: { is: { ownerPhoneNormalized: connection.ownerPhoneNormalized } },
        },
        orderBy: { updatedAt: "desc" },
      });
      if (existingByOwner) return existingByOwner;
    }

    return tx.conversation.create({
      data: {
        tenantId: event.tenantId,
        contactId,
        connectionId: event.connectionId,
        status: ConversationStatus.ABERTA,
        unreadCount: 0,
        lastMessagePreview: null,
        lastMessageAt: null,
      },
    });
  }
}

function uniqueNormalizedPhones(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function mediaPreview(type: InboundMessageEvent["type"]) {
  if (type === "IMAGE") return "[imagem]";
  if (type === "AUDIO") return "[audio]";
  return "";
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}
