import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConversationStatus, MessageDirection, MessageStatus, Prisma } from "../generated/prisma";
import { normalizePhone } from "../crm/phone-normalization";
import { PrismaService } from "../prisma/prisma.service";
import { InboundMessageEvent } from "./messaging.contracts";

@Injectable()
export class MessagingInboundService {
  private readonly logger = new Logger(MessagingInboundService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async process(event: InboundMessageEvent) {
    const normalizedPhone = normalizePhone(event.sender.normalizedPhone || event.sender.phone);

    const result = await this.prisma.$transaction(async (tx) => {
      const connection = await tx.messagingConnection.findFirst({
        where: { id: event.connectionId, tenantId: event.tenantId },
      });
      if (!connection) throw new Error("Messaging connection not found for tenant.");

      const duplicateWhere: Prisma.MessageWhereInput = connection.ownerPhoneNormalized
        ? {
            tenantId: event.tenantId,
            externalMessageId: event.externalMessageId,
            OR: [
              { connectionId: event.connectionId },
              { connection: { is: { ownerPhoneNormalized: connection.ownerPhoneNormalized } } },
            ],
          }
        : {
            tenantId: event.tenantId,
            connectionId: event.connectionId,
            externalMessageId: event.externalMessageId,
          };
      const duplicate = await tx.message.findFirst({
        where: duplicateWhere,
      });
      if (duplicate) return { message: duplicate, duplicate: true };

      const contact = await tx.contact.upsert({
        where: {
          tenantId_normalizedPhone: {
            tenantId: event.tenantId,
            normalizedPhone,
          },
        },
        update: {
          phone: event.sender.phone,
          name: event.metadata?.displayName ?? event.sender.displayName ?? undefined,
        },
        create: {
          tenantId: event.tenantId,
          name: event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone,
          phone: event.sender.phone,
          normalizedPhone,
          instance: connection.externalReference,
        },
      });

      const conversation = await this.findOrCreateConversation(tx, event, contact.id, connection);
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
      await tx.conversation.update({
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
      return { message, duplicate: false };
    });

    this.logger.log({
      event: "messaging.inbound.processed",
      messageId: result.message.id,
      connectionId: event.connectionId,
      eventType: event.type,
      duplicate: result.duplicate,
    });
    return result;
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

function mediaPreview(type: InboundMessageEvent["type"]) {
  if (type === "IMAGE") return "[imagem]";
  if (type === "AUDIO") return "[audio]";
  return "";
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}
