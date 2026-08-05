import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  ConversationStatus,
  MembershipStatus,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { TransferDepartmentDto } from "./dto/transfer-department.dto";
import { UpdateConversationStatusDto } from "./dto/update-conversation-status.dto";
import { MessagesService } from "./messages.service";

const conversationInclude = {
  contact: {
    include: {
      customer: true,
      tags: { include: { tag: true }, where: { tag: { archivedAt: null } } },
    },
  },
  connection: true,
  department: true,
  assignedMembership: {
    include: {
      user: { select: { id: true, email: true, name: true } },
      role: { select: { key: true } },
      departments: { select: { departmentId: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

@Controller("conversations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConversationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagesService) private readonly messages: MessagesService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  @Get()
  @RequirePermissions("conversations.read")
  async list(@Query() query: ListConversationsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const { page, pageSize, skip } = pagination(query);
    const where = await this.buildWhere(current, query);
    const countBase = await this.buildWhere(current, query, { omitTab: true });
    const direction = query.direction ?? "desc";
    const sort = query.sort ?? "lastMessageAt";

    const [items, total, counts] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: orderBy(sort, direction),
        include: conversationInclude,
      }),
      this.prisma.conversation.count({ where }),
      this.countTabs(countBase, current),
    ]);

    return {
      ...paginated(
        items.map((conversation) => this.serialize(conversation)),
        total,
        page,
        pageSize,
      ),
      counts,
    };
  }

  @Get(":id")
  @RequirePermissions("conversations.read")
  async detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const conversation = await this.findVisibleConversation(id, current);
    return this.serialize(conversation);
  }

  @Post()
  @RequirePermissions("conversations.assign")
  async create(@Body() dto: CreateConversationDto, @CurrentUser() current: AuthenticatedUser) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId: current.tenantId, archivedAt: null },
    });
    if (!contact) throw new BadRequestException("Contato inexistente para este tenant.");

    const departmentId = await this.resolveDepartmentId(
      dto.departmentId ?? contact.departmentId,
      current,
    );
    const connection = await this.resolveConversationConnection(dto.connectionId, current);
    const assignToSelf = dto.assignToSelf ?? false;
    const status = assignToSelf ? ConversationStatus.EM_ANDAMENTO : ConversationStatus.ABERTA;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      if (connection) {
        const existing = await tx.conversation.findFirst({
          where: {
            tenantId: current.tenantId,
            contactId: contact.id,
            connectionId: connection.id,
            archivedAt: null,
            status: { not: ConversationStatus.FECHADA },
          },
          orderBy: { updatedAt: "desc" },
          include: conversationInclude,
        });
        if (existing) return { conversation: existing, created: false };
      }

      const protocol = assignToSelf ? await this.nextProtocol(tx, current.tenantId) : null;
      const created = await tx.conversation.create({
        data: {
          tenantId: current.tenantId,
          contactId: contact.id,
          departmentId,
          connectionId: connection?.id ?? null,
          assignedMembershipId: assignToSelf ? current.membershipId : null,
          status,
          protocol,
          isGroup: dto.isGroup ?? false,
          lastMessagePreview: null,
          lastMessageAt: null,
        },
        include: conversationInclude,
      });
      const firstMessage = cleanNullable(dto.firstMessagePreview);
      if (firstMessage) {
        await this.messages.createInitialOutboundMessage(
          tx,
          created.id,
          current,
          firstMessage,
          now,
        );
      }
      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id: created.id },
        include: conversationInclude,
      });
      return { conversation, created: true };
    });

    if (result.created) {
      this.realtime.publishConversationCreated({
        tenantId: current.tenantId,
        conversationId: result.conversation.id,
        conversation: this.serialize(result.conversation),
      });
    }
    return this.serialize(result.conversation);
  }

  @Patch(":id/assignee")
  @RequirePermissions("conversations.assign")
  async assign(
    @Param("id") id: string,
    @Body() dto: AssignConversationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const conversation = await this.findVisibleConversation(id, current);
    const targetMembershipId = dto.unassign
      ? null
      : dto.self
        ? current.membershipId
        : dto.membershipId;

    if (!dto.unassign && !targetMembershipId) {
      throw new BadRequestException("Informe um atendente ou use self=true.");
    }
    if (
      current.roleKey === "agent" &&
      targetMembershipId &&
      targetMembershipId !== current.membershipId
    ) {
      throw new ForbiddenException("Atendente so pode atribuir a conversa para si.");
    }
    if (
      current.roleKey === "agent" &&
      dto.unassign &&
      conversation.assignedMembershipId !== current.membershipId
    ) {
      throw new ForbiddenException("Atendente so pode desatribuir conversas proprias.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const protocol =
        conversation.protocol ??
        (targetMembershipId ? await this.nextProtocol(tx, current.tenantId) : null);
      if (targetMembershipId) {
        await this.assertAssignableMembership(
          tx,
          targetMembershipId,
          current.tenantId,
          conversation.departmentId,
        );
      }
      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          assignedMembershipId: targetMembershipId,
          status: targetMembershipId ? ConversationStatus.EM_ANDAMENTO : ConversationStatus.ABERTA,
          protocol,
          lastMessageAt: conversation.lastMessageAt ?? new Date(),
        },
        include: conversationInclude,
      });
      const targetName = targetMembershipId
        ? await this.membershipDisplayName(tx, targetMembershipId, current.tenantId)
        : null;
      await this.messages.createSystemMessage(
        tx,
        conversation.id,
        current,
        assignmentSystemNote(conversation, updated, targetName),
      );
      return tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: conversationInclude,
      });
    });
    this.realtime.publishAssignmentUpdated({
      tenantId: current.tenantId,
      conversationId: updated.id,
      previousMembershipId: conversation.assignedMembershipId,
      membershipId: updated.assignedMembershipId,
      departmentId: updated.departmentId,
      updatedAt: updated.updatedAt,
    });
    this.realtime.publishConversationUpdated({
      tenantId: current.tenantId,
      conversationId: updated.id,
      conversation: this.serialize(updated),
      reason: "assignment.updated",
    });

    return this.serialize(updated);
  }

  @Patch(":id/department")
  @RequirePermissions("conversations.manage")
  async transferDepartment(
    @Param("id") id: string,
    @Body() dto: TransferDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const conversation = await this.findVisibleConversation(id, current);
    await this.assertDepartmentInTenant(dto.departmentId, current.tenantId);
    await this.assertDepartmentScope(current, dto.departmentId);

    const assigneeCompatible = conversation.assignedMembershipId
      ? await this.hasDepartmentMembership(
          conversation.assignedMembershipId,
          dto.departmentId,
          current.tenantId,
        )
      : true;

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          departmentId: dto.departmentId,
          assignedMembershipId: assigneeCompatible ? conversation.assignedMembershipId : null,
          status:
            assigneeCompatible || conversation.status !== ConversationStatus.EM_ANDAMENTO
              ? conversation.status
              : ConversationStatus.ABERTA,
        },
        include: conversationInclude,
      });
      const department = await tx.department.findUnique({
        where: { id: dto.departmentId },
        select: { name: true },
      });
      await this.messages.createSystemMessage(
        tx,
        conversation.id,
        current,
        `Conversa transferida para o departamento ${department?.name ?? "selecionado"}.`,
      );
      return tx.conversation.findUniqueOrThrow({
        where: { id: saved.id },
        include: conversationInclude,
      });
    });
    this.realtime.publishAssignmentUpdated({
      tenantId: current.tenantId,
      conversationId: updated.id,
      previousMembershipId: conversation.assignedMembershipId,
      membershipId: updated.assignedMembershipId,
      departmentId: updated.departmentId,
      updatedAt: updated.updatedAt,
    });
    this.realtime.publishConversationUpdated({
      tenantId: current.tenantId,
      conversationId: updated.id,
      conversation: this.serialize(updated),
      reason: "department.updated",
    });
    return this.serialize(updated);
  }

  @Patch(":id/status")
  @RequirePermissions("conversations.manage")
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateConversationStatusDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const conversation = await this.findVisibleConversation(id, current);
    const target = parseStatus(dto.status);

    if (
      current.roleKey === "agent" &&
      conversation.assignedMembershipId &&
      conversation.assignedMembershipId !== current.membershipId
    ) {
      throw new ForbiddenException("Atendente so pode alterar status de conversas proprias.");
    }
    if (
      conversation.status === ConversationStatus.FECHADA &&
      target !== ConversationStatus.FECHADA
    ) {
      throw new BadRequestException("Conversa encerrada nao pode ser reaberta por este endpoint.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const protocol =
        target === ConversationStatus.EM_ANDAMENTO && !conversation.protocol
          ? await this.nextProtocol(tx, current.tenantId)
          : conversation.protocol;
      const assignedMembershipId =
        target === ConversationStatus.ABERTA
          ? null
          : target === ConversationStatus.EM_ANDAMENTO && !conversation.assignedMembershipId
            ? current.membershipId
            : conversation.assignedMembershipId;

      if (assignedMembershipId) {
        await this.assertAssignableMembership(
          tx,
          assignedMembershipId,
          current.tenantId,
          conversation.departmentId,
        );
      }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: target,
          assignedMembershipId,
          protocol,
          closedAt: target === ConversationStatus.FECHADA ? new Date() : conversation.closedAt,
          lastMessageAt: conversation.lastMessageAt ?? new Date(),
        },
        include: conversationInclude,
      });
      await this.messages.createSystemMessage(
        tx,
        conversation.id,
        current,
        statusSystemNote(target),
        new Date(),
        { updateConversation: false },
      );
      return tx.conversation.findUniqueOrThrow({
        where: { id: updated.id },
        include: conversationInclude,
      });
    });
    this.realtime.publishConversationUpdated({
      tenantId: current.tenantId,
      conversationId: updated.id,
      conversation: this.serialize(updated),
      reason: "status.updated",
    });
    if (conversation.assignedMembershipId !== updated.assignedMembershipId) {
      this.realtime.publishAssignmentUpdated({
        tenantId: current.tenantId,
        conversationId: updated.id,
        previousMembershipId: conversation.assignedMembershipId,
        membershipId: updated.assignedMembershipId,
        departmentId: updated.departmentId,
        updatedAt: updated.updatedAt,
      });
    }

    return this.serialize(updated);
  }

  private async buildWhere(
    current: AuthenticatedUser,
    query: ListConversationsQueryDto,
    options: { omitTab?: boolean } = {},
  ) {
    const filters: Prisma.ConversationWhereInput[] = [
      { tenantId: current.tenantId, archivedAt: null },
      await this.visibilityWhere(current),
      this.searchWhere(query),
    ];

    if (!options.omitTab) filters.push(tabWhere(query.tab, current.membershipId));
    if (query.source === "humano") filters.push({ assignedMembershipId: { not: null } });
    if (query.source === "bots") filters.push({ assignedMembershipId: null });
    if (query.onlyUnread === "true") filters.push({ unreadCount: { gt: 0 } });
    if (query.customerId) filters.push({ contact: { customerId: query.customerId } });
    if (query.instance) filters.push({ contact: { instance: query.instance } });
    if (query.contactId) filters.push({ contactId: query.contactId });
    if (query.status) filters.push({ status: parseStatus(query.status) });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });

    return { AND: filters.filter(Boolean) } satisfies Prisma.ConversationWhereInput;
  }

  private async visibilityWhere(
    current: AuthenticatedUser,
  ): Promise<Prisma.ConversationWhereInput> {
    if (current.roleKey === "tenant_admin") return {};
    const departmentIds = await this.allowedDepartmentIds(current);
    return {
      OR: [
        { assignedMembershipId: current.membershipId },
        departmentIds.length
          ? { departmentId: { in: departmentIds } }
          : { id: "__no_department_scope__" },
      ],
    };
  }

  private searchWhere(query: ListConversationsQueryDto): Prisma.ConversationWhereInput {
    const q = query.q?.trim();
    if (!q) return {};
    return {
      OR: [
        { protocol: { contains: q, mode: "insensitive" } },
        { lastMessagePreview: { contains: q, mode: "insensitive" } },
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { phone: { contains: q, mode: "insensitive" } } },
        { contact: { normalizedPhone: { contains: q.replace(/\D/g, ""), mode: "insensitive" } } },
        { contact: { customer: { name: { contains: q, mode: "insensitive" } } } },
      ],
    };
  }

  private countTabs(baseWhere: Prisma.ConversationWhereInput, current: AuthenticatedUser) {
    return this.prisma
      .$transaction([
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("ativas", current.membershipId)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("standby", current.membershipId)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("fila", current.membershipId)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("leads", current.membershipId)] },
        }),
      ])
      .then(([ativas, standby, fila, leads]) => ({ ativas, standby, fila, leads }));
  }

  private async findVisibleConversation(id: string, current: AuthenticatedUser) {
    const where = await this.buildWhere(current, {
      page: 1,
      pageSize: 1,
    } as ListConversationsQueryDto);
    const conversation = await this.prisma.conversation.findFirst({
      where: { AND: [where, { id }] },
      include: conversationInclude,
    });
    if (!conversation) throw new NotFoundException("Conversa nao encontrada.");
    return conversation;
  }

  private async resolveDepartmentId(
    departmentId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (departmentId) {
      await this.assertDepartmentInTenant(departmentId, current.tenantId);
      await this.assertDepartmentScope(current, departmentId);
      return departmentId;
    }

    const department = await this.prisma.department.findFirst({
      where: { tenantId: current.tenantId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!department) throw new BadRequestException("Tenant sem departamento ativo para conversa.");
    await this.assertDepartmentScope(current, department.id);
    return department.id;
  }

  private async resolveConversationConnection(
    connectionId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (!connectionId) return null;
    const connection = await this.prisma.messagingConnection.findFirst({
      where: { id: connectionId, tenantId: current.tenantId },
    });
    if (!connection) throw new BadRequestException("Connection inexistente para este tenant.");
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      !connection.externalReference
    ) {
      throw new BadRequestException("Selecione uma connection WhatsApp Evolution valida.");
    }
    if (connection.status !== MessagingConnectionStatus.CONNECTED) {
      throw new BadRequestException("A connection WhatsApp precisa estar conectada.");
    }
    return connection;
  }

  private async assertDepartmentInTenant(departmentId: string, tenantId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, tenantId, active: true },
    });
    if (!department) throw new BadRequestException("Departamento inexistente para este tenant.");
  }

  private async assertDepartmentScope(current: AuthenticatedUser, departmentId: string) {
    if (current.roleKey === "tenant_admin") return;
    const allowed = await this.allowedDepartmentIds(current);
    if (!allowed.includes(departmentId)) {
      throw new ForbiddenException("Departamento fora do escopo operacional do usuario.");
    }
  }

  private async allowedDepartmentIds(current: AuthenticatedUser) {
    const memberships = await this.prisma.departmentMembership.findMany({
      where: { tenantId: current.tenantId, membershipId: current.membershipId },
      select: { departmentId: true },
    });
    return memberships.map((item) => item.departmentId);
  }

  private async hasDepartmentMembership(
    membershipId: string,
    departmentId: string,
    tenantId: string,
  ) {
    const found = await this.prisma.departmentMembership.findFirst({
      where: { tenantId, membershipId, departmentId },
    });
    return !!found;
  }

  private async assertAssignableMembership(
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

  private async nextProtocol(tx: Prisma.TransactionClient, tenantId: string) {
    const counter = await tx.conversationProtocolCounter.upsert({
      where: { tenantId },
      update: { lastNumber: { increment: 1 } },
      create: { tenantId, lastNumber: 1 },
    });
    return String(counter.lastNumber).padStart(6, "0");
  }

  private async membershipDisplayName(
    tx: Prisma.TransactionClient,
    membershipId: string,
    tenantId: string,
  ) {
    const membership = await tx.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: { select: { name: true, email: true } } },
    });
    return membership?.user.name ?? membership?.user.email ?? "atendente selecionado";
  }

  private serialize(conversation: ConversationWithRelations) {
    return {
      id: conversation.id,
      tenantId: conversation.tenantId,
      contact_id: conversation.contactId,
      connection_id: conversation.connectionId,
      department_id: conversation.departmentId,
      assigned_membership_id: conversation.assignedMembershipId,
      agent_id: conversation.assignedMembership?.user.id ?? null,
      status: serializeStatus(conversation.status),
      is_group: conversation.isGroup,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
      last_message_at: conversation.lastMessageAt ?? conversation.updatedAt,
      protocolo: conversation.protocol,
      unreadCount: conversation.unreadCount,
      lastMessagePreview: conversation.lastMessagePreview,
      is_lead:
        !conversation.assignedMembershipId &&
        conversation.status !== ConversationStatus.FECHADA &&
        !conversation.protocol,
      contact: conversation.contact
        ? {
            id: conversation.contact.id,
            nome: conversation.contact.name,
            telefone: conversation.contact.phone,
            avatar_url: conversation.contact.avatarUrl,
            customer_id: conversation.contact.customerId,
            email: conversation.contact.email,
            departamento: conversation.contact.departmentName,
            nivel_gerencia: roleLabel(conversation.contact.companyRole),
            instancia: conversation.contact.instance,
            customer: conversation.contact.customer
              ? {
                  id: conversation.contact.customer.id,
                  nome: conversation.contact.customer.name,
                  email: conversation.contact.customer.email,
                  telefone: conversation.contact.customer.phone,
                  notas: conversation.contact.customer.notes,
                  contato_responsavel: conversation.contact.customer.responsibleContactName,
                  cor: conversation.contact.customer.color,
                }
              : null,
            tags: conversation.contact.tags.map((item) => ({
              id: item.tag.id,
              nome: item.tag.name,
              cor: item.tag.color,
            })),
            createdAt: conversation.contact.createdAt,
            updatedAt: conversation.contact.updatedAt,
          }
        : null,
      department: conversation.department
        ? {
            id: conversation.department.id,
            nome: conversation.department.name,
            cor: conversation.department.color,
            descricao: conversation.department.description,
          }
        : null,
      agent: conversation.assignedMembership
        ? {
            id: conversation.assignedMembership.user.id,
            membershipId: conversation.assignedMembership.id,
            nome: conversation.assignedMembership.user.name,
            email: conversation.assignedMembership.user.email,
          }
        : null,
      connection: conversation.connection
        ? {
            id: conversation.connection.id,
            name: conversation.connection.name,
            providerType: conversation.connection.providerType.toLowerCase(),
            status: conversation.connection.status.toLowerCase(),
            externalReference: conversation.connection.externalReference,
          }
        : null,
    };
  }
}

function pagination(query: ListConversationsQueryDto) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function orderBy(sort: "lastMessageAt" | "createdAt" | "status", direction: "asc" | "desc") {
  if (sort === "createdAt") return [{ createdAt: direction }];
  if (sort === "status") return [{ status: direction }, { lastMessageAt: "desc" as const }];
  return [{ lastMessageAt: direction }, { createdAt: direction }];
}

function tabWhere(
  tab: ListConversationsQueryDto["tab"],
  membershipId: string,
): Prisma.ConversationWhereInput {
  if (tab === "ativas") {
    return {
      assignedMembershipId: membershipId,
      status: { notIn: [ConversationStatus.FECHADA, ConversationStatus.AGUARDANDO] },
    };
  }
  if (tab === "standby") return { status: ConversationStatus.AGUARDANDO };
  if (tab === "fila") {
    return {
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      protocol: { not: null },
    };
  }
  if (tab === "leads") {
    return {
      assignedMembershipId: null,
      status: { not: ConversationStatus.FECHADA },
      protocol: null,
    };
  }
  return {};
}

function parseStatus(status: "aberta" | "em_andamento" | "aguardando" | "fechada") {
  const map = {
    aberta: ConversationStatus.ABERTA,
    em_andamento: ConversationStatus.EM_ANDAMENTO,
    aguardando: ConversationStatus.AGUARDANDO,
    fechada: ConversationStatus.FECHADA,
  };
  return map[status];
}

function serializeStatus(status: ConversationStatus) {
  const map: Record<ConversationStatus, "aberta" | "em_andamento" | "aguardando" | "fechada"> = {
    ABERTA: "aberta",
    EM_ANDAMENTO: "em_andamento",
    AGUARDANDO: "aguardando",
    FECHADA: "fechada",
  };
  return map[status];
}

function assignmentSystemNote(
  before: {
    assignedMembershipId: string | null;
    protocol: string | null;
    status: ConversationStatus;
  },
  after: {
    assignedMembershipId: string | null;
    protocol: string | null;
    status: ConversationStatus;
  },
  targetName: string | null,
) {
  if (!after.assignedMembershipId) return "Conversa movida para fila.";
  if (!before.protocol && after.protocol) {
    return `Conversa iniciada - protocolo ${after.protocol}.`;
  }
  if (before.status === ConversationStatus.AGUARDANDO) return "Conversa retomada.";
  if (targetName) return `Conversa transferida para ${targetName}.`;
  return "Responsavel pela conversa atualizado.";
}

function statusSystemNote(status: ConversationStatus) {
  const map: Record<ConversationStatus, string> = {
    ABERTA: "Conversa movida para fila.",
    EM_ANDAMENTO: "Conversa retomada.",
    AGUARDANDO: "Conversa movida para stand by.",
    FECHADA: "Conversa encerrada.",
  };
  return map[status];
}

function cleanNullable(value?: string | null) {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function roleLabel(role: ConversationWithRelations["contact"]["companyRole"]) {
  const labels = {
    COLABORADOR: "Colaborador",
    SUPERVISOR: "Supervisor",
    GERENTE: "Gerente",
    DIRETORIA: "Diretoria",
  } as const;
  return role ? labels[role] : null;
}
