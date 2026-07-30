import {
  BadRequestException,
  ForbiddenException,
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
import { MessagingProviderRegistry } from "./messaging-provider.registry";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";

const messageInclude = {
  authorMembership: {
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
} satisfies Prisma.MessageInclude;

type DbClient = PrismaService | Prisma.TransactionClient;
type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type PreparedOutbound =
  | { dispatch: false; message: MessageWithRelations }
  | {
      dispatch: true;
      message: MessageWithRelations;
      connection: {
        id: string;
        providerType: MessagingProviderType;
      };
    };

@Injectable()
export class MessagingOutboundService {
  private readonly logger = new Logger(MessagingOutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: MessagingProviderRegistry,
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
          status: MessageStatus.SENDING,
          authorMembershipId: current.membershipId,
          content,
          clientMessageId: dto.clientMessageId?.trim() || null,
          createdAt: now,
        },
        include: messageInclude,
      });
      await this.updateConversationFromMessage(tx, conversationId, current.tenantId, content, now);
      return { message, connection, dispatch: true };
    });

    if (!prepared.dispatch) return this.serialize(prepared.message);

    const connection = prepared.connection;
    const provider = this.providers.resolve(connection.providerType);
    this.providers.assertSupports(provider, MessageType.TEXT);

    try {
      const result = await provider.send({
        tenantId: current.tenantId,
        conversationId,
        messageId: prepared.message.id,
        connectionId: connection.id,
        providerType: connection.providerType,
        recipient: {
          phone: conversation.contact.phone,
          normalizedPhone: conversation.contact.normalizedPhone,
          displayName: conversation.contact.name,
        },
        content: { type: MessageType.TEXT, text: content },
        clientMessageId: dto.clientMessageId,
      });

      const updated = await this.prisma.message.update({
        where: { id: prepared.message.id },
        data: {
          status: result.accepted ? MessageStatus.SENT : MessageStatus.FAILED,
          providerMessageId: result.providerMessageId ?? null,
          providerStatus: result.providerStatus ?? null,
          providerAcceptedAt: result.providerTimestamp ?? null,
          providerErrorCode: null,
          providerErrorMessage: null,
        },
        include: messageInclude,
      });
      this.logger.log({
        event: "messaging.outbound.sent",
        messageId: updated.id,
        conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
      });
      return this.serialize(updated);
    } catch (error) {
      const canonical = canonicalProviderError(error);
      const updated = await this.prisma.message.update({
        where: { id: prepared.message.id },
        data: {
          status: MessageStatus.FAILED,
          providerErrorCode: canonical.code,
          providerErrorMessage: canonical.message,
        },
        include: messageInclude,
      });
      this.logger.warn({
        event: "messaging.outbound.failed",
        messageId: updated.id,
        conversationId,
        connectionId: connection.id,
        providerType: connection.providerType,
        errorCode: canonical.code,
      });
      return this.serialize(updated);
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

    const connection = await tx.messagingConnection.findFirst({
      where: {
        tenantId,
        providerType: MessagingProviderType.DEVELOPMENT,
        status: MessagingConnectionStatus.CONNECTED,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!connection) {
      throw new BadRequestException("Nenhuma connection de mensageria configurada.");
    }
    await tx.conversation.update({
      where: { tenantId_id: { tenantId, id: conversation.id } },
      data: { connectionId: connection.id },
    });
    return connection;
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
  return new MessagingProviderError(
    MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
    "Messaging provider failed before accepting the message.",
    true,
  );
}
