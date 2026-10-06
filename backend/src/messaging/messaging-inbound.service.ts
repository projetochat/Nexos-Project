import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { lockMessagingServiceState, MessagingServicePausedError } from "./service-availability";
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
import { InboundMessageEvent, MessageEditEvent, MessageDeletionEvent } from "./messaging.contracts";
import {
  maxSizeBytes,
  MessagingMediaStorageService,
} from "./media/messaging-media-storage.service";
import { downloadRemoteMedia } from "./media/remote-media-downloader";
import { normalizeRemotePhoneCandidates } from "./messaging-identity";
import { EvolutionClient } from "./evolution/evolution.client";
import { MessagingOutboundService } from "./messaging-outbound.service";
import { selectAutomaticReply } from "./automatic-reply";
import { conversationQueueForNotification } from "../conversations/conversation-queue-scope";
import { effectivePermissions } from "../auth/effective-permissions";
import { roleChatScopes } from "../auth/connection-access";
import { MESSAGE_CLOCK, type MessageClock, SYSTEM_MESSAGE_CLOCK } from "./message-clock";

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
    @Optional() @Inject(MESSAGE_CLOCK) private readonly messageClock?: MessageClock,
  ) {}

  async process(
    event: InboundMessageEvent,
    options: {
      historical?: boolean;
      suppressAutomaticReply?: boolean;
      requireMediaReady?: boolean;
    } = {},
  ) {
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
      await lockMessagingServiceState(tx, event.tenantId, event.connectionId);
      const connection = await tx.messagingConnection.findFirst({
        where: { id: event.connectionId, tenantId: event.tenantId },
      });
      if (!connection) throw new Error("Messaging connection not found for tenant.");
      if (connection.serviceEnabled === false) throw new MessagingServicePausedError();
      const groupDisplayName = isGroup
        ? await this.resolveGroupDisplayName(event, connection.externalReference)
        : null;

      const duplicateWhere = this.duplicateWhere(event, connection.ownerPhoneNormalized);
      const duplicate = await tx.message.findFirst({
        where: duplicateWhere,
      });
      if (duplicate) {
        if (
          options.requireMediaReady &&
          event.media &&
          (!duplicate.mediaStorageKey || duplicate.mediaState !== MessageMediaState.READY)
        ) {
          const stored = await this.downloadInboundMedia(
            event,
            duplicate.conversationId,
            connection.externalReference,
          );
          if (!stored) throw new Error("Mídia retida ainda não disponível para importação.");
          const repaired = await tx.message.update({
            where: { id: duplicate.id },
            data: {
              mediaStorageKey: stored.objectKey,
              mediaMimeType: stored.mimeType,
              mediaFileName: stored.fileName,
              mediaSize: stored.sizeBytes,
              mediaChecksum: stored.checksum,
              mediaState: MessageMediaState.READY,
            },
          });
          return { message: repaired, duplicate: true, mediaRepaired: true };
        }
        return { message: duplicate, duplicate: true };
      }

      const existingContact = await tx.contact.findFirst({
        where: {
          tenantId: event.tenantId,
          normalizedPhone: isGroup ? groupContactIdentity : { in: normalizedPhoneCandidates },
          archivedAt: null,
        },
        orderBy: { updatedAt: "desc" },
      });
      const contact = existingContact
        ? await tx.contact.update({
            where: { tenantId_id: { tenantId: event.tenantId, id: existingContact.id } },
            data: {
              phone: isGroup ? event.externalChatId : event.sender.phone,
              name: isGroup
                ? groupDisplayName && existingContact.name === "Grupo WhatsApp"
                  ? groupDisplayName
                  : existingContact.name
                : undefined,
              instance: connection.externalReference ?? existingContact.instance,
              instanceIds: Array.from(
                new Set([...(existingContact.instanceIds ?? []), connection.id]),
              ),
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
                  ? undefined
                  : (event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone),
              phone: isGroup ? event.externalChatId : event.sender.phone,
              instance: connection.externalReference,
              instanceIds: [connection.id],
              archivedAt: null,
            },
            create: {
              tenantId: event.tenantId,
              name: isGroup
                ? (groupDisplayName ?? "Grupo WhatsApp")
                : (event.metadata?.displayName ?? event.sender.displayName ?? event.sender.phone),
              phone: isGroup ? event.externalChatId : event.sender.phone,
              normalizedPhone: canonicalPhone,
              instance: connection.externalReference,
              instanceIds: [connection.id],
            },
          });

      const initialConversationDepartmentId = historical ? (contact.departmentId ?? null) : null;

      const conversationResult = await this.findOrCreateConversation(
        tx,
        event,
        contact,
        connection,
        groupDisplayName,
        historical,
        initialConversationDepartmentId,
      );
      let conversation = conversationResult.conversation;
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
        if (options.requireMediaReady) throw error;
        this.logger.warn({
          event: "messaging.media.inbound_download_failed",
          tenantId: event.tenantId,
          connectionId: event.connectionId,
          externalMessageId: event.externalMessageId,
          error: error instanceof Error ? error.message : "download failed",
        });
        return null;
      });
      if (options.requireMediaReady && event.media && !downloadedMedia) {
        throw new Error("Mídia retida ainda não disponível para importação.");
      }
      const canClearPendingResponse =
        !historical && event.fromMe && conversation.connectionId === event.connectionId;
      if (canClearPendingResponse) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "conversations"
          WHERE id = ${conversation.id} AND "tenantId" = ${event.tenantId}
          FOR UPDATE`;
        conversation = await tx.conversation.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: event.tenantId, id: conversation.id } },
        });
      }
      const latestInboundMessage = canClearPendingResponse
        ? await tx.message.findFirst({
            where: {
              tenantId: event.tenantId,
              conversationId: conversation.id,
              direction: MessageDirection.INBOUND,
            },
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
          })
        : null;
      const clearsPendingResponse =
        !!latestInboundMessage && event.occurredAt > latestInboundMessage.createdAt;
      if (clearsPendingResponse) {
        await tx.message.updateMany({
          where: {
            tenantId: event.tenantId,
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            readAt: null,
            createdAt: { lt: event.occurredAt },
          },
          data: { readAt: event.occurredAt },
        });
      }
      const message = await tx.message.create({
        data: {
          tenantId: event.tenantId,
          conversationId: conversation.id,
          connectionId: event.connectionId,
          direction: event.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
          type: event.type,
          status: event.fromMe ? MessageStatus.SENT : MessageStatus.CREATED,
          content: event.content ?? null,
          interactiveData:
            event.interactive || event.forwarded || event.sticker || event.linkPreview
              ? {
                  ...(event.interactive ?? {}),
                  ...(event.forwarded ? { forwarded: true } : {}),
                  ...(event.sticker ? { sticker: true } : {}),
                  ...(event.linkPreview ? { linkPreview: event.linkPreview } : {}),
                }
              : undefined,
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
      if (
        !historical &&
        !event.fromMe &&
        (createdConversation || conversation.status === ConversationStatus.FECHADA)
      ) {
        await tx.message.create({
          data: {
            tenantId: event.tenantId,
            conversationId: conversation.id,
            direction: MessageDirection.SYSTEM,
            type: MessageType.SYSTEM,
            content:
              createdConversation && !existingContact && !isGroup
                ? "Nova lead (passiva)"
                : "Nova conversa (passiva)",
            createdAt: new Date(event.occurredAt.getTime() - 1),
          },
        });
      }
      const messageIsOlder =
        conversation.lastMessageAt instanceof Date && conversation.lastMessageAt > event.occurredAt;
      const updatedConversation = await tx.conversation.update({
        where: { tenantId_id: { tenantId: event.tenantId, id: conversation.id } },
        include: { lead: { select: { status: true } } },
        data: {
          unreadCount: clearsPendingResponse
            ? 0
            : event.fromMe || historical
              ? conversation.unreadCount
              : { increment: 1 },
          lastMessagePreview: messageIsOlder
            ? conversation.lastMessagePreview
            : truncatePreview(preview),
          lastMessageAt: messageIsOlder ? conversation.lastMessageAt : event.occurredAt,
          inboxArchivedAt: historical
            ? conversation.inboxArchivedAt
            : isGroup
              ? null
              : conversation.inboxArchivedAt,
          assignedMembershipId:
            !historical && conversation.status === ConversationStatus.FECHADA
              ? null
              : conversation.assignedMembershipId,
          status:
            !historical && conversation.status === ConversationStatus.FECHADA
              ? ConversationStatus.ABERTA
              : conversation.status,
          protocol:
            !historical && conversation.status === ConversationStatus.FECHADA
              ? null
              : conversation.protocol,
          closedAt:
            !historical && conversation.status === ConversationStatus.FECHADA
              ? null
              : conversation.closedAt,
        },
      });
      const lead =
        !historical && createdConversation && !existingContact && !isGroup && !event.fromMe
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
              connectionId: updatedConversation.connectionId,
              departmentId: updatedConversation.departmentId,
              contactName: contact.name,
            })
          : [];
      const automaticReplyAt = (this.messageClock ?? SYSTEM_MESSAGE_CLOCK).now();
      const automaticReply =
        historical || options.suppressAutomaticReply
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
              at: automaticReplyAt,
            });
      const reply = automaticReply
        ? {
            ...automaticReply,
            attachment:
              automaticReply.kind === "welcome"
                ? storedAutomaticAttachment(
                    existingContact
                      ? connection.welcomeExistingAttachment
                      : connection.welcomeNewAttachment,
                  )
                : storedAutomaticAttachment(connection.absenceAttachment),
            contactExisting: Boolean(existingContact),
            effectiveAt: automaticReplyAt,
            contact,
            timezone: connection.timezone,
            departmentName: contact.contactDepartmentId
              ? ((
                  await tx.contactDepartment.findFirst({
                    where: {
                      id: contact.contactDepartmentId,
                      tenantId: event.tenantId,
                      archivedAt: null,
                    },
                    select: { name: true },
                  })
                )?.name ??
                contact.departmentName ??
                null)
              : (contact.departmentName ?? null),
            customerName: contact.customerId
              ? ((
                  await tx.customer.findFirst({
                    where: { id: contact.customerId, tenantId: event.tenantId, archivedAt: null },
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
        notificationQueue: conversationQueueForNotification({
          status: updatedConversation.status,
          assignedMembershipId: updatedConversation.assignedMembershipId,
          leadStatus: lead?.status ?? updatedConversation.lead?.status,
        }),
        notifications,
        unreadCount: updatedConversation.unreadCount,
        clearsPendingResponse,
        automaticReply: reply,
      };
    });

    if ("mediaRepaired" in result && result.mediaRepaired) {
      this.realtime?.publishConversationUpdated({
        tenantId: event.tenantId,
        conversationId: result.message.conversationId,
        reason: "message.media_ready",
      });
    }
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
        notificationQueue: result.notificationQueue,
      });
      if (profilePictureUpdated && result.contactId) {
        this.realtime?.publishContactUpdated({
          tenantId: event.tenantId,
          contactId: result.contactId,
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
          connectionId: notification.connectionId,
          kind: notification.kind,
        });
      }
      if (!event.fromMe || result.clearsPendingResponse) {
        this.realtime?.publishUnreadUpdated({
          tenantId: event.tenantId,
          conversationId: result.message.conversationId,
          unreadCount: result.unreadCount ?? 0,
        });
      }
      if (result.automaticReply && this.outbound) {
        try {
          const customFieldValues = await this.prisma.contactCustomFieldValue.findMany({
            where: {
              tenantId: event.tenantId,
              contactId: result.contactId!,
              field: { tenantId: event.tenantId, archivedAt: null },
            },
            include: {
              field: {
                select: { label: true, variableKey: true, type: true, mask: true },
              },
            },
          });
          const templateContext = {
            contactName: result.automaticReply.contact.name,
            phone: result.automaticReply.contact.phone,
            email: result.automaticReply.contact.email,
            instance: result.providerInstanceName,
            department: result.automaticReply.departmentName,
            customer: result.automaticReply.customerName,
            customFieldValues: customFieldValues.map((item) => ({
              label: item.field.label,
              variableKey: item.field.variableKey,
              type: item.field.type,
              mask: item.field.mask,
              value: item.value,
            })),
            now: result.automaticReply.effectiveAt,
            timezone: result.automaticReply.timezone,
          };
          if (result.automaticReply.attachment) {
            await this.outbound.queueAutomatedMedia({
              tenantId: event.tenantId,
              conversationId: result.conversationId,
              connectionId: event.connectionId,
              externalChatId: event.externalChatId,
              content: result.automaticReply.template,
              templateContext,
              kind: result.automaticReply.kind,
              attachment: result.automaticReply.attachment,
            });
          } else {
            await this.outbound.queueAutomatedText({
              tenantId: event.tenantId,
              conversationId: result.conversationId,
              connectionId: event.connectionId,
              externalChatId: event.externalChatId,
              content: result.automaticReply.template,
              templateContext,
              kind: result.automaticReply.kind,
            });
          }
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

  async processEdit(event: MessageEditEvent, options: { preserveLatestPreview?: boolean } = {}) {
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
    const latestMessage = options.preserveLatestPreview
      ? await this.prisma.message.findFirst({
          where: { tenantId: event.tenantId, conversationId: message.conversationId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        })
      : null;
    if (!options.preserveLatestPreview || latestMessage?.id === message.id) {
      await this.prisma.conversation.update({
        where: { tenantId_id: { tenantId: event.tenantId, id: message.conversationId } },
        data: {
          lastMessagePreview: truncatePreview(event.content),
          ...(!options.preserveLatestPreview ? { lastMessageAt: event.occurredAt } : {}),
        },
      });
    }
    this.realtime?.publishConversationUpdated({
      tenantId: event.tenantId,
      conversationId: message.conversationId,
      reason: "message.edited",
    });
    return { updated: true, messageId: message.id, conversationId: message.conversationId };
  }

  async processDeletion(event: MessageDeletionEvent) {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: event.tenantId,
        connectionId: event.connectionId,
        providerMessageId: event.providerMessageId,
      },
      select: { id: true, conversationId: true, interactiveData: true },
    });
    if (!message) return { updated: false, reason: "MESSAGE_NOT_FOUND" };
    const meta =
      message.interactiveData &&
      typeof message.interactiveData === "object" &&
      !Array.isArray(message.interactiveData)
        ? (message.interactiveData as Record<string, unknown>)
        : {};
    await this.prisma.message.update({
      where: { tenantId_id: { tenantId: event.tenantId, id: message.id } },
      data: {
        interactiveData: {
          ...meta,
          deletedForEveryone: true,
          deletedAt: event.occurredAt.toISOString(),
        },
        updatedAt: event.occurredAt,
      },
    });
    this.realtime?.publishConversationUpdated({
      tenantId: event.tenantId,
      conversationId: message.conversationId,
      reason: "message.deleted",
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
      OR: [
        { externalMessageId: event.externalMessageId },
        ...(event.fromMe ? [{ providerMessageId: event.externalMessageId }] : []),
      ],
    };
    if (!ownerPhoneNormalized) return exactConnection;
    return {
      tenantId: event.tenantId,
      AND: [
        {
          OR: [
            { externalMessageId: event.externalMessageId },
            ...(event.fromMe ? [{ providerMessageId: event.externalMessageId }] : []),
          ],
        },
        {
          OR: [
            { connectionId: event.connectionId },
            { connection: { is: { ownerPhoneNormalized } } },
          ],
        },
      ],
    };
  }

  private async findOrCreateConversation(
    tx: Prisma.TransactionClient,
    event: InboundMessageEvent,
    contact: { id: string; departmentId?: string | null },
    connection: { ownerPhoneNormalized: string | null },
    groupDisplayName?: string | null,
    historical = false,
    initialDepartmentId: string | null = contact.departmentId ?? null,
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
          departmentId: initialDepartmentId,
          status: historical ? ConversationStatus.FECHADA : ConversationStatus.ABERTA,
          closedAt: historical ? event.occurredAt : null,
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
        ...(historical ? {} : { status: { not: ConversationStatus.FECHADA } }),
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
          ...(historical ? {} : { status: { not: ConversationStatus.FECHADA } }),
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
        departmentId: initialDepartmentId,
        status: historical ? ConversationStatus.FECHADA : ConversationStatus.ABERTA,
        closedAt: historical ? event.occurredAt : null,
        unreadCount: 0,
        lastMessagePreview: null,
        lastMessageAt: null,
      },
    });
    return { conversation: created, created: true };
  }

  private async notifyLeadCreated(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      leadId: string;
      conversationId: string;
      connectionId: string | null;
      departmentId: string | null;
      contactName: string;
    },
  ) {
    const candidates = await tx.tenantMembership.findMany({
      where: {
        tenantId: input.tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        role: {
          select: {
            key: true,
            metadata: true,
            permissions: { select: { permissionId: true } },
          },
        },
      },
    });
    const recipients = candidates
      .filter(({ role }) => {
        if (role.key === "tenant_admin") return true;
        if (!effectivePermissions(role).includes("conversations.read")) return false;
        if (!input.connectionId) return false;
        const scope = roleChatScopes(role).find((item) => item.connectionId === input.connectionId);
        if (!scope) return false;
        return input.departmentId === null || scope.departmentIds.includes(input.departmentId);
      })
      .slice(0, 50);
    const uniqueRecipients = [...new Set(recipients.map((item) => item.id))];
    if (uniqueRecipients.length === 0) return [];

    await tx.notification.createMany({
      data: uniqueRecipients.map((membershipId) => ({
        tenantId: input.tenantId,
        membershipId,
        departmentId: input.departmentId,
        connectionId: input.connectionId,
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
      select: {
        id: true,
        membershipId: true,
        departmentId: true,
        connectionId: true,
        kind: true,
      },
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
    let body: Buffer | null = event.media.inlineBody ?? null;
    let mimeType = event.media.mimetype ?? null;
    let fileName = event.media.fileName ?? null;
    if (!body && this.evolution && providerConnectionRef && event.media.rawMessage) {
      const downloaded = await this.evolution.getBase64FromMediaMessage({
        instanceName: providerConnectionRef,
        message: event.media.rawMessage,
        maxBytes: maxSizeBytes(event.type),
      });
      body = downloaded.body;
      mimeType = mimeType ?? downloaded.mimeType ?? null;
      fileName = fileName ?? downloaded.fileName ?? null;
    } else if (!body && event.media.url?.startsWith("http")) {
      body = await downloadRemoteMedia(event.media.url, {
        maxBytes: maxSizeBytes(event.type),
      });
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

function storedAutomaticAttachment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const attachment = value as Record<string, unknown>;
  if (
    typeof attachment.fileName !== "string" ||
    typeof attachment.mimeType !== "string" ||
    typeof attachment.size !== "number" ||
    typeof attachment.dataUrl !== "string"
  ) {
    return null;
  }
  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  };
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
