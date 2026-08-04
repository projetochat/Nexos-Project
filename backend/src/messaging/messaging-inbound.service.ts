import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  ConversationStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  NotificationKind,
  Prisma,
} from "../generated/prisma";
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
      const defaultDepartmentId =
        existingContact?.departmentId ?? (await this.defaultDepartmentId(tx, event.tenantId));
      const contact = existingContact
        ? await tx.contact.update({
            where: { tenantId_id: { tenantId: event.tenantId, id: existingContact.id } },
            data: {
              phone: event.sender.phone,
              name: event.metadata?.displayName ?? event.sender.displayName ?? undefined,
              departmentId: existingContact.departmentId ?? defaultDepartmentId,
              instance: connection.externalReference ?? existingContact.instance,
            },
          })
        : await tx.contact.create({
            data: {
              tenantId: event.tenantId,
              name: event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone,
              phone: event.sender.phone,
              normalizedPhone: canonicalPhone,
              departmentId: defaultDepartmentId,
              instance: connection.externalReference,
            },
          });

      const conversationResult = await this.findOrCreateConversation(
        tx,
        event,
        contact,
        connection,
      );
      const conversation = conversationResult.conversation;
      const createdConversation = conversationResult.created;
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
      const lead = createdConversation
        ? await tx.lead.upsert({
            where: {
              tenantId_conversationId: {
                tenantId: event.tenantId,
                conversationId: conversation.id,
              },
            },
            update: {
              contactId: contact.id,
              departmentId: updatedConversation.departmentId,
              firstMessagePreview: truncatePreview(preview),
            },
            create: {
              tenantId: event.tenantId,
              contactId: contact.id,
              conversationId: conversation.id,
              departmentId: updatedConversation.departmentId,
              source: "WHATSAPP",
              status: LeadStatus.NEW,
              firstMessagePreview: truncatePreview(preview),
            },
          })
        : null;
      const notifications =
        createdConversation && lead
          ? await this.notifyLeadCreated(tx, {
              tenantId: event.tenantId,
              leadId: lead.id,
              conversationId: conversation.id,
              departmentId: updatedConversation.departmentId,
              contactName: contact.name,
            })
          : [];
      return {
        message,
        duplicate: false,
        contactId: contact.id,
        conversationId: conversation.id,
        createdConversation,
        leadId: lead?.id ?? null,
        notifications,
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
      if (result.leadId) {
        this.realtime?.publishLeadCreated({
          tenantId: event.tenantId,
          leadId: result.leadId,
          conversationId: result.conversationId,
        });
      }
      for (const notification of result.notifications ?? []) {
        this.realtime?.publishNotificationCreated({
          tenantId: event.tenantId,
          notificationId: notification.id,
          membershipId: notification.membershipId,
          departmentId: notification.departmentId,
          kind: notification.kind,
        });
      }
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
    contact: { id: string; departmentId?: string | null },
    connection: { ownerPhoneNormalized: string | null },
  ) {
    const existing = await tx.conversation.findFirst({
      where: {
        tenantId: event.tenantId,
        contactId: contact.id,
        connectionId: event.connectionId,
        archivedAt: null,
        status: { not: ConversationStatus.FECHADA },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) return { conversation: existing, created: false };

    if (connection.ownerPhoneNormalized) {
      const existingByOwner = await tx.conversation.findFirst({
        where: {
          tenantId: event.tenantId,
          contactId: contact.id,
          archivedAt: null,
          status: { not: ConversationStatus.FECHADA },
          connection: { is: { ownerPhoneNormalized: connection.ownerPhoneNormalized } },
        },
        orderBy: { updatedAt: "desc" },
      });
      if (existingByOwner) return { conversation: existingByOwner, created: false };
    }

    const created = await tx.conversation.create({
      data: {
        tenantId: event.tenantId,
        contactId: contact.id,
        connectionId: event.connectionId,
        departmentId: contact.departmentId ?? null,
        status: ConversationStatus.ABERTA,
        unreadCount: 0,
        lastMessagePreview: null,
        lastMessageAt: null,
      },
    });
    return { conversation: created, created: true };
  }

  private async defaultDepartmentId(tx: Prisma.TransactionClient, tenantId: string) {
    const department = await tx.department.findFirst({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return department?.id ?? null;
  }

  private async notifyLeadCreated(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      leadId: string;
      conversationId: string;
      departmentId: string | null;
      contactName: string;
    },
  ) {
    const recipients = await tx.tenantMembership.findMany({
      where: {
        tenantId: input.tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        OR: [
          { role: { key: { in: ["tenant_admin", "supervisor"] } } },
          ...(input.departmentId
            ? [{ departments: { some: { departmentId: input.departmentId } } }]
            : []),
        ],
      },
      select: { id: true },
      take: 50,
    });
    const uniqueRecipients = [...new Set(recipients.map((item) => item.id))];
    if (uniqueRecipients.length === 0) return [];

    await tx.notification.createMany({
      data: uniqueRecipients.map((membershipId) => ({
        tenantId: input.tenantId,
        membershipId,
        departmentId: input.departmentId,
        kind: NotificationKind.LEAD_CREATED,
        title: "Novo lead recebido",
        body: truncatePreview(input.contactName),
        entityType: "lead",
        entityId: input.leadId,
      })),
    });
    return tx.notification.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: "lead",
        entityId: input.leadId,
        kind: NotificationKind.LEAD_CREATED,
      },
      select: { id: true, membershipId: true, departmentId: true, kind: true },
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
