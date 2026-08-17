import {
  BadRequestException,
  ForbiddenException,
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

const messageInclude = {
  authorMembership: {
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  reactions: true,
  quotedMessage: {
    select: {
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
    if (query.cursor && !cursor) throw new BadRequestException("Cursor de mensagens invalido.");

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
    return {
      items: page.reverse().map((message) => this.serialize(message)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async sendText(conversationId: string, dto: SendMessageDto, current: AuthenticatedUser) {
    return this.outbound.sendText(conversationId, dto, current);
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
    if (!message?.mediaStorageKey) throw new NotFoundException("Midia nao encontrada.");
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
        AND: [
          { id, tenantId: current.tenantId, archivedAt: null },
          await this.visibilityWhere(db, current),
        ],
      },
      include,
    });
    if (!conversation) throw new NotFoundException("Conversa nao encontrada.");
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
    if (departmentId && membership.role.key !== "tenant_admin") {
      const inDepartment = membership.departments.some(
        (item) => item.departmentId === departmentId,
      );
      if (!inDepartment)
        throw new BadRequestException("Atendente nao pertence ao departamento da conversa.");
    }
  }

  async assertDepartmentScope(current: AuthenticatedUser, departmentId: string) {
    if (current.roleKey === "tenant_admin") return;
    const allowed = await this.allowedDepartmentIds(this.prisma, current);
    if (!allowed.includes(departmentId)) {
      throw new ForbiddenException("Departamento fora do escopo operacional do usuario.");
    }
  }

  async allowedDepartmentIds(db: DbClient, current: AuthenticatedUser) {
    const memberships = await db.departmentMembership.findMany({
      where: { tenantId: current.tenantId, membershipId: current.membershipId },
      select: { departmentId: true },
    });
    return memberships.map((item) => item.departmentId);
  }

  private async visibilityWhere(
    db: DbClient,
    current: AuthenticatedUser,
  ): Promise<Prisma.ConversationWhereInput> {
    if (
      current.roleKey === "tenant_admin" ||
      current.permissions?.includes("chat.conversations.view_all_active")
    )
      return {};
    const departmentIds = await this.allowedDepartmentIds(db, current);
    return {
      OR: [
        { assignedMembershipId: current.membershipId },
        departmentIds.length
          ? { departmentId: { in: departmentIds } }
          : { id: "__no_department_scope__" },
      ],
    };
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
      throw new BadRequestException("Conversa encerrada nao aceita novas mensagens.");
    }
    if (conversation.status === ConversationStatus.AGUARDANDO) {
      throw new BadRequestException("Retome a conversa antes de enviar mensagem.");
    }
    if (conversation.conversationType === ConversationType.GROUP) return;
    if (!conversation.assignedMembershipId) {
      throw new BadRequestException("Conversa precisa estar assumida antes do envio.");
    }
    if (conversation.assignedMembershipId !== current.membershipId) {
      throw new ForbiddenException("Apenas o atendente responsavel pode enviar mensagens.");
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
