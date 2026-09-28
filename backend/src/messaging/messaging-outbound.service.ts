import { connectionAccess, roleConnectionIds } from "../auth/connection-access";
import { effectivePermissions } from "../auth/effective-permissions";
import {
  assertMessagingServiceEnabled,
  MessagingServicePausedError,
  withMessagingServiceEnabled,
} from "./service-availability";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  ConversationStatus,
  ConversationType,
  MembershipStatus,
  MessageDirection,
  MessageMediaState,
  MessageReactionActorType,
  MessageStatus,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";

export class ScheduledMessagePermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledMessagePermanentError";
  }
}
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { SendMessageDto } from "../conversations/dto/send-message.dto";
import {
  OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
  type MessagingOutboundJob,
} from "../queue/messaging-outbound.queue";
import { OutboxDispatcherService } from "../queue/outbox-dispatcher.service";
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";
import {
  MessagingMediaStorageService,
  resolveMessageType,
} from "./media/messaging-media-storage.service";
import { EvolutionClient } from "./evolution/evolution.client";
import { EvolutionOutboundPayloadFactory } from "./evolution/evolution-outbound-payload.factory";
import { normalizeEvolutionRecipient } from "./evolution/evolution-recipient.normalizer";
import { SenderDisplayNameService } from "./sender-display-name.service";
import { resolveMessageTemplate } from "./message-template";
import { outboundMessageOrigin } from "./message-origin";

const messageInclude = {
  authorMembership: {
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
  },
  reactions: true,
  quotedMessage: {
    select: {
      direction: true,
      participantName: true,
      interactiveData: true,
      authorMembership: {
        select: {
          presentationName: true,
          user: { select: { name: true } },
        },
      },
      mediaStorageKey: true,
      mediaMimeType: true,
      mediaFileName: true,
      mediaSize: true,
      mediaCaption: true,
      mediaWidth: true,
      mediaHeight: true,
      mediaChecksum: true,
      mediaState: true,
      mediaDurationMs: true,
    },
  },
} satisfies Prisma.MessageInclude;

const dispatchInclude = {
  conversation: {
    include: {
      contact: true,
      connection: true,
    },
  },
  quotedMessage: {
    select: {
      providerMessageId: true,
      providerChatId: true,
      direction: true,
      providerParticipantId: true,
    },
  },
} satisfies Prisma.MessageInclude;

const DISPATCHABLE_STATUSES = [MessageStatus.CREATED, MessageStatus.QUEUED] as const;

type DbClient = PrismaService | Prisma.TransactionClient;
type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type PreparedOutbound =
  | { dispatch: false; message: MessageWithRelations }
  | { dispatch: true; message: MessageWithRelations };

@Injectable()
export class MessagingOutboundService {
  private readonly logger = new Logger(MessagingOutboundService.name);
  private readonly evolutionPayloads = new EvolutionOutboundPayloadFactory();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MessagingProviderRegistry)
    private readonly providers: MessagingProviderRegistry,
    @Inject(OutboxDispatcherService)
    private readonly outboxDispatcher: OutboxDispatcherService,
    @Optional()
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage?: MessagingMediaStorageService,
    @Optional()
    @Inject(EvolutionClient)
    private readonly evolution?: EvolutionClient,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
    @Optional()
    @Inject(SenderDisplayNameService)
    private readonly senderDisplayName?: SenderDisplayNameService,
  ) {}

  async sendText(conversationId: string, dto: SendMessageDto, current: AuthenticatedUser) {
    const originalContent = cleanMessageContent(dto.content);
    const conversation = await this.findVisibleConversation(this.prisma, conversationId, current, {
      contact: true,
      connection: true,
    });
    this.assertCanSend(conversation);

    const prepared: PreparedOutbound = await this.prisma.$transaction(async (tx) => {
      if (dto.clientMessageId) {
        const existing = await tx.message.findFirst({
          where: {
            tenantId: current.tenantId,
            conversationId,
            clientMessageId: dto.clientMessageId,
          },
          include: messageInclude,
        });
        if (existing) return { message: existing, dispatch: false };
      }

      const connection = await this.resolveConnection(tx, current.tenantId, conversation);
      const content = await this.prepareOutboundText(tx, originalContent, conversation, current);
      const quoted = dto.quotedMessageId
        ? await this.resolveQuotedMessage(tx, {
            tenantId: current.tenantId,
            conversationId,
            quotedMessageId: dto.quotedMessageId,
          })
        : null;
      const now = new Date();
      const message = await tx.message.create({
        data: {
          tenantId: current.tenantId,
          conversationId,
          connectionId: connection.id,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          authorMembershipId: current.membershipId,
          content,
          providerChatId: conversation.externalChatId,
          quotedMessageId: quoted?.id ?? null,
          quotedProviderMessageId: quoted?.providerMessageId ?? null,
          quotedContentPreview: quoted ? previewFromMessage(quoted) : null,
          quotedMessageType: quoted?.type ?? null,
          clientMessageId: dto.clientMessageId?.trim() || null,
          queuedAt: now,
          createdAt: now,
        },
        include: messageInclude,
      });
      const job: MessagingOutboundJob = { tenantId: current.tenantId, messageId: message.id };
      await tx.outboxEvent.create({
        data: {
          tenantId: current.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: message.id,
          payload: job,
        },
      });
      await this.updateConversationFromMessage(tx, conversationId, current.tenantId, content, now);
      return { message, dispatch: true };
    });

    if (prepared.dispatch) {
      this.realtime?.publishMessageCreated({
        tenantId: prepared.message.tenantId,
        conversationId: prepared.message.conversationId,
        connectionId: prepared.message.connectionId,
        message: this.serialize(prepared.message),
      });
      this.realtime?.publishConversationUpdated({
        tenantId: prepared.message.tenantId,
        conversationId: prepared.message.conversationId,
        reason: "outbound.queued",
      });
      void this.outboxDispatcher.dispatchMessage(prepared.message.id).catch((error) => {
        this.logger.warn({
          event: "outbox.messaging_outbound.immediate_dispatch_failed",
          tenantId: prepared.message.tenantId,
          messageId: prepared.message.id,
          error: error instanceof Error ? error.message : "Outbox dispatch failed.",
        });
      });
    }
    return this.serialize(prepared.message);
  }

  /** Queues a system-configured message (welcome/absence) without an agent author. */
  async queueAutomatedText(input: {
    tenantId: string;
    conversationId: string;
    connectionId: string;
    externalChatId: string;
    content: string;
    kind: "welcome" | "absence";
  }) {
    const content = cleanMessageContent(input.content);
    const prepared: PreparedOutbound = await this.prisma.$transaction(async (tx) => {
      const clientMessageId = `automatic:${input.kind}`;
      const existing = await tx.message.findFirst({
        where: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          clientMessageId,
        },
        include: messageInclude,
      });
      if (existing) return { message: existing, dispatch: false };

      const now = new Date();
      const message = await tx.message.create({
        data: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          connectionId: input.connectionId,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          content,
          providerChatId: input.externalChatId,
          clientMessageId,
          providerStatus: `${input.kind}_queued`,
          queuedAt: now,
          createdAt: now,
        },
        include: messageInclude,
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: message.id,
          payload: { tenantId: input.tenantId, messageId: message.id },
        },
      });
      await this.updateConversationFromMessage(
        tx,
        input.conversationId,
        input.tenantId,
        content,
        now,
      );
      return { message, dispatch: true };
    });

    if (!prepared.dispatch) return { created: false, message: this.serialize(prepared.message) };
    this.realtime?.publishMessageCreated({
      tenantId: prepared.message.tenantId,
      conversationId: prepared.message.conversationId,
      connectionId: prepared.message.connectionId,
      message: this.serialize(prepared.message),
    });
    this.realtime?.publishConversationUpdated({
      tenantId: prepared.message.tenantId,
      conversationId: prepared.message.conversationId,
      reason: `${input.kind}.queued`,
    });
    void this.outboxDispatcher.dispatchMessage(prepared.message.id).catch((error) => {
      this.logger.warn({
        event: `messaging.${input.kind}.immediate_dispatch_failed`,
        tenantId: input.tenantId,
        messageId: prepared.message.id,
        error: error instanceof Error ? error.message : "Outbox dispatch failed.",
      });
    });
    return { created: true, message: this.serialize(prepared.message) };
  }

  /** Queues an automatic message with its configured media as the message caption. */
  async queueAutomatedMedia(input: {
    tenantId: string;
    conversationId: string;
    connectionId: string;
    externalChatId: string;
    content: string;
    kind: "welcome" | "absence";
    attachment: { fileName: string; mimeType: string; size: number; dataUrl: string };
  }) {
    if (!this.mediaStorage) throw new BadRequestException("Storage de mensagens indisponivel.");
    const clientMessageId = `automatic:${input.kind}`;
    const existing = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        clientMessageId,
      },
      include: messageInclude,
    });
    if (existing) return { created: false, message: this.serialize(existing) };

    const [, encoded = ""] = input.attachment.dataUrl.split(",");
    const body = Buffer.from(encoded, "base64");
    const messageType = resolveMessageType(input.attachment.mimeType, "");
    const stored = await this.mediaStorage.storeDownloaded({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      body,
      mimeType: input.attachment.mimeType,
      fileName: input.attachment.fileName,
      messageType,
    });
    const caption = cleanMessageContent(input.content);
    const now = new Date();
    const preview = mediaPreview(messageType, caption, stored.fileName);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          connectionId: input.connectionId,
          direction: MessageDirection.OUTBOUND,
          type: messageType,
          status: MessageStatus.QUEUED,
          content: caption,
          providerChatId: input.externalChatId,
          clientMessageId,
          providerStatus: `${input.kind}_queued`,
          mediaStorageKey: stored.objectKey,
          mediaMimeType: stored.mimeType,
          mediaFileName: stored.fileName,
          mediaSize: stored.sizeBytes,
          mediaCaption: caption,
          mediaChecksum: stored.checksum,
          mediaSha256: stored.checksum,
          mediaState: MessageMediaState.READY,
          queuedAt: now,
          createdAt: now,
        },
        include: messageInclude,
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: created.id,
          payload: { tenantId: input.tenantId, messageId: created.id },
        },
      });
      await this.updateConversationFromMessage(
        tx,
        input.conversationId,
        input.tenantId,
        preview,
        now,
      );
      return created;
    });

    this.realtime?.publishMessageCreated({
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      connectionId: message.connectionId,
      message: this.serialize(message),
    });
    this.realtime?.publishConversationUpdated({
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      reason: `${input.kind}.queued`,
    });
    void this.outboxDispatcher.dispatchMessage(message.id).catch((error) => {
      this.logger.warn({
        event: `messaging.${input.kind}.immediate_dispatch_failed`,
        tenantId: input.tenantId,
        messageId: message.id,
        error: error instanceof Error ? error.message : "Outbox dispatch failed.",
      });
    });
    return { created: true, message: this.serialize(message) };
  }

  /** Materializes one claimed, conversation-bound schedule into the durable outbound pipeline. */
  async queueScheduledMessage(input: {
    tenantId: string;
    scheduleId: string;
    claimedVersion: number;
    occurrenceAt: Date;
    conversationId: string;
    createdByMembershipId: string | null;
    content: string;
    attachment?: { fileName: string; mimeType: string; size: number; dataUrl: string } | null;
  }) {
    const clientMessageId = `schedule:${input.scheduleId}:${input.occurrenceAt.toISOString()}`;
    const existing = await this.prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: input.conversationId, clientMessageId },
      include: messageInclude,
    });
    if (existing) {
      await this.linkClaimedSchedule(input, existing.id);
      return { created: false, message: this.serialize(existing) };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId, archivedAt: null },
      include: {
        contact: {
          include: {
            customer: { select: { name: true } },
            customFieldValues: { include: { field: { select: { label: true } } } },
          },
        },
        connection: true,
        department: { select: { name: true } },
      },
    });
    if (!conversation) {
      throw new ScheduledMessagePermanentError("Conversa não encontrada para o agendamento.");
    }
    try {
      this.assertCanSend(conversation);
    } catch (error) {
      throw new ScheduledMessagePermanentError(errorMessage(error));
    }
    if (!conversation.connection || conversation.connection.archivedAt) {
      throw new ScheduledMessagePermanentError("Instância indisponível para o agendamento.");
    }
    assertMessagingServiceEnabled(conversation.connection);
    const templatedContent = resolveMessageTemplate(input.content, {
      contactName: conversation.contact.name,
      phone: conversation.contact.phone,
      email: conversation.contact.email,
      instance: conversation.connection.name,
      department: conversation.department?.name ?? conversation.contact.departmentName,
      customer: conversation.contact.customer?.name,
      customFields: Object.fromEntries(
        conversation.contact.customFieldValues.map((item) => [item.field.label, item.value]),
      ),
      now: input.occurrenceAt,
    });
    const resolvedContent = templatedContent.trim()
      ? cleanMessageContent(templatedContent)
      : input.attachment
        ? ""
        : cleanMessageContent(templatedContent);

    const authorMembership = input.createdByMembershipId
      ? await this.prisma.tenantMembership.findFirst({
          where: {
            id: input.createdByMembershipId,
            tenantId: input.tenantId,
            status: MembershipStatus.ACTIVE,
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
        })
      : null;
    if (input.createdByMembershipId && !authorMembership) {
      throw new ScheduledMessagePermanentError(
        "O criador do agendamento não possui mais um vínculo ativo.",
      );
    }
    const authorPermissions = authorMembership ? effectivePermissions(authorMembership.role) : [];
    const allowedConnectionIds = authorMembership ? roleConnectionIds(authorMembership.role) : null;
    if (
      authorMembership &&
      allowedConnectionIds !== null &&
      !allowedConnectionIds.includes(conversation.connection.id)
    ) {
      throw new ScheduledMessagePermanentError(
        "O criador não possui mais acesso à instância deste agendamento.",
      );
    }

    let stored: Awaited<ReturnType<MessagingMediaStorageService["storeDownloaded"]>> | undefined;
    let messageType: MessageType = MessageType.TEXT;
    if (input.attachment) {
      if (!this.mediaStorage) throw new BadRequestException("Storage de mensagens indisponivel.");
      const [, encoded = ""] = input.attachment.dataUrl.split(",");
      const body = Buffer.from(encoded, "base64");
      messageType = resolveMessageType(input.attachment.mimeType, "");
      if (
        (messageType === MessageType.VOICE || messageType === MessageType.AUDIO) &&
        !authorPermissions.includes("chat.audio.send")
      ) {
        throw new ScheduledMessagePermanentError(
          "O criador não possui permissão para enviar mensagens de áudio.",
        );
      }
      stored = await this.mediaStorage.storeDownloaded({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        body,
        mimeType: input.attachment.mimeType,
        fileName: input.attachment.fileName,
        messageType,
      });
    }

    let prepared: PreparedOutbound;
    try {
      prepared = await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.message.findFirst({
          where: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            clientMessageId,
          },
          include: messageInclude,
        });
        if (duplicate) {
          const linked = await tx.schedule.updateMany({
            where: {
              tenantId: input.tenantId,
              id: input.scheduleId,
              executionStatus: "CLAIMED",
              version: input.claimedVersion,
            },
            data: {
              executionStatus: "QUEUED",
              messageId: duplicate.id,
              claimedAt: null,
              lastError: null,
              version: { increment: 1 },
            },
          });
          if (linked.count !== 1)
            throw new Error("Schedule claim was lost before materialization.");
          return { message: duplicate, dispatch: false };
        }

        const connection = await this.resolveConnection(tx, input.tenantId, conversation);
        const content =
          resolvedContent && authorMembership && authorPermissions.includes("chat.agent_name.show")
            ? await this.prepareScheduledOutboundText(tx, resolvedContent, {
                tenantId: input.tenantId,
                membershipId: authorMembership.id,
                roleKey: authorMembership.role.key,
              })
            : resolvedContent;
        const now = new Date();
        const preview = stored ? mediaPreview(messageType, content, stored.fileName) : content;
        const message = await tx.message.create({
          data: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            connectionId: connection.id,
            direction: MessageDirection.OUTBOUND,
            type: messageType,
            status: MessageStatus.QUEUED,
            authorMembershipId: authorMembership?.id ?? null,
            content,
            providerChatId: conversation.externalChatId,
            clientMessageId,
            providerStatus: "scheduled_queued",
            interactiveData: { scheduleId: input.scheduleId },
            mediaStorageKey: stored?.objectKey,
            mediaMimeType: stored?.mimeType,
            mediaFileName: stored?.fileName,
            mediaSize: stored?.sizeBytes,
            mediaCaption: stored ? content : null,
            mediaChecksum: stored?.checksum,
            mediaSha256: stored?.checksum,
            mediaState: stored ? MessageMediaState.READY : null,
            queuedAt: now,
            createdAt: now,
          },
          include: messageInclude,
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: input.tenantId,
            type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
            aggregateId: message.id,
            payload: { tenantId: input.tenantId, messageId: message.id },
          },
        });
        const linked = await tx.schedule.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.scheduleId,
            executionStatus: "CLAIMED",
            version: input.claimedVersion,
          },
          data: {
            executionStatus: "QUEUED",
            messageId: message.id,
            claimedAt: null,
            lastError: null,
            version: { increment: 1 },
          },
        });
        if (linked.count !== 1) throw new Error("Schedule claim was lost before materialization.");
        await this.updateConversationFromMessage(
          tx,
          input.conversationId,
          input.tenantId,
          preview,
          now,
        );
        return { message, dispatch: true };
      });
    } catch (error) {
      if (stored && this.mediaStorage) {
        await this.mediaStorage.deleteObject(stored.objectKey).catch(() => undefined);
      }
      throw error;
    }

    if (prepared.dispatch) {
      this.realtime?.publishMessageCreated({
        tenantId: prepared.message.tenantId,
        conversationId: prepared.message.conversationId,
        connectionId: prepared.message.connectionId,
        message: this.serialize(prepared.message),
      });
      this.realtime?.publishConversationUpdated({
        tenantId: prepared.message.tenantId,
        conversationId: prepared.message.conversationId,
        reason: "schedule.queued",
      });
      void this.outboxDispatcher.dispatchMessage(prepared.message.id).catch((error) => {
        this.logger.warn({
          event: "messaging.schedule.immediate_dispatch_failed",
          tenantId: input.tenantId,
          scheduleId: input.scheduleId,
          messageId: prepared.message.id,
          error: error instanceof Error ? error.message : "Outbox dispatch failed.",
        });
      });
    }
    return { created: prepared.dispatch, message: this.serialize(prepared.message) };
  }

  async sendMedia(conversationId: string, req: Request, current: AuthenticatedUser) {
    const conversation = await this.findVisibleConversation(this.prisma, conversationId, current, {
      contact: true,
      connection: true,
    });
    this.assertCanSend(conversation);
    if (!this.mediaStorage) throw new BadRequestException("Storage de mensagens indisponivel.");
    const requestedMediaType = resolveMessageType(
      header(req, "content-type").split(";")[0].trim().toLowerCase(),
      header(req, "x-media-type"),
    );
    if (
      (requestedMediaType === MessageType.VOICE || requestedMediaType === MessageType.AUDIO) &&
      !current.permissions?.includes("chat.audio.send")
    ) {
      throw new ForbiddenException("Sem permissão para enviar mensagens de áudio.");
    }
    const stored = await this.mediaStorage.storeUpload({
      tenantId: current.tenantId,
      conversationId,
      req,
    });
    const clientMessageId = header(req, "x-client-message-id") || null;
    const quotedMessageId = header(req, "x-quoted-message-id") || null;

    const prepared: PreparedOutbound = await this.prisma.$transaction(async (tx) => {
      if (clientMessageId) {
        const existing = await tx.message.findFirst({
          where: { tenantId: current.tenantId, conversationId, clientMessageId },
          include: messageInclude,
        });
        if (existing) return { message: existing, dispatch: false };
      }
      const connection = await this.resolveConnection(tx, current.tenantId, conversation);
      const caption = stored.caption
        ? await this.prepareOutboundText(tx, stored.caption, conversation, current)
        : stored.caption;
      const quoted = quotedMessageId
        ? await this.resolveQuotedMessage(tx, {
            tenantId: current.tenantId,
            conversationId,
            quotedMessageId,
          })
        : null;
      const now = new Date();
      const preview = mediaPreview(stored.messageType, caption, stored.fileName);
      const message = await tx.message.create({
        data: {
          tenantId: current.tenantId,
          conversationId,
          connectionId: connection.id,
          direction: MessageDirection.OUTBOUND,
          type: stored.messageType,
          status: MessageStatus.QUEUED,
          authorMembershipId: current.membershipId,
          content: caption,
          providerChatId: conversation.externalChatId,
          quotedMessageId: quoted?.id ?? null,
          quotedProviderMessageId: quoted?.providerMessageId ?? null,
          quotedContentPreview: quoted ? previewFromMessage(quoted) : null,
          quotedMessageType: quoted?.type ?? null,
          clientMessageId: clientMessageId?.trim() || null,
          mediaStorageKey: stored.objectKey,
          mediaMimeType: stored.mimeType,
          mediaFileName: stored.fileName,
          mediaSize: stored.sizeBytes,
          mediaCaption: caption,
          mediaChecksum: stored.checksum,
          mediaSha256: stored.checksum,
          mediaDurationMs: stored.durationMs,
          mediaState: MessageMediaState.READY,
          queuedAt: now,
          createdAt: now,
        },
        include: messageInclude,
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: current.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: message.id,
          payload: { tenantId: current.tenantId, messageId: message.id },
        },
      });
      await this.updateConversationFromMessage(tx, conversationId, current.tenantId, preview, now);
      return { message, dispatch: true };
    });

    if (prepared.dispatch) {
      this.realtime?.publishMessageCreated({
        tenantId: prepared.message.tenantId,
        conversationId: prepared.message.conversationId,
        connectionId: prepared.message.connectionId,
        message: this.serialize(prepared.message),
      });
      void this.outboxDispatcher.dispatchMessage(prepared.message.id).catch((error) => {
        this.logger.warn({
          event: "outbox.messaging_media.immediate_dispatch_failed",
          tenantId: prepared.message.tenantId,
          messageId: prepared.message.id,
          error: error instanceof Error ? error.message : "Outbox dispatch failed.",
        });
      });
    }
    return this.serialize(prepared.message);
  }

  async dispatchQueuedMessage(input: {
    tenantId: string;
    messageId: string;
    attempt: number;
    finalAttempt: boolean;
  }) {
    const message = await this.prisma.message.findFirst({
      where: { id: input.messageId, tenantId: input.tenantId },
      include: dispatchInclude,
    });
    if (!message) {
      throw new OutboundDispatchError(
        MessagingErrorCode.DELIVERY_REJECTED,
        "Message not found for outbound dispatch.",
        false,
      );
    }
    if (message.direction !== MessageDirection.OUTBOUND) {
      await this.failMessage(message.id, input.tenantId, {
        code: MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        message: "Invalid message type for outbound dispatch.",
      });
      throw new OutboundDispatchError(
        MessagingErrorCode.UNSUPPORTED_MESSAGE_TYPE,
        "Invalid message type for outbound dispatch.",
        false,
      );
    }
    if (
      message.status === MessageStatus.SENT ||
      message.status === MessageStatus.DELIVERED ||
      message.status === MessageStatus.READ
    ) {
      return { skipped: true, status: message.status };
    }
    if (message.status === MessageStatus.SENDING) {
      return { skipped: true, status: message.status };
    }
    if (message.status === MessageStatus.FAILED) {
      throw new OutboundDispatchError(
        MessagingErrorCode.DELIVERY_REJECTED,
        "Message is already failed and needs an explicit retry rule.",
        false,
      );
    }

    const connection = message.conversation.connection;
    if (!connection || connection.id !== message.connectionId) {
      await this.failMessage(message.id, input.tenantId, {
        code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
        message: "Messaging connection not found for outbound dispatch.",
      });
      throw new OutboundDispatchError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Messaging connection not found for outbound dispatch.",
        false,
      );
    }
    if (connection.serviceEnabled === false) {
      return { skipped: true, status: message.status, reason: "SERVICE_PAUSED" };
    }
    if (
      connection.status !== MessagingConnectionStatus.CONNECTED &&
      this.evolution &&
      connection.externalReference
    ) {
      try {
        const state = await this.evolution.connectionState(connection.externalReference);
        const providerState = String(
          state.instance?.state ?? state.instance?.status ?? "",
        ).toLowerCase();
        if (providerState === "open" || providerState === "connected") {
          await this.prisma.messagingConnection.update({
            where: { id: connection.id },
            data: { status: MessagingConnectionStatus.CONNECTED },
          });
          connection.status = MessagingConnectionStatus.CONNECTED;
        }
      } catch {
        // Keep the persisted status and return the normal connection error below.
      }
    }
    if (connection.status !== MessagingConnectionStatus.CONNECTED) {
      const failed = await this.failMessage(message.id, input.tenantId, {
        code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
        message: "Messaging connection is not connected.",
      });
      this.publishStatus(
        message,
        MessageStatus.FAILED,
        message.status,
        failed?.updatedAt ?? new Date(),
        failed?.providerErrorCode,
      );
      throw new OutboundDispatchError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Messaging connection is not connected.",
        false,
      );
    }

    const predecessor = await this.findPendingPredecessor(message);
    if (predecessor) {
      throw new OutboundDispatchError(
        MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
        "Conversation predecessor is still pending.",
        true,
      );
    }

    const claim = await this.prisma.message.updateMany({
      where: {
        id: message.id,
        tenantId: input.tenantId,
        status: { in: [...DISPATCHABLE_STATUSES] },
      },
      data: {
        status: MessageStatus.SENDING,
        sendAttempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claim.count !== 1) {
      const current = await this.prisma.message.findFirst({
        where: { id: message.id, tenantId: input.tenantId },
        select: { status: true },
      });
      return { skipped: true, status: current?.status ?? message.status };
    }
    this.publishStatus(message, MessageStatus.SENDING, message.status, new Date());

    const provider = this.providers.resolve(connection.providerType);
    this.providers.assertSupports(provider, message.type);
    if (message.mediaStorageKey && !this.mediaStorage) {
      throw new OutboundDispatchError(
        MessagingErrorCode.PROVIDER_UNAVAILABLE,
        "Messaging media storage is unavailable.",
        true,
      );
    }
    const mediaBuffer = message.mediaStorageKey
      ? await this.mediaStorage?.readObject(message.mediaStorageKey)
      : undefined;

    try {
      this.logger.log({
        event: "messaging.outbound.provider_request",
        tenantId: input.tenantId,
        messageId: message.id,
        conversationId: message.conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        instanceName: maskReference(connection.externalReference),
        endpointPath: providerEndpointPath(connection.providerType, message.type),
        method: "POST",
        messageType: message.type,
        attempt: input.attempt,
      });
      const startedAt = Date.now();
      const mentions = await this.resolveMentionTargets(
        input.tenantId,
        message.conversationId,
        message.type === MessageType.TEXT
          ? (message.content ?? "")
          : (message.mediaCaption ?? message.content ?? ""),
      );
      const currentConnection = await this.prisma.messagingConnection.findFirst({
        where: { id: connection.id, tenantId: input.tenantId },
        select: { serviceEnabled: true },
      });
      if (!currentConnection) throw new Error("Messaging connection no longer exists.");
      if (currentConnection.serviceEnabled === false) {
        await this.prisma.message.updateMany({
          where: { id: message.id, tenantId: input.tenantId, status: MessageStatus.SENDING },
          data: { status: MessageStatus.QUEUED, sendAttempts: { decrement: 1 } },
        });
        this.publishStatus(message, MessageStatus.QUEUED, MessageStatus.SENDING, new Date());
        return { skipped: true, status: MessageStatus.QUEUED, reason: "SERVICE_PAUSED" };
      }
      const result = await withMessagingServiceEnabled(
        this.prisma,
        input.tenantId,
        connection.id,
        () =>
          provider.send({
            tenantId: input.tenantId,
            conversationId: message.conversationId,
            messageId: message.id,
            connectionId: connection.id,
            providerConnectionRef: connection.externalReference,
            providerType: connection.providerType,
            recipient: {
              phone: message.conversation.contact.phone,
              normalizedPhone: message.conversation.contact.normalizedPhone,
              displayName: message.conversation.contact.name,
            },
            externalChatId:
              message.conversation.conversationType === ConversationType.GROUP
                ? message.conversation.externalChatId
                : null,
            content:
              message.type === MessageType.TEXT
                ? { type: MessageType.TEXT, text: message.content ?? "" }
                : {
                    type: message.type as Extract<
                      MessageType,
                      "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT"
                    >,
                    text: message.content,
                    mediaRef: message.mediaStorageKey,
                    mediaBuffer,
                    mimeType: message.mediaMimeType,
                    fileName: message.mediaFileName,
                    caption: message.mediaCaption,
                  },
            clientMessageId: message.clientMessageId,
            quotedProviderMessageId: message.quotedProviderMessageId,
            quotedProviderChatId: message.quotedMessage?.providerChatId ?? null,
            quotedFromMe:
              message.quotedMessage?.direction === undefined
                ? null
                : message.quotedMessage.direction === MessageDirection.OUTBOUND,
            quotedParticipant: message.quotedMessage?.providerParticipantId ?? null,
            mentions,
          }),
      );
      if (result.accepted && !result.providerMessageId) {
        throw new MessagingProviderError(
          MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
          "Messaging provider accepted the request without a provider message id.",
          true,
        );
      }

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: result.accepted ? MessageStatus.SENT : MessageStatus.FAILED,
          providerMessageId: result.providerMessageId ?? null,
          providerStatus: result.providerStatus ?? null,
          providerAcceptedAt: result.providerTimestamp ?? null,
          sentAt: result.accepted ? (result.providerTimestamp ?? new Date()) : null,
          failedAt: result.accepted ? null : new Date(),
          providerErrorCode: result.accepted ? null : MessagingErrorCode.DELIVERY_REJECTED,
          providerErrorMessage: result.accepted ? null : "Messaging provider rejected dispatch.",
        },
      });
      this.logger.log({
        event: "messaging.outbound.provider_response",
        tenantId: input.tenantId,
        messageId: updated.id,
        conversationId: message.conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        providerStatus: result.providerStatus,
        providerMessageIdPresent: !!result.providerMessageId,
        durationMs: Date.now() - startedAt,
      });
      this.publishStatus(
        message,
        updated.status,
        MessageStatus.SENDING,
        updated.updatedAt,
        updated.providerErrorCode,
      );
      this.logger.log({
        event: "messaging.outbound.sent",
        tenantId: input.tenantId,
        messageId: updated.id,
        conversationId: message.conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        attempt: input.attempt,
        result: updated.status,
      });
      return { skipped: false, status: updated.status };
    } catch (error) {
      if (error instanceof MessagingServicePausedError) {
        await this.prisma.message.updateMany({
          where: { id: message.id, tenantId: input.tenantId, status: MessageStatus.SENDING },
          data: { status: MessageStatus.QUEUED, sendAttempts: { decrement: 1 } },
        });
        this.publishStatus(message, MessageStatus.QUEUED, MessageStatus.SENDING, new Date());
        return { skipped: true, status: MessageStatus.QUEUED, reason: "SERVICE_PAUSED" };
      }
      const canonical = canonicalProviderError(error);
      if (!canonical.retryable || input.finalAttempt) {
        const failed = await this.failMessage(message.id, input.tenantId, canonical);
        this.publishStatus(
          message,
          MessageStatus.FAILED,
          message.status,
          failed?.updatedAt ?? new Date(),
          failed?.providerErrorCode,
        );
      } else {
        const queued = await this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.QUEUED,
            providerErrorCode: canonical.code,
            providerErrorMessage: sanitizeErrorMessage(canonical.message),
          },
        });
        this.publishStatus(
          message,
          MessageStatus.QUEUED,
          MessageStatus.SENDING,
          queued?.updatedAt ?? new Date(),
          queued?.providerErrorCode,
        );
      }
      this.logger.warn({
        event:
          input.finalAttempt || !canonical.retryable
            ? "messaging.outbound.failed_final"
            : "messaging.outbound.retry_scheduled",
        tenantId: input.tenantId,
        messageId: message.id,
        conversationId: message.conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        instanceName: maskReference(connection.externalReference),
        endpointPath:
          canonical.endpointPath ?? providerEndpointPath(connection.providerType, message.type),
        method: canonical.method ?? "POST",
        providerStatus: canonical.httpStatus,
        providerCode: canonical.providerCode,
        providerMessage: sanitizeErrorMessage(canonical.message),
        messageType: message.type,
        attempt: input.attempt,
        maxAttempts: input.finalAttempt ? input.attempt : undefined,
        retryable: canonical.retryable,
        unknownOutcome: canonical.unknownOutcome,
        result: input.finalAttempt || !canonical.retryable ? "failed" : "retrying",
        errorCode: canonical.code,
      });
      throw new OutboundDispatchError(
        canonical.code,
        canonical.message,
        canonical.retryable,
        canonical.httpStatus,
        canonical.providerCode,
        sanitizeErrorMessage(canonical.message),
        canonical.endpointPath,
        canonical.method,
        canonical.unknownOutcome,
      );
    }
  }

  async react(
    conversationId: string,
    messageId: string,
    emoji: string | null,
    current: AuthenticatedUser,
  ) {
    const cleanEmoji = sanitizeReaction(emoji);
    const message = await this.prisma.message.findFirst({
      where: { tenantId: current.tenantId, conversationId, id: messageId },
      include: { conversation: { include: { connection: true, contact: true } } },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada.");
    if (!message.providerMessageId) {
      throw new BadRequestException({
        statusCode: 422,
        code: "MESSAGE_PROVIDER_ID_MISSING",
        message: "Mensagem ainda não possui ID do provedor.",
      });
    }
    const connection = message.conversation.connection;
    assertMessagingServiceEnabled(connection);
    if (
      !connection?.externalReference ||
      connection.status !== MessagingConnectionStatus.CONNECTED
    ) {
      throw new BadRequestException("Connection WhatsApp indisponivel.");
    }

    if (!this.evolution) throw new BadRequestException("Provider de reactions indisponivel.");
    await withMessagingServiceEnabled(this.prisma, current.tenantId, connection.id, () =>
      this.evolution!.sendReaction({
        instanceName: connection.externalReference!,
        payload: this.evolutionPayloads.reaction({
          key: this.evolutionPayloads.quotedKey({
            remoteJid:
              message.providerChatId ??
              normalizeEvolutionRecipient({
                conversationType: message.conversation.conversationType,
                externalChatId: message.conversation.externalChatId,
                normalizedPhone: message.conversation.contact.normalizedPhone,
              }).remoteJid,
            fromMe: message.direction === MessageDirection.OUTBOUND,
            id: message.providerMessageId,
            participant: message.providerParticipantId,
          }),
          reaction: cleanEmoji ?? "",
        }),
      }),
    );
    const reaction = await this.prisma.messageReaction.upsert({
      where: {
        tenantId_messageId_actorType_actorMembershipId_externalParticipantId: {
          tenantId: current.tenantId,
          messageId,
          actorType: MessageReactionActorType.TRIXUS_USER,
          actorMembershipId: current.membershipId,
          externalParticipantId: "",
        },
      },
      update: {
        emoji: cleanEmoji ?? "",
        removedAt: cleanEmoji ? null : new Date(),
      },
      create: {
        tenantId: current.tenantId,
        messageId,
        emoji: cleanEmoji ?? "",
        actorType: MessageReactionActorType.TRIXUS_USER,
        actorMembershipId: current.membershipId,
        externalParticipantId: "",
        removedAt: cleanEmoji ? null : new Date(),
      },
    });
    this.realtime?.publishMessageReactionUpdated({
      tenantId: current.tenantId,
      conversationId,
      messageId,
      reaction: serializeReaction(reaction),
    });
    return serializeReaction(reaction);
  }

  async findVisibleConversation(
    db: DbClient,
    id: string,
    current: AuthenticatedUser,
    include: Prisma.ConversationInclude = {},
  ) {
    const conversation = await db.conversation.findFirst({
      where: {
        AND: [
          { id, tenantId: current.tenantId, archivedAt: null },
          await this.visibilityWhere(db, current),
        ],
      },
      include,
    });
    if (!conversation) throw new NotFoundException("Conversa não encontrada.");
    return conversation;
  }

  async assertAssignableMembership(
    tx: Prisma.TransactionClient,
    membershipId: string,
    tenantId: string,
    departmentId: string | null,
  ) {
    const membership = await tx.tenantMembership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        status: MembershipStatus.ACTIVE,
        user: { status: "ACTIVE" },
      },
      include: { role: true, departments: true },
    });
    if (!membership)
      throw new BadRequestException("Atendente inexistente ou inativo para este tenant.");
  }

  private async resolveConnection(
    tx: Prisma.TransactionClient,
    tenantId: string,
    conversation: { id: string; connectionId: string | null },
  ) {
    if (conversation.connectionId) {
      const connection = await tx.messagingConnection.findFirst({
        where: { id: conversation.connectionId, tenantId },
      });
      if (!connection) {
        throw new BadRequestException("Connection da conversa não pertence a este tenant.");
      }
      assertMessagingServiceEnabled(connection);
      return connection;
    }

    throw new BadRequestException("Conversa sem connection de mensageria configurada.");
  }

  private async visibilityWhere(
    db: DbClient,
    current: AuthenticatedUser,
  ): Promise<Prisma.ConversationWhereInput> {
    return connectionAccess(current);
  }

  private assertCanSend(conversation: {
    assignedMembershipId: string | null;
    status: ConversationStatus;
    conversationType?: ConversationType;
  }) {
    if (conversation.status === ConversationStatus.FECHADA) {
      throw new BadRequestException("Conversa encerrada não aceita novas mensagens.");
    }
    if (conversation.status === ConversationStatus.AGUARDANDO) {
      throw new BadRequestException("Retome a conversa antes de enviar mensagem.");
    }
    if (conversation.conversationType === ConversationType.GROUP) return;
    if (!conversation.assignedMembershipId) {
      throw new BadRequestException("Conversa precisa estar assumida antes do envio.");
    }
  }

  private async linkClaimedSchedule(
    input: { tenantId: string; scheduleId: string; claimedVersion: number },
    messageId: string,
  ) {
    const linked = await this.prisma.schedule.updateMany({
      where: {
        tenantId: input.tenantId,
        id: input.scheduleId,
        executionStatus: "CLAIMED",
        version: input.claimedVersion,
      },
      data: {
        executionStatus: "QUEUED",
        messageId,
        claimedAt: null,
        lastError: null,
        version: { increment: 1 },
      },
    });
    if (linked.count !== 1) throw new Error("Schedule claim was lost before materialization.");
  }

  private async prepareOutboundText(
    tx: Prisma.TransactionClient,
    content: string,
    conversation: { protocol?: string | null },
    current: AuthenticatedUser,
  ) {
    if (!current.permissions?.includes("chat.agent_name.show")) return content;
    const agentName = this.senderDisplayName
      ? await this.senderDisplayName.resolve(tx, current)
      : null;
    if (!agentName) return content;
    return cleanMessageContent(`*${agentName}:*\n\n${content}`);
  }

  private async prepareScheduledOutboundText(
    tx: Prisma.TransactionClient,
    content: string,
    author: { tenantId: string; membershipId: string; roleKey: string },
  ) {
    const agentName = this.senderDisplayName
      ? await this.senderDisplayName.resolveForMembership(tx, author)
      : null;
    if (!agentName) return content;
    return cleanMessageContent(`*${agentName}:*\n\n${content}`);
  }

  private async resolveMentionTargets(tenantId: string, conversationId: string, content: string) {
    const tokens = Array.from(content.matchAll(/@([^\s@]{2,120})/g)).map((match) => match[1]);
    if (!tokens.length) return [];

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { tenantId, conversationId, active: true },
      select: {
        externalParticipantId: true,
        displayName: true,
        phone: true,
        lid: true,
      },
    });
    const targets = new Set<string>();
    for (const token of tokens) {
      const tokenDigits = token.replace(/\D/g, "");
      const tokenName = normalizeMentionText(token);
      const participant = participants.find((item) => {
        const phone = item.phone?.replace(/\D/g, "") ?? "";
        const externalDigits = item.externalParticipantId.replace(/\D/g, "");
        const lidDigits = item.lid?.replace(/\D/g, "") ?? "";
        const displayName = normalizeMentionText(item.displayName ?? "");
        return (
          (tokenDigits.length >= 8 &&
            (phone.endsWith(tokenDigits) ||
              externalDigits.endsWith(tokenDigits) ||
              lidDigits.endsWith(tokenDigits))) ||
          (!!tokenName && displayName === tokenName)
        );
      });
      if (participant) {
        targets.add(participant.externalParticipantId);
      } else if (tokenDigits.length >= 8) {
        targets.add(`${tokenDigits}@s.whatsapp.net`);
      }
    }
    return Array.from(targets);
  }

  private updateConversationFromMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    tenantId: string,
    content: string,
    lastMessageAt: Date,
  ) {
    return tx.conversation.update({
      where: { tenantId_id: { tenantId, id: conversationId } },
      data: {
        lastMessagePreview: truncatePreview(content),
        lastMessageAt,
      },
    });
  }

  private findPendingPredecessor(message: {
    id: string;
    tenantId: string;
    conversationId: string;
    createdAt: Date;
  }) {
    return this.prisma.message.findFirst({
      where: {
        tenantId: message.tenantId,
        conversationId: message.conversationId,
        direction: MessageDirection.OUTBOUND,
        status: { in: [MessageStatus.QUEUED, MessageStatus.SENDING] },
        OR: [
          { createdAt: { lt: message.createdAt } },
          { createdAt: message.createdAt, id: { lt: message.id } },
        ],
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  private failMessage(
    messageId: string,
    tenantId: string,
    error: { code: MessagingErrorCode | string; message: string },
  ) {
    return this.prisma.message.update({
      where: { id: messageId, tenantId },
      data: {
        status: MessageStatus.FAILED,
        providerErrorCode: error.code,
        providerErrorMessage: sanitizeErrorMessage(error.message),
        failedAt: new Date(),
      },
    });
  }

  private async resolveQuotedMessage(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; conversationId: string; quotedMessageId: string },
  ) {
    const quoted = await tx.message.findFirst({
      where: { id: input.quotedMessageId, tenantId: input.tenantId },
      select: {
        id: true,
        conversationId: true,
        providerMessageId: true,
        content: true,
        type: true,
        mediaCaption: true,
        mediaFileName: true,
      },
    });
    if (!quoted || quoted.conversationId !== input.conversationId) {
      throw new BadRequestException({
        statusCode: 422,
        code: "QUOTED_MESSAGE_INVALID",
        message: "Mensagem citada invalida para está conversa.",
      });
    }
    if (!quoted.providerMessageId) {
      throw new BadRequestException({
        statusCode: 422,
        code: "MESSAGE_PROVIDER_ID_MISSING",
        message: "Mensagem citada ainda não possui ID do provedor.",
      });
    }
    return quoted;
  }

  private publishStatus(
    message: { tenantId: string; conversationId: string; id: string; status: MessageStatus },
    status: MessageStatus,
    previousStatus: MessageStatus,
    updatedAt: Date,
    failureCode?: string | null,
  ) {
    this.realtime?.publishMessageStatusUpdated({
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      messageId: message.id,
      previousStatus,
      status,
      updatedAt,
      failureCode,
    });
  }

  private serialize(message: MessageWithRelations) {
    return {
      id: message.id,
      tenantId: message.tenantId,
      conversation_id: message.conversationId,
      direction: serializeDirection(message.direction),
      sender: message.direction === MessageDirection.INBOUND ? "contact" : "agent",
      author_id: message.authorMembership?.user.id ?? null,
      author_membership_id: message.authorMembershipId,
      author_name:
        message.authorMembership?.presentationName ?? message.authorMembership?.user.name ?? null,
      author_avatar_url: message.authorMembership?.user.avatarUrl ?? null,
      outbound_origin: outboundMessageOrigin(message),
      content: message.content ?? "",
      created_at: message.createdAt,
      updated_at: message.updatedAt,
      read_at: message.readAt,
      type: serializeType(message.type),
      status: message.status.toLowerCase(),
      provider_message_id: message.providerMessageId,
      provider_chat_id: message.providerChatId,
      participant: {
        external_id: message.providerParticipantId,
        name: message.participantName,
        phone: message.participantPhone,
        lid: message.participantLid,
      },
      quoted: message.quotedProviderMessageId
        ? {
            message_id: message.quotedMessageId,
            provider_message_id: message.quotedProviderMessageId,
            content_preview: message.quotedContentPreview,
            type: message.quotedMessageType ? serializeType(message.quotedMessageType) : null,
            author_name: serializeQuotedAuthorName(message.quotedMessage),
            link_preview: serializeLinkPreview(
              asObject(message.quotedMessage?.interactiveData)?.linkPreview,
            ),
            media_data: message.quotedMessage?.mediaStorageKey
              ? {
                  state: message.quotedMessage.mediaState?.toLowerCase() ?? "ready",
                  mime_type: message.quotedMessage.mediaMimeType,
                  file_name: message.quotedMessage.mediaFileName,
                  size: message.quotedMessage.mediaSize,
                  caption: message.quotedMessage.mediaCaption,
                  width: message.quotedMessage.mediaWidth,
                  height: message.quotedMessage.mediaHeight,
                  checksum: message.quotedMessage.mediaChecksum,
                  duration_ms: message.quotedMessage.mediaDurationMs,
                  download_url: message.quotedMessageId
                    ? `/conversations/${message.conversationId}/messages/${message.quotedMessageId}/media/download`
                    : null,
                  inline_url: message.quotedMessageId
                    ? `/conversations/${message.conversationId}/messages/${message.quotedMessageId}/media/inline`
                    : null,
                }
              : null,
          }
        : null,
      media_data: message.mediaStorageKey
        ? {
            state: message.mediaState?.toLowerCase() ?? "ready",
            mime_type: message.mediaMimeType,
            file_name: message.mediaFileName,
            size: message.mediaSize,
            caption: message.mediaCaption,
            width: message.mediaWidth,
            height: message.mediaHeight,
            checksum: message.mediaChecksum,
            download_url: `/conversations/${message.conversationId}/messages/${message.id}/media/download`,
            inline_url: `/conversations/${message.conversationId}/messages/${message.id}/media/inline`,
          }
        : message.mediaState
          ? { state: message.mediaState.toLowerCase() }
          : null,
      duration_ms: message.mediaDurationMs,
      reactions: (message.reactions ?? [])
        .filter((reaction) => !reaction.removedAt)
        .map((reaction) => serializeReaction(reaction)),
      queued_at: message.queuedAt,
      sent_at: message.sentAt,
      delivered_at: message.deliveredAt,
      failed_at: message.failedAt,
    };
  }
}

export class OutboundDispatchError extends Error {
  constructor(
    public readonly code: MessagingErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly providerStatus?: number,
    public readonly providerCode?: string | null,
    public readonly providerMessage?: string | null,
    public readonly endpointPath?: string | null,
    public readonly method?: string | null,
    public readonly unknownOutcome = false,
  ) {
    super(message);
  }
}

function cleanMessageContent(value: string) {
  const content = value.trim();
  if (!content) throw new BadRequestException("Mensagem vazia.");
  if (content.length > 4000) throw new BadRequestException("Mensagem excede 4000 caracteres.");
  return content;
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}

function normalizeMentionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function serializeDirection(direction: MessageDirection) {
  const map = {
    INBOUND: "inbound",
    OUTBOUND: "outbound",
    SYSTEM: "system",
  } as const;
  return map[direction];
}

function serializeType(type: MessageType) {
  const map = {
    TEXT: "text",
    IMAGE: "image",
    AUDIO: "audio",
    VOICE: "voice",
    VIDEO: "video",
    DOCUMENT: "document",
    SYSTEM: "system",
  } as const;
  return map[type];
}

function serializeQuotedAuthorName(message: MessageWithRelations["quotedMessage"]) {
  if (!message) return null;
  if (message.direction === MessageDirection.INBOUND) return message.participantName ?? null;
  return (
    message.authorMembership?.presentationName ??
    message.authorMembership?.user.name ??
    message.participantName ??
    null
  );
}

function serializeLinkPreview(value: unknown) {
  const preview = asObject(value);
  if (!preview || typeof preview.url !== "string" || !isSafeWebUrl(preview.url)) return null;
  return {
    url: preview.url,
    title: typeof preview.title === "string" ? preview.title : null,
    description: typeof preview.description === "string" ? preview.description : null,
    thumbnail_data_url:
      typeof preview.thumbnailDataUrl === "string" &&
      preview.thumbnailDataUrl.startsWith("data:image/")
        ? preview.thumbnailDataUrl
        : null,
  };
}

function asObject(value: unknown): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

function previewFromMessage(message: {
  type: MessageType;
  content: string | null;
  mediaCaption: string | null;
  mediaFileName: string | null;
}) {
  const content = message.content ?? message.mediaCaption ?? message.mediaFileName;
  if (content) return truncatePreview(content);
  if (message.type === MessageType.IMAGE) return "[imagem]";
  if (message.type === MessageType.AUDIO || message.type === MessageType.VOICE) return "[audio]";
  if (message.type === MessageType.VIDEO) return "[video]";
  if (message.type === MessageType.DOCUMENT) return "[documento]";
  return `[${message.type.toLowerCase()}]`;
}

function mediaPreview(type: MessageType, caption: string | null, fileName: string) {
  if (caption) return truncatePreview(caption);
  if (type === MessageType.IMAGE) return "[imagem]";
  if (type === MessageType.AUDIO || type === MessageType.VOICE) return "[audio]";
  if (type === MessageType.VIDEO) return "[video]";
  if (type === MessageType.DOCUMENT) return `[documento] ${fileName}`;
  return `[${type.toLowerCase()}]`;
}

function sanitizeReaction(value: string | null) {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ([...trimmed].length > 4) {
    throw new BadRequestException("Reacao invalida.");
  }
  return trimmed;
}

function serializeReaction(reaction: {
  id: string;
  emoji: string;
  actorType: MessageReactionActorType;
  actorMembershipId: string | null;
  externalParticipantId: string | null;
  externalParticipantName: string | null;
  removedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: reaction.id,
    emoji: reaction.emoji,
    actor_type: reaction.actorType.toLowerCase(),
    actor_membership_id: reaction.actorMembershipId,
    external_participant_id: reaction.externalParticipantId || null,
    external_participant_name: reaction.externalParticipantName,
    removed_at: reaction.removedAt,
    created_at: reaction.createdAt,
  };
}

function header(req: Request, name: string) {
  const value = req.headers[name.toLowerCase()];
  return String(Array.isArray(value) ? value[0] : (value ?? "")).trim();
}

function canonicalProviderError(error: unknown) {
  if (error instanceof MessagingProviderError) return error;
  if (error instanceof OutboundDispatchError) {
    return new MessagingProviderError(
      error.code,
      error.message,
      error.retryable,
      error.providerStatus,
      error.providerCode,
      error.endpointPath,
      error.method,
      error.unknownOutcome,
    );
  }
  return new MessagingProviderError(
    MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
    "Messaging provider failed before accepting the message.",
    true,
  );
}

function sanitizeErrorMessage(message: string) {
  return message.replace(/(apikey|api_key|secret|token)=\S+/gi, "$1=[redacted]").slice(0, 500);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Falha na mensagem agendada.");
}

function maskReference(value: string | null) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function providerEndpointPath(providerType: MessagingProviderType, type: MessageType) {
  if (providerType !== MessagingProviderType.EVOLUTION) return "provider.dispatch";
  if (type === MessageType.TEXT) return "/message/sendText/{instanceName}";
  if (type === MessageType.VOICE) return "/message/sendWhatsAppAudio/{instanceName}";
  if (type === MessageType.IMAGE || type === MessageType.AUDIO || type === MessageType.DOCUMENT) {
    return "/message/sendMedia/{instanceName}";
  }
  return "/message/send";
}
