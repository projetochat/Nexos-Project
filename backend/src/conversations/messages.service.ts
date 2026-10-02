import { conversationVisibilityWhere } from "./conversation-visibility";
import { withMessagingServiceEnabled } from "../messaging/service-availability";
import {
  BadRequestException,
  Inject,
  Injectable,
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
  MessageReactionActorType,
  MessageType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagingOutboundService } from "../messaging/messaging-outbound.service";
import { MessagingMediaStorageService } from "../messaging/media/messaging-media-storage.service";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { outboundMessageOrigin } from "../messaging/message-origin";

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

type DbClient = PrismaService | Prisma.TransactionClient;
type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

@Injectable()
export class MessagesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MessagingOutboundService)
    private readonly outbound: MessagingOutboundService,
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage: MessagingMediaStorageService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
    @Optional() @Inject(EvolutionClient) private readonly evolution?: EvolutionClient,
  ) {}

  async list(conversationId: string, query: ListMessagesQueryDto, current: AuthenticatedUser) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 100);
    const cursor = query.cursor
      ? await this.prisma.message.findFirst({
          where: { id: query.cursor, tenantId: current.tenantId, conversationId },
          select: { id: true, createdAt: true },
        })
      : null;
    if (query.cursor && !cursor) throw new BadRequestException("Cursor de mensagens inválido.");

    const items = await this.prisma.message.findMany({
      where: {
        tenantId: current.tenantId,
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
    return {
      items: page.reverse().map((message) => this.serialize(message)),
      nextCursor,
    };
  }

  async sendText(conversationId: string, dto: SendMessageDto, current: AuthenticatedUser) {
    return this.outbound.sendText(conversationId, dto, current);
  }

  async get(conversationId: string, messageId: string, current: AuthenticatedUser) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, tenantId: current.tenantId },
      include: messageInclude,
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada.");
    return this.serialize(message);
  }

  async sendMedia(conversationId: string, req: Request, current: AuthenticatedUser) {
    return this.outbound.sendMedia(conversationId, req, current);
  }

  async react(
    conversationId: string,
    messageId: string,
    emoji: string | null,
    current: AuthenticatedUser,
  ) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    return this.outbound.react(conversationId, messageId, emoji, current);
  }

  async edit(
    conversationId: string,
    messageId: string,
    content: string,
    current: AuthenticatedUser,
  ) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const clean = cleanMessageContent(content);
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        tenantId: current.tenantId,
        direction: MessageDirection.OUTBOUND,
      },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada ou não pode ser editada.");
    if (isDeleted(message.interactiveData))
      throw new BadRequestException("Mensagem apagada não pode ser editada.");
    const context = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: current.tenantId },
      include: { connection: true },
    });
    if (context?.connection?.serviceEnabled === false) {
      throw new BadRequestException("O atendimento desta instância está desativado.");
    }
    const providerChatId = message.providerChatId ?? context?.externalChatId;
    if (
      this.evolution &&
      message.providerMessageId &&
      context?.connection?.externalReference &&
      providerChatId
    ) {
      await withMessagingServiceEnabled(this.prisma, current.tenantId, context.connection.id, () =>
        this.evolution!.updateMessage({
          instanceName: context.connection!.externalReference!,
          chat: providerChatId,
          messageId: message.providerMessageId!,
          message: clean,
        }),
      );
    }
    await this.prisma.message.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: messageId } },
      data: {
        content: clean,
        mediaCaption: message.type === MessageType.IMAGE ? clean : undefined,
        interactiveData: {
          ...asObject(message.interactiveData),
          editedAt: new Date().toISOString(),
        },
      },
    });
    await this.prisma.conversation.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: conversationId } },
      data: { lastMessagePreview: truncatePreview(clean), lastMessageAt: new Date() },
    });
    this.realtime?.publishConversationUpdated({
      tenantId: current.tenantId,
      conversationId,
      reason: "message.edited",
    });
    return this.get(conversationId, messageId, current);
  }

  async delete(conversationId: string, messageId: string, current: AuthenticatedUser) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        tenantId: current.tenantId,
        direction: MessageDirection.OUTBOUND,
      },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada ou não pode ser apagada.");
    const context = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: current.tenantId },
      include: { connection: true },
    });
    if (context?.connection?.serviceEnabled === false) {
      throw new BadRequestException("O atendimento desta instância está desativado.");
    }
    const providerChatId = message.providerChatId ?? context?.externalChatId;
    if (
      this.evolution &&
      message.providerMessageId &&
      context?.connection?.externalReference &&
      providerChatId
    ) {
      await withMessagingServiceEnabled(this.prisma, current.tenantId, context.connection.id, () =>
        this.evolution!.deleteMessage({
          instanceName: context.connection!.externalReference!,
          remoteJid: providerChatId,
          messageId: message.providerMessageId!,
        }),
      );
    }
    await this.prisma.message.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: messageId } },
      data: {
        interactiveData: {
          ...asObject(message.interactiveData),
          deletedForEveryone: true,
          deletedAt: new Date().toISOString(),
        },
      },
    });
    this.realtime?.publishConversationUpdated({
      tenantId: current.tenantId,
      conversationId,
      reason: "message.deleted",
    });
    return this.get(conversationId, messageId, current);
  }

  async downloadMedia(conversationId: string, messageId: string, current: AuthenticatedUser) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const message = await this.prisma.message.findFirst({
      where: { tenantId: current.tenantId, conversationId, id: messageId },
      select: {
        mediaStorageKey: true,
        mediaMimeType: true,
        mediaFileName: true,
      },
    });
    if (!message?.mediaStorageKey) throw new NotFoundException("Mídia não encontrada.");
    return {
      body: await this.mediaStorage.readObject(message.mediaStorageKey),
      mimeType: message.mediaMimeType ?? "application/octet-stream",
      fileName: message.mediaFileName ?? "media",
    };
  }

  async markRead(conversationId: string, current: AuthenticatedUser) {
    await this.findVisibleConversation(this.prisma, conversationId, current);
    const readAt = new Date();
    await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: {
          tenantId: current.tenantId,
          conversationId,
          direction: MessageDirection.INBOUND,
          readAt: null,
        },
        data: { readAt },
      }),
      this.prisma.conversation.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: conversationId } },
        data: { unreadCount: 0 },
      }),
    ]);
    this.realtime?.publishUnreadUpdated({
      tenantId: current.tenantId,
      conversationId,
      unreadCount: 0,
    });
    return { unreadCount: 0, readAt };
  }

  async createInitialOutboundMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    current: AuthenticatedUser,
    content: string,
    createdAt = new Date(),
  ) {
    const clean = cleanMessageContent(content);
    await tx.message.create({
      data: {
        tenantId: current.tenantId,
        conversationId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        authorMembershipId: current.membershipId,
        content: clean,
        createdAt,
      },
    });
    await this.updateConversationFromMessage(
      tx,
      conversationId,
      current.tenantId,
      clean,
      createdAt,
    );
  }

  async createSystemMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    current: AuthenticatedUser,
    content: string,
    createdAt = new Date(),
    options: { updateConversation?: boolean } = {},
  ) {
    const clean = cleanSystemContent(content);
    await tx.message.create({
      data: {
        tenantId: current.tenantId,
        conversationId,
        direction: MessageDirection.SYSTEM,
        type: MessageType.SYSTEM,
        authorMembershipId: current.membershipId,
        content: clean,
        createdAt,
      },
    });
    if (options.updateConversation === false) return;
    await this.updateConversationFromMessage(
      tx,
      conversationId,
      current.tenantId,
      clean,
      createdAt,
    );
  }

  async findVisibleConversation(
    db: DbClient,
    id: string,
    current: AuthenticatedUser,
    include: Prisma.ConversationInclude = {},
  ) {
    const conversation = await db.conversation.findFirst({
      where: {
        AND: [{ id, tenantId: current.tenantId, archivedAt: null }, this.visibilityWhere(current)],
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

  private visibilityWhere(current: AuthenticatedUser): Prisma.ConversationWhereInput {
    return conversationVisibilityWhere(current);
  }

  private assertCanSend(
    conversation: {
      assignedMembershipId: string | null;
      status: ConversationStatus;
      conversationType?: ConversationType;
    },
    current: AuthenticatedUser,
  ) {
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
      interactive_data: message.interactiveData ?? null,
      forwarded: asObject(message.interactiveData)?.forwarded === true,
      sticker: asObject(message.interactiveData)?.sticker === true,
      link_preview: serializeLinkPreview(asObject(message.interactiveData)?.linkPreview),
      created_at: message.createdAt,
      updated_at: message.updatedAt,
      edited_at: asObject(message.interactiveData)?.editedAt ?? null,
      deleted_at: asObject(message.interactiveData)?.deletedAt ?? null,
      deleted_for_everyone: asObject(message.interactiveData)?.deletedForEveryone === true,
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
      reactions: message.reactions
        .filter((reaction) => !reaction.removedAt)
        .map((reaction) => ({
          id: reaction.id,
          emoji: reaction.emoji,
          actor_type: reaction.actorType.toLowerCase(),
          actor_membership_id: reaction.actorMembershipId,
          external_participant_id: reaction.externalParticipantId,
          external_participant_name: reaction.externalParticipantName,
          created_at: reaction.createdAt,
        })),
      queued_at: message.queuedAt,
      sent_at: message.sentAt,
      delivered_at: message.deliveredAt,
      failed_at: message.failedAt,
    };
  }
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

function cleanMessageContent(value: string) {
  const content = value.trim();
  if (!content) throw new BadRequestException("Mensagem vazia.");
  if (content.length > 4000) throw new BadRequestException("Mensagem excede 4000 caracteres.");
  return content;
}

function cleanSystemContent(value: string) {
  const content = value.trim();
  if (!content) throw new BadRequestException("Mensagem de sistema vazia.");
  if (content.length > 4000)
    throw new BadRequestException("Mensagem de sistema excede 4000 caracteres.");
  return content;
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}

function asObject(value: unknown): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function isDeleted(value: Prisma.JsonValue | null | undefined) {
  return asObject(value).deletedForEveryone === true;
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
