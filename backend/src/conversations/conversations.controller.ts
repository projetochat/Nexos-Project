import { connectionAccess, connectionIdAccess } from "../auth/connection-access";
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
import { ContactProfilePictureSyncService } from "../messaging/contact-profile-picture-sync.service";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { TransferDepartmentDto } from "./dto/transfer-department.dto";
import { UpdateConversationStatusDto } from "./dto/update-conversation-status.dto";
import { MessagesService } from "./messages.service";
import { conversationQueueScope } from "./conversation-queue-scope";
import { BulkCloseConversationsDto } from "./dto/bulk-close-conversations.dto";

const conversationInclude = {
  contact: {
    include: {
      customer: true,
      tags: { include: { tag: true }, where: { tag: { archivedAt: null } } },
      customFieldValues: {
        include: { field: true },
      },
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
    @Inject(ContactProfilePictureSyncService)
    private readonly profilePictures: ContactProfilePictureSyncService,
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

    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts: items.flatMap((conversation) =>
        conversation.contact ? [conversation.contact] : [],
      ),
    });

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
    this.profilePictures.enqueueMissing({
      tenantId: current.tenantId,
      contacts: conversation.contact ? [conversation.contact] : [],
    });
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
    const connection = await this.resolveConversationConnection(dto.connectionId, current, contact);
    const assignToSelf = dto.assignToSelf ?? false;
    if (assignToSelf && !connection) {
      throw new BadRequestException(
        "Nenhuma instância WhatsApp conectada para iniciar a conversa.",
      );
    }
    const status = assignToSelf ? ConversationStatus.EM_ANDAMENTO : ConversationStatus.ABERTA;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: {
          tenantId: current.tenantId,
          contactId: contact.id,
          ...(connection ? { connectionId: connection.id } : {}),
          archivedAt: null,
          status: { not: ConversationStatus.FECHADA },
        },
        orderBy: { updatedAt: "desc" },
        include: conversationInclude,
      });
      if (existing) {
        if (!assignToSelf) return { conversation: existing, created: false, updated: false };
        const shouldAssign =
          existing.assignedMembershipId !== current.membershipId ||
          existing.status !== ConversationStatus.EM_ANDAMENTO ||
          !existing.protocol;
        if (!shouldAssign) return { conversation: existing, created: false, updated: false };
        await this.assertAssignableMembership(
          tx,
          current.membershipId,
          current.tenantId,
          existing.departmentId,
        );
        const updated = await tx.conversation.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
          data: {
            assignedMembershipId: current.membershipId,
            status: ConversationStatus.EM_ANDAMENTO,
            protocol: existing.protocol ?? (await this.nextProtocol(tx, current.tenantId)),
            lastMessageAt: existing.lastMessageAt ?? now,
          },
          include: conversationInclude,
        });
        return { conversation: updated, created: false, updated: true };
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
      return { conversation, created: true, updated: false };
    });

    if (result.created) {
      this.realtime.publishConversationCreated({
        tenantId: current.tenantId,
        conversationId: result.conversation.id,
        conversation: this.serialize(result.conversation),
      });
    } else if (result.updated) {
      this.realtime.publishConversationUpdated({
        tenantId: current.tenantId,
        conversationId: result.conversation.id,
        conversation: this.serialize(result.conversation),
        reason: "assignment.updated",
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          departmentId: dto.departmentId,
          assignedMembershipId: conversation.assignedMembershipId,
          status: conversation.status,
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

  @Post("bulk-close")
  @RequirePermissions("conversations.manage")
  async bulkClose(
    @Body() dto: BulkCloseConversationsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const where: Prisma.ConversationWhereInput = {
      AND: [
        { tenantId: current.tenantId, archivedAt: null, status: { not: ConversationStatus.FECHADA } },
        connectionAccess(current),
        { OR: dto.queues.map((queue) => conversationQueueScope(queue)) },
      ],
    };
    let closedIds: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        closedIds = await this.prisma.$transaction(async (tx) => {
          const conversations = await tx.conversation.findMany({
            where,
            select: { id: true, protocol: true },
            orderBy: { id: "asc" },
          });
          const now = new Date();
          for (const conversation of conversations) {
            const protocol = conversation.protocol ?? await this.nextProtocol(tx, current.tenantId);
            const startNote = `Conversa iniciada - protocolo ${protocol}.`;
            const start = await tx.message.findFirst({
              where: { tenantId: current.tenantId, conversationId: conversation.id, type: "SYSTEM", content: startNote },
              select: { id: true },
            });
            if (!start) {
              await this.messages.createSystemMessage(tx, conversation.id, current, startNote, now, { updateConversation: false });
            }
            const endNote = `Conversa encerrada - protocolo ${protocol}.`;
            await this.messages.createSystemMessage(tx, conversation.id, current, endNote, new Date(now.getTime() + 1), { updateConversation: false });
            await tx.conversation.update({
              where: { tenantId_id: { tenantId: current.tenantId, id: conversation.id } },
              data: { status: ConversationStatus.FECHADA, protocol, closedAt: new Date(now.getTime() + 1), unreadCount: 0, inboxArchivedAt: null, lastMessageAt: new Date(now.getTime() + 1), lastMessagePreview: endNote },
            });
            await tx.lead.updateMany({
              where: { tenantId: current.tenantId, conversationId: conversation.id, status: { in: ["NEW", "QUEUED", "ASSIGNED"] } },
              data: { status: "DISCARDED", discardedAt: now },
            });
          }
          return conversations.map((conversation) => conversation.id);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt === 2) throw error;
      }
    }
    for (const conversationId of closedIds) {
      this.realtime.publishConversationUpdated({ tenantId: current.tenantId, conversationId, reason: "status.updated" });
    }
    return { closed: closedIds.length };
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
      conversation.status === ConversationStatus.FECHADA &&
      target !== ConversationStatus.FECHADA
    ) {
      throw new BadRequestException("Conversa encerrada não pode ser reaberta por este endpoint.");
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
      {
        tenantId: current.tenantId,
        archivedAt: null,
      },
      await this.visibilityWhere(current),
      this.searchWhere(query),
    ];

    if (!options.omitTab) filters.push(tabWhere(query.tab, current));
    if (query.source === "humano") filters.push({ assignedMembershipId: { not: null } });
    if (query.source === "bots") filters.push({ assignedMembershipId: null });
    if (query.onlyUnread === "true") filters.push({ unreadCount: { gt: 0 } });
    if (query.customerId) filters.push({ contact: { customerId: query.customerId } });
    if (query.instance) {
      filters.push({
        OR: [
          { connection: { externalReference: query.instance } },
          { connectionId: query.instance },
        ],
      });
    }
    if (query.contactId) filters.push({ contactId: query.contactId });
    if (query.status) filters.push({ status: parseStatus(query.status) });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });

    return { AND: filters.filter(Boolean) } satisfies Prisma.ConversationWhereInput;
  }

  private async visibilityWhere(
    current: AuthenticatedUser,
  ): Promise<Prisma.ConversationWhereInput> {
    return connectionAccess(current);
  }

  private searchWhere(query: ListConversationsQueryDto): Prisma.ConversationWhereInput {
    const q = query.q?.trim();
    if (!q) return {};
    const digits = q.replace(/\D/g, "");
    const or: Prisma.ConversationWhereInput[] = [
      { protocol: { contains: q, mode: "insensitive" } },
      { groupName: { contains: q, mode: "insensitive" } },
      { lastMessagePreview: { contains: q, mode: "insensitive" } },
      { contact: { name: { contains: q, mode: "insensitive" } } },
      { contact: { phone: { contains: q, mode: "insensitive" } } },
      { contact: { departmentName: { contains: q, mode: "insensitive" } } },
      { department: { name: { contains: q, mode: "insensitive" } } },
      { connection: { name: { contains: q, mode: "insensitive" } } },
      { connection: { externalReference: { contains: q, mode: "insensitive" } } },
      { assignedMembership: { user: { name: { contains: q, mode: "insensitive" } } } },
      { contact: { customer: { name: { contains: q, mode: "insensitive" } } } },
    ];
    if (digits) {
      or.push({ contact: { normalizedPhone: { contains: digits, mode: "insensitive" } } });
    }
    return {
      OR: or,
    };
  }

  private countTabs(baseWhere: Prisma.ConversationWhereInput, current: AuthenticatedUser) {
    return this.prisma
      .$transaction([
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("ativas", current)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("standby", current)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("fila", current)] },
        }),
        this.prisma.conversation.count({
          where: { AND: [baseWhere, tabWhere("leads", current)] },
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
    if (!conversation) throw new NotFoundException("Conversa não encontrada.");
    return conversation;
  }

  private async resolveDepartmentId(
    departmentId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (departmentId) {
      await this.assertDepartmentInTenant(departmentId, current.tenantId);
      return departmentId;
    }

    const department = await this.prisma.department.findFirst({
      where: { tenantId: current.tenantId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!department) throw new BadRequestException("Tenant sem departamento ativo para conversa.");
    return department.id;
  }

  private async resolveConversationConnection(
    connectionId: string | null | undefined,
    current: AuthenticatedUser,
    contact?: { instance: string | null; instanceIds: string[] },
  ) {
    // An explicit choice made in the UI must always win.  Including the
    // contact's other instances in this query made `findFirst` return the
    // oldest connection instead of the selected one, which in turn reopened
    // the conversation from a different WhatsApp instance.
    if (connectionId) {
      const selectedConnection = await this.prisma.messagingConnection.findFirst({
        where: {
          AND: [{ id: connectionId }, connectionIdAccess(current)],
          tenantId: current.tenantId,
          archivedAt: null,
        },
      });
      if (!selectedConnection) {
        throw new BadRequestException("Connection inexistente para este tenant.");
      }
      return this.assertUsableConversationConnection(selectedConnection);
    }

    const connectionKeys = uniqueValues([...(contact?.instanceIds ?? []), contact?.instance]);

    const connection = connectionKeys.length
      ? await this.prisma.messagingConnection.findFirst({
          where: {
            tenantId: current.tenantId,
            archivedAt: null,
            ...connectionIdAccess(current),
            OR: [
              { id: { in: connectionKeys } },
              { externalReference: { in: connectionKeys } },
              { name: { in: connectionKeys } },
            ],
          },
          orderBy: { createdAt: "asc" },
        })
      : null;

    if (!connection && current.roleKey !== "tenant_admin")
      throw new ForbiddenException("Selecione uma instância permitida pelo perfil.");
    if (!connection) return null;
    return this.assertUsableConversationConnection(connection);
  }

  private assertUsableConversationConnection(connection: {
    id: string;
    providerType: MessagingProviderType;
    externalReference: string | null;
    status: MessagingConnectionStatus;
  }) {
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
    return (
      membership?.presentationName?.trim() ??
      membership?.user.name ??
      membership?.user.email ??
      "atendente selecionado"
    );
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
      inbox_archived_at: conversation.inboxArchivedAt,
      is_lead:
        !conversation.isGroup &&
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
            customFields: Object.fromEntries(
              conversation.contact.customFieldValues.map((item) => [
                item.fieldId,
                item.value ?? "",
              ]),
            ),
            customFieldValues: conversation.contact.customFieldValues.map((item) => ({
              fieldId: item.fieldId,
              label: item.field.label,
              type: item.field.type.toLowerCase(),
              value: item.value,
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
            nome:
              conversation.assignedMembership.presentationName?.trim() ||
              conversation.assignedMembership.user.name,
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
            color: conversation.connection.color,
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
  if (sort === "status") {
    return [
      { status: direction },
      { lastMessageAt: { sort: "desc" as const, nulls: "last" as const } },
      { updatedAt: "desc" as const },
    ];
  }
  // `lastMessageAt` comes from WhatsApp and is commonly precise only to seconds.
  // `updatedAt` preserves the actual server arrival order when messages share a timestamp.
  return [
    { lastMessageAt: { sort: direction, nulls: "last" as const } },
    { updatedAt: direction },
    { id: direction },
  ];
}

function tabWhere(
  tab: ListConversationsQueryDto["tab"],
  current: AuthenticatedUser,
): Prisma.ConversationWhereInput {
  return conversationQueueScope(tab);
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
  return "Responsável pela conversa atualizado.";
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

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
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
