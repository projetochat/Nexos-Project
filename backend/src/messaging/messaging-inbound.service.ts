import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  ConversationType,
  ConversationStatus,
  LeadStatus,
  MessageDirection,
  MessageMediaState,
  MessageType,
  MessageStatus,
  NotificationKind,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { InboundMessageEvent, MessageEditEvent } from "./messaging.contracts";
import { MessagingMediaStorageService } from "./media/messaging-media-storage.service";
import { normalizeRemotePhoneCandidates } from "./messaging-identity";
import { EvolutionClient } from "./evolution/evolution.client";
import { MessagingOutboundService } from "./messaging-outbound.service";
import { resolveMessageTemplate } from "./message-template";
import { selectAutomaticReply } from "./automatic-reply";

@Injectable()
export class MessagingInboundService {
  private readonly logger = new Logger(MessagingInboundService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage?: MessagingMediaStorageService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
    @Optional() @Inject(EvolutionClient) private readonly evolution?: EvolutionClient,
    @Optional()
    @Inject(MessagingOutboundService)
    private readonly outbound?: MessagingOutboundService,
  ) {}

  async process(event: InboundMessageEvent, options: { historical?: boolean } = {}) {
    const historical = options.historical === true;
    const normalizedPhoneCandidates = uniqueNormalizedPhones([
      ...(event.metadata?.normalizedPhoneCandidates ?? []),
      event.sender.normalizedPhone,
      ...normalizeRemotePhoneCandidates(event.sender.phone),
    ]);
    const isGroup = event.conversationType === "GROUP";
    const groupContactIdentity = `group:${event.externalChatId}`;
    const canonicalPhone = isGroup ? groupContactIdentity : normalizedPhoneCandidates[0];

    const result = await this.prisma.$transaction(async (tx) => {
      const connection = await tx.messagingConnection.findFirst({
        where: { id: event.connectionId, tenantId: event.tenantId },
      });
      if (!connection) throw new Error("Messaging connection not found for tenant.");
      const groupDisplayName = isGroup
        ? await this.resolveGroupDisplayName(event, connection.externalReference)
        : null;

      const duplicateWhere = this.duplicateWhere(event, connection.ownerPhoneNormalized);
      const duplicate = await tx.message.findFirst({
        where: duplicateWhere,
      });
      if (duplicate) return { message: duplicate, duplicate: true };

      const existingContact = await tx.contact.findFirst({
        where: {
          tenantId: event.tenantId,
          normalizedPhone: isGroup ? groupContactIdentity : { in: normalizedPhoneCandidates },
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
              phone: isGroup ? event.externalChatId : event.sender.phone,
              name: isGroup
                ? groupDisplayName && existingContact.name === "Grupo WhatsApp"
                  ? groupDisplayName
                  : existingContact.name
                : event.fromMe
                  ? undefined
                  : (event.metadata?.displayName ?? event.sender.displayName ?? undefined),
              departmentId: existingContact.departmentId ?? defaultDepartmentId,
              instance: connection.externalReference ?? existingContact.instance,
            },
          })
        : await tx.contact.upsert({
            where: {
              tenantId_normalizedPhone: {
                tenantId: event.tenantId,
                normalizedPhone: canonicalPhone,
              },
            },
            update: {
              name: isGroup
                ? (groupDisplayName ?? "Grupo WhatsApp")
                : event.fromMe
                  ? event.sender.phone
                  : (event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone),
              phone: isGroup ? event.externalChatId : event.sender.phone,
              departmentId: defaultDepartmentId,
              instance: connection.externalReference,
              archivedAt: null,
            },
            create: {
              tenantId: event.tenantId,
              name: isGroup
                ? (groupDisplayName ?? "Grupo WhatsApp")
                : (event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone),
              phone: isGroup ? event.externalChatId : event.sender.phone,
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
        groupDisplayName,
      );
      const conversation = conversationResult.conversation;
      const createdConversation = conversationResult.created;
      const preview = event.content ?? mediaPreview(event.type);
      const quoted = event.quotedProviderMessageId
        ? await tx.message.findFirst({
            where: {
              tenantId: event.tenantId,
              connectionId: event.connectionId,
              providerMessageId: event.quotedProviderMessageId,
            },
            select: { id: true },
          })
        : null;
      if (isGroup && event.participantExternalId) {
        await tx.conversationParticipant.upsert({
          where: {
            tenantId_conversationId_externalParticipantId: {
              tenantId: event.tenantId,
              conversationId: conversation.id,
              externalParticipantId: event.participantExternalId,
            },
          },
          update: {
            phone: event.participantPhone,
            lid: event.participantLid,
            displayName: event.participantName,
            lastSeenAt: event.occurredAt,
            active: true,
          },
          create: {
            tenantId: event.tenantId,
            conversationId: conversation.id,
            externalParticipantId: event.participantExternalId,
            phone: event.participantPhone,
            lid: event.participantLid,
            displayName: event.participantName,
            firstSeenAt: event.occurredAt,
            lastSeenAt: event.occurredAt,
          },
        });
      }
      const downloadedMedia = await this.downloadInboundMedia(
        event,
        conversation.id,
        event.metadata?.providerInstanceName ?? connection.externalReference,
      ).catch((error) => {
        this.logger.warn({
          event: "messaging.media.inbound_download_failed",
          tenantId: event.tenantId,
          connectionId: event.connectionId,
          externalMessageId: event.externalMessageId,
          error: error instanceof Error ? error.message : "download failed",
        });
        return null;
      });
      const message = await tx.message.create({
        data: {
          tenantId: event.tenantId,
          conversationId: conversation.id,
          connectionId: event.connectionId,
          direction: event.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
          type: event.type,
          status: event.fromMe ? MessageStatus.SENT : MessageStatus.CREATED,
          content: event.content ?? null,
          interactiveData: event.interactive ?? undefined,
          externalMessageId: event.externalMessageId,
          providerMessageId: event.externalMessageId,
          providerChatId: event.externalChatId,
          providerParticipantId: event.participantExternalId ?? null,
          participantName: event.participantName ?? event.sender.displayName ?? null,
          participantPhone: event.participantPhone ?? null,
          participantLid: event.participantLid ?? null,
          quotedMessageId: quoted?.id ?? null,
          quotedProviderMessageId: event.quotedProviderMessageId ?? null,
          quotedContentPreview: event.quotedContentPreview ?? null,
          quotedMessageType: event.quotedMessageType ?? null,
          mediaStorageKey: downloadedMedia?.objectKey ?? null,
          mediaMimeType: downloadedMedia?.mimeType ?? event.media?.mimetype ?? null,
          mediaFileName: downloadedMedia?.fileName ?? event.media?.fileName ?? null,
          mediaSize: downloadedMedia?.sizeBytes ?? event.media?.sizeBytes ?? null,
          mediaCaption: event.content ?? null,
          mediaChecksum: downloadedMedia?.checksum ?? null,
          mediaSha256: event.media?.sha256 ?? downloadedMedia?.checksum ?? null,
          mediaDurationMs: event.media?.durationMs ?? null,
          mediaProviderUrl: event.media?.url ?? null,
          mediaState: resolveInboundMediaState(event, downloadedMedia),
          providerStatus: event.fromMe ? "outbound_synced" : "inbound_received",
          createdAt: event.occurredAt,
        },
      });
      const updatedConversation = await tx.conversation.update({
        where: { tenantId_id: { tenantId: event.tenantId, id: conversation.id } },
        data: {
          unreadCount: event.fromMe || historical ? conversation.unreadCount : { increment: 1 },
          lastMessagePreview: truncatePreview(preview),
          lastMessageAt: event.occurredAt,
          inboxArchivedAt: isGroup ? null : conversation.inboxArchivedAt,
          assignedMembershipId:
            conversation.status === ConversationStatus.FECHADA
              ? null
              : conversation.assignedMembershipId,
          status:
            conversation.status === ConversationStatus.FECHADA
              ? ConversationStatus.ABERTA
              : conversation.status,
          protocol:
            conversation.status === ConversationStatus.FECHADA ? null : conversation.protocol,
          closedAt:
            conversation.status === ConversationStatus.FECHADA ? null : conversation.closedAt,
        },
      });
      const lead =
        !historical && createdConversation && !isGroup && !event.fromMe
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
        !historical && createdConversation && lead
          ? await this.notifyLeadCreated(tx, {
              tenantId: event.tenantId,
              leadId: lead.id,
              conversationId: conversation.id,
              departmentId: updatedConversation.departmentId,
              contactName: contact.name,
            })
          : [];
      const automaticReply = historical
        ? null
        : selectAutomaticReply({
            createdConversation,
            isGroup,
            fromMe: event.fromMe,
            welcomeEnabled: connection.welcomeEnabled,
            welcomeTemplate: existingContact
              ? connection.welcomeExistingMessage
              : connection.welcomeNewMessage,
            absenceEnabled: connection.absenceEnabled,
            absenceTemplate: connection.absenceMessage,
            serviceHours: connection.serviceHours,
            timezone: connection.timezone,
            at: event.occurredAt,
          });
      const reply = automaticReply
        ? {
            ...automaticReply,
            contactExisting: Boolean(existingContact),
            contact,
            departmentName: updatedConversation.departmentId
              ? ((
                  await tx.department.findFirst({
                    where: { id: updatedConversation.departmentId, tenantId: event.tenantId },
                    select: { name: true },
                  })
                )?.name ?? null)
              : null,
          }
        : null;
      return {
        message,
        duplicate: false,
        contactId: contact.id,
        conversationId: conversation.id,
        providerInstanceName: event.metadata?.providerInstanceName ?? connection.externalReference,
        createdConversation,
        leadId: lead?.id ?? null,
        notifications,
        unreadCount: updatedConversation.unreadCount,
        automaticReply: reply,
      };
    });

    const profilePictureUpdated = await this.syncContactProfilePicture(event, result).catch(
      (error) => {
        this.logger.warn({
          event: "messaging.contact.profile_picture_sync_failed",
          tenantId: event.tenantId,
          connectionId: event.connectionId,
          externalChatId: event.externalChatId,
          error: error instanceof Error ? error.message : "profile picture sync failed",
        });
        return false;
      },
    );

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
    if (!result.duplicate && !historical) {
      this.realtime?.publishMessageCreated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        contactId: result.contactId,
        connectionId: event.connectionId,
        message: {
          id: result.message.id,
          direction:
            result.message.direction?.toLowerCase() ?? (event.fromMe ? "outbound" : "inbound"),
          status: result.message.status?.toLowerCase() ?? (event.fromMe ? "sent" : "created"),
          createdAt: result.message.createdAt ?? event.occurredAt,
        },
      });
      this.realtime?.publishConversationUpdated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        reason: event.fromMe
          ? "outbound.synced"
          : result.createdConversation
            ? "inbound.created"
            : "inbound.updated",
      });
      if (profilePictureUpdated && result.contactId) {
        this.realtime?.publishContactUpdated({
          tenantId: event.tenantId,
          contactId: result.contactId,
          contact: { id: result.contactId },
        });
      }
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
      if (!event.fromMe) {
        this.realtime?.publishUnreadUpdated({
          tenantId: event.tenantId,
          conversationId: result.message.conversationId,
          unreadCount: result.unreadCount ?? 0,
        });
      }
      if (result.automaticReply && this.outbound) {
        try {
          const customFieldValues = await this.prisma.contactCustomFieldValue.findMany({
            where: { tenantId: event.tenantId, contactId: result.contactId! },
            include: { field: { select: { label: true } } },
          });
          const content = resolveMessageTemplate(result.automaticReply.template, {
            contactName: result.automaticReply.contact.name,
            phone: result.automaticReply.contact.phone,
            email: result.automaticReply.contact.email,
            instance: result.providerInstanceName,
            department: result.automaticReply.departmentName,
            customFields: Object.fromEntries(
              customFieldValues.map((item) => [item.field.label, item.value]),
            ),
            now: event.occurredAt,
          });
          await this.outbound.queueAutomatedText({
            tenantId: event.tenantId,
            conversationId: result.conversationId,
            connectionId: event.connectionId,
            externalChatId: event.externalChatId,
            content,
            kind: result.automaticReply.kind,
          });
          this.logger.log({
            event: `messaging.${result.automaticReply.kind}.queued`,
            tenantId: event.tenantId,
            connectionId: event.connectionId,
            conversationId: result.conversationId,
            contactKind: result.automaticReply.contactExisting ? "existing" : "new",
          });
        } catch (error) {
          this.logger.error({
            event: `messaging.${result.automaticReply.kind}.queue_failed`,
            tenantId: event.tenantId,
            connectionId: event.connectionId,
            conversationId: result.conversationId,
            error: error instanceof Error ? error.message : "Automatic reply dispatch failed.",
          });
        }
      }
    }
    return result;
  }

  private async syncContactProfilePicture(
    event: InboundMessageEvent,
    result: {
      duplicate: boolean;
      contactId?: string | null;
      providerInstanceName?: string | null;
    },
  ) {
    if (result.duplicate || event.fromMe || event.conversationType === "GROUP") return false;
    if (!result.contactId || !result.providerInstanceName) return false;
    const avatarUrl = event.metadata?.profilePictureUrl;
    if (!avatarUrl) return false;

    const updated = await this.prisma.contact.updateMany({
      where: {
        tenantId: event.tenantId,
        id: result.contactId,
        OR: [{ avatarUrl: null }, { avatarUrl: { not: avatarUrl } }],
      },
      data: { avatarUrl },
    });
    return updated.count > 0;
  }

  async processEdit(event: MessageEditEvent) {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: event.tenantId,
        connectionId: event.connectionId,
        providerMessageId: event.providerMessageId,
      },
      select: { id: true, conversationId: true, content: true },
    });
    if (!message) return { updated: false, reason: "MESSAGE_NOT_FOUND" };
    if (message.content === event.content) return { updated: false, reason: "UNCHANGED" };
    await this.prisma.message.update({
      where: { tenantId_id: { tenantId: event.tenantId, id: message.id } },
      data: { content: event.content, updatedAt: event.occurredAt },
    });
    await this.prisma.conversation.update({
      where: { tenantId_id: { tenantId: event.tenantId, id: message.conversationId } },
      data: {
        lastMessagePreview: truncatePreview(event.content),
        lastMessageAt: event.occurredAt,
      },
    });
    this.realtime?.publishConversationUpdated({
      tenantId: event.tenantId,
      conversationId: message.conversationId,
      reason: "message.edited",
    });
    return { updated: true, messageId: message.id, conversationId: message.conversationId };
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
    groupDisplayName?: string | null,
  ) {
    if (event.conversationType === "GROUP") {
      const existing = await tx.conversation.findFirst({
        where: {
          tenantId: event.tenantId,
          connectionId: event.connectionId,
          externalChatId: event.externalChatId,
          conversationType: ConversationType.GROUP,
          archivedAt: null,
        },
        orderBy: { updatedAt: "desc" },
      });
      if (existing) {
        if (groupDisplayName && existing.groupName === "Grupo WhatsApp") {
          const updated = await tx.conversation.update({
            where: { tenantId_id: { tenantId: event.tenantId, id: existing.id } },
            data: { groupName: groupDisplayName },
          });
          return { conversation: updated, created: false };
        }
        return { conversation: existing, created: false };
      }

      const created = await tx.conversation.create({
        data: {
          tenantId: event.tenantId,
          contactId: contact.id,
          connectionId: event.connectionId,
          departmentId: contact.departmentId ?? null,
          status: ConversationStatus.ABERTA,
          isGroup: true,
          conversationType: ConversationType.GROUP,
          externalChatId: event.externalChatId,
          externalGroupId: event.externalChatId,
          groupName: groupDisplayName ?? "Grupo WhatsApp",
          unreadCount: 0,
          lastMessagePreview: null,
          lastMessageAt: null,
        },
      });
      return { conversation: created, created: true };
    }

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
        conversationType: ConversationType.DIRECT,
        externalChatId: event.externalChatId,
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

  private async resolveGroupDisplayName(
    event: InboundMessageEvent,
    providerConnectionRef?: string | null,
  ) {
    if (event.metadata?.displayName) return event.metadata.displayName;
    const instanceName = event.metadata?.providerInstanceName ?? providerConnectionRef;
    if (!this.evolution || !instanceName) return null;
    try {
      const info = await this.evolution.findGroupInfo({
        instanceName,
        groupJid: event.externalChatId,
      });
      return info?.subject ?? info?.name ?? null;
    } catch (error) {
      this.logger.warn({
        event: "messaging.group.name_lookup_failed",
        tenantId: event.tenantId,
        connectionId: event.connectionId,
        externalChatId: event.externalChatId,
        error: error instanceof Error ? error.message : "group lookup failed",
      });
      return null;
    }
  }

  private async downloadInboundMedia(
    event: InboundMessageEvent,
    conversationId: string,
    providerConnectionRef?: string | null,
  ) {
    if (!this.mediaStorage || !event.media) return null;
    let body: Buffer | null = null;
    let mimeType = event.media.mimetype ?? null;
    let fileName = event.media.fileName ?? null;
    if (this.evolution && providerConnectionRef && event.media.rawMessage) {
      const downloaded = await this.evolution.getBase64FromMediaMessage({
        instanceName: providerConnectionRef,
        message: event.media.rawMessage,
      });
      body = downloaded.body;
      mimeType = mimeType ?? downloaded.mimeType ?? null;
      fileName = fileName ?? downloaded.fileName ?? null;
    } else if (event.media.url?.startsWith("http")) {
      const response = await fetch(event.media.url);
      if (!response.ok) throw new Error(`Evolution media download failed: ${response.status}`);
      body = Buffer.from(await response.arrayBuffer());
    }
    if (!body) return null;
    return this.mediaStorage.storeDownloaded({
      tenantId: event.tenantId,
      conversationId,
      body,
      mimeType: mimeType ?? defaultMimeType(event.type),
      fileName,
      messageType: event.type,
    });
  }
}

function resolveInboundMediaState(
  event: InboundMessageEvent,
  downloadedMedia: { objectKey: string } | null,
) {
  if (!event.media) return null;
  if (downloadedMedia?.objectKey) return MessageMediaState.READY;
  return event.media.url ? MessageMediaState.FAILED : MessageMediaState.PENDING;
}

function uniqueNormalizedPhones(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function mediaPreview(type: InboundMessageEvent["type"]) {
  if (type === "IMAGE") return "[imagem]";
  if (type === "AUDIO" || type === "VOICE") return "[audio]";
  if (type === "VIDEO") return "[video]";
  if (type === "DOCUMENT") return "[documento]";
  return "";
}

function defaultMimeType(type: InboundMessageEvent["type"]) {
  if (type === "IMAGE") return "image/jpeg";
  if (type === "AUDIO" || type === "VOICE") return "audio/ogg";
  if (type === "VIDEO") return "video/mp4";
  if (type === "DOCUMENT") return "application/octet-stream";
  return "application/octet-stream";
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}
