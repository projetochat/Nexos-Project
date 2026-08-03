import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import {
  ConversationStatus,
  MembershipStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "../conversations/dto/send-message.dto";
import {
  OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
  type MessagingOutboundJob,
} from "../queue/messaging-outbound.queue";
import { OutboxDispatcherService } from "../queue/outbox-dispatcher.service";
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";

const messageInclude = {
  authorMembership: {
    include: {
      user: { select: { id: true, email: true, name: true } },
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

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MessagingProviderRegistry)
    private readonly providers: MessagingProviderRegistry,
    @Inject(OutboxDispatcherService)
    private readonly outboxDispatcher: OutboxDispatcherService,
  ) {}

  async sendText(conversationId: string, dto: SendMessageDto, current: AuthenticatedUser) {
    const content = cleanMessageContent(dto.content);
    const conversation = await this.findVisibleConversation(this.prisma, conversationId, current, {
      contact: true,
      connection: true,
    });
    this.assertCanSend(conversation, current);

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
          clientMessageId: dto.clientMessageId?.trim() || null,
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
    if (message.direction !== MessageDirection.OUTBOUND || message.type !== MessageType.TEXT) {
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
    if (connection.status !== MessagingConnectionStatus.CONNECTED) {
      await this.failMessage(message.id, input.tenantId, {
        code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
        message: "Messaging connection is not connected.",
      });
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

    const provider = this.providers.resolve(connection.providerType);
    this.providers.assertSupports(provider, message.type);

    try {
      const result = await provider.send({
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
        content: { type: MessageType.TEXT, text: message.content ?? "" },
        clientMessageId: message.clientMessageId,
      });

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: result.accepted ? MessageStatus.SENT : MessageStatus.FAILED,
          providerMessageId: result.providerMessageId ?? null,
          providerStatus: result.providerStatus ?? null,
          providerAcceptedAt: result.providerTimestamp ?? null,
          providerErrorCode: result.accepted ? null : MessagingErrorCode.DELIVERY_REJECTED,
          providerErrorMessage: result.accepted ? null : "Messaging provider rejected dispatch.",
        },
      });
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
      const canonical = canonicalProviderError(error);
      if (!canonical.retryable || input.finalAttempt) {
        await this.failMessage(message.id, input.tenantId, canonical);
      } else {
        await this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.QUEUED,
            providerErrorCode: canonical.code,
            providerErrorMessage: sanitizeErrorMessage(canonical.message),
          },
        });
      }
      this.logger.warn({
        event: "messaging.outbound.failed",
        tenantId: input.tenantId,
        messageId: message.id,
        conversationId: message.conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        attempt: input.attempt,
        result: input.finalAttempt || !canonical.retryable ? "failed" : "retrying",
        errorCode: canonical.code,
      });
      throw new OutboundDispatchError(canonical.code, canonical.message, canonical.retryable);
    }
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
        throw new BadRequestException("Connection da conversa nao pertence a este tenant.");
      }
      return connection;
    }

    throw new BadRequestException("Conversa sem connection de mensageria configurada.");
  }

  private async visibilityWhere(
    db: DbClient,
    current: AuthenticatedUser,
  ): Promise<Prisma.ConversationWhereInput> {
    if (current.roleKey === "tenant_admin") return {};
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
    conversation: { assignedMembershipId: string | null; status: ConversationStatus },
    current: AuthenticatedUser,
  ) {
    if (!conversation.assignedMembershipId) {
      throw new BadRequestException("Conversa precisa estar assumida antes do envio.");
    }
    if (conversation.assignedMembershipId !== current.membershipId) {
      throw new ForbiddenException("Apenas o atendente responsavel pode enviar mensagens.");
    }
    if (conversation.status === ConversationStatus.FECHADA) {
      throw new BadRequestException("Conversa encerrada nao aceita novas mensagens.");
    }
    if (conversation.status === ConversationStatus.AGUARDANDO) {
      throw new BadRequestException("Retome a conversa antes de enviar mensagem.");
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
      media_data: null,
      duration_ms: null,
    };
  }
}

export class OutboundDispatchError extends Error {
  constructor(
    public readonly code: MessagingErrorCode,
    message: string,
    public readonly retryable: boolean,
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
    SYSTEM: "system",
  } as const;
  return map[type];
}

function canonicalProviderError(error: unknown) {
  if (error instanceof MessagingProviderError) return error;
  if (error instanceof OutboundDispatchError) {
    return new MessagingProviderError(error.code, error.message, error.retryable);
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
