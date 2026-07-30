import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import {
  ConversationStatus,
  MembershipStatus,
  MessageDirection,
  MessageType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagingOutboundService } from "../messaging/messaging-outbound.service";

const messageInclude = {
  authorMembership: {
    include: {
      user: { select: { id: true, email: true, name: true } },
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
    SYSTEM: "system",
  } as const;
  return map[type];
}
