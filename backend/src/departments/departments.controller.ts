import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequireAnyPermission, RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  departmentIdAccess,
  roleChatDepartmentIds,
  roleChatScopes,
  roleConnectionIds,
} from "../auth/connection-access";
import { ConversationStatus, MembershipStatus, Prisma } from "../generated/prisma";
import { MessagesService } from "../conversations/messages.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AssignDepartmentMemberDto } from "./dto/assign-department-member.dto";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { DeactivateDepartmentDto } from "./dto/deactivate-department.dto";
import {
  changedDeletion,
  ConfirmDeletionDto,
  deletionSnapshot,
  type DeletionImpactPreview,
} from "../common/deletion-impact";

class ListDepartmentsQueryDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsIn(["active", "inactive", "all"])
  status?: "active" | "inactive" | "all";
}

type DepartmentDeletionClient = Pick<
  Prisma.TransactionClient,
  | "department"
  | "departmentMembership"
  | "departmentConnection"
  | "contact"
  | "conversation"
  | "ticket"
  | "lead"
  | "quickReply"
  | "automationRule"
  | "notification"
  | "role"
  | "userInvitation"
>;

@Controller("departments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
    @Optional() @Inject(MessagesService) private readonly messages?: MessagesService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  @Get()
  @RequirePermissions("departments.read")
  async list(
    @CurrentUser() current: AuthenticatedUser,
    @Query() query: ListDepartmentsQueryDto = {},
  ) {
    const departments = await this.prisma.department.findMany({
      where: {
        tenantId: current.tenantId,
        ...(query.status === "all" ? {} : { active: query.status === "inactive" ? false : true }),
        ...(query.connectionId
          ? {
              connections: {
                some: {
                  tenantId: current.tenantId,
                  connectionId: query.connectionId,
                  connection: { providerType: "EVOLUTION", archivedAt: null },
                },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: {
        connections: {
          where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
          select: { connectionId: true },
        },
        members: true,
        conversations: {
          where: { status: { not: ConversationStatus.FECHADA }, archivedAt: null },
          select: { id: true },
        },
      },
    });
    return departments.map((department) => ({
      ...this.serialize(department),
      memberCount: department.members.length,
      openConversationCount: department.conversations.length,
    }));
  }

  @Get("chat-scope")
  @RequireAnyPermission(
    "conversations.read",
    "dashboard.read",
    "history.read",
    "contacts.read",
    "campaigns.read",
    "tickets.read",
  )
  async listChatScope(@CurrentUser() current: AuthenticatedUser) {
    const departments = await this.prisma.department.findMany({
      where: {
        tenantId: current.tenantId,
        active: true,
        ...departmentIdAccess(current),
      },
      orderBy: { name: "asc" },
      include: {
        connections: {
          where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
          select: { connectionId: true },
        },
      },
    });
    const favoriteByConnection = new Map(
      (current.chatScopes ?? []).map((scope) => [scope.connectionId, scope.favoriteDepartmentId]),
    );
    return departments.map((department) => {
      const connectionIds = department.connections
        .map((connection) => connection.connectionId)
        .filter(
          (connectionId) =>
            current.roleKey === "tenant_admin" ||
            (current.chatScopes ?? []).some(
              (scope) =>
                scope.connectionId === connectionId && scope.departmentIds.includes(department.id),
            ),
        );
      return {
        ...this.serialize(department),
        connectionIds,
        favoriteConnectionIds: connectionIds.filter(
          (connectionId) => favoriteByConnection.get(connectionId) === department.id,
        ),
      };
    });
  }

  @Get("connection-options")
  @RequireAnyPermission("departments.read", "departments.create", "departments.update")
  async connectionOptions(@CurrentUser() current: AuthenticatedUser) {
    const connections = await this.prisma.messagingConnection.findMany({
      where: { tenantId: current.tenantId, providerType: "EVOLUTION", archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        serviceEnabled: true,
        color: true,
        logoUrl: true,
      },
    });
    return connections.map((connection) => ({
      ...connection,
      status: connection.status.toLowerCase(),
    }));
  }

  @Get(":id")
  @RequirePermissions("departments.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const department = await this.findDepartmentOrThrow(id, current.tenantId);
    return this.serialize(department);
  }

  @Get(":id/deactivation-preview")
  @RequirePermissions("departments.update")
  async deactivationPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const department = await this.findDepartmentOrThrow(id, current.tenantId);
    const conversations = await this.prisma.conversation.groupBy({
      by: ["connectionId"],
      where: {
        tenantId: current.tenantId,
        departmentId: department.id,
        status: { not: ConversationStatus.FECHADA },
        archivedAt: null,
      },
      _count: { _all: true },
    });
    const groups = await Promise.all(
      conversations.map(async (conversation) => ({
        connectionId: conversation.connectionId,
        count: conversation._count._all,
        destinations: await this.prisma.department.findMany({
          where: {
            tenantId: current.tenantId,
            active: true,
            id: { not: department.id },
            AND: [
              departmentIdAccess(current),
              ...(conversation.connectionId
                ? [{ connections: { some: { connectionId: conversation.connectionId } } }]
                : []),
            ],
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        }),
      })),
    );
    return {
      departmentId: department.id,
      openConversationCount: groups.reduce((total, group) => total + group.count, 0),
      groups,
    };
  }

  @Post(":id/deactivate")
  @RequirePermissions("departments.update")
  async deactivateWithMigration(
    @Param("id") id: string,
    @Body() dto: DeactivateDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.deactivateDepartment(id, dto.targets, current);
  }

  @Post()
  @RequirePermissions("departments.create")
  async create(@Body() dto: CreateDepartmentDto, @CurrentUser() current: AuthenticatedUser) {
    const name = dto.name.trim();
    await this.entitlements.assertTenantOperational(current.tenantId);
    const department = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenants" WHERE id = ${current.tenantId} FOR UPDATE`,
      );
      await this.assertConnections(tx, current.tenantId, dto.connectionIds ?? []);
      const nameMatches = await this.findDepartmentsByNormalizedName(tx, current.tenantId, name);
      const activeMatch = nameMatches.find((department) => department.active);
      if (activeMatch) {
        throw new BadRequestException("Já existe um departamento com este nome.");
      }
      const inactiveMatch = nameMatches[0];
      if (inactiveMatch) {
        await tx.departmentConnection.deleteMany({
          where: { tenantId: current.tenantId, departmentId: inactiveMatch.id },
        });
        return tx.department.update({
          where: { id: inactiveMatch.id },
          data: {
            name: nameMatches.length === 1 ? name : inactiveMatch.name,
            description: dto.description?.trim() || null,
            color: dto.color ?? "#3B82F6",
            icon: dto.icon ?? "department",
            active: dto.active ?? true,
            connections: {
              create: dto.connectionIds.map((connectionId) => ({
                connectionId,
              })),
            },
          },
          include: { connections: { select: { connectionId: true } } },
        });
      }
      return tx.department.create({
        data: {
          tenantId: current.tenantId,
          name,
          description: dto.description?.trim() || null,
          color: dto.color ?? "#3B82F6",
          icon: dto.icon ?? "department",
          active: dto.active ?? true,
          connections: {
            create: (dto.connectionIds ?? []).map((connectionId) => ({
              connectionId,
            })),
          },
        },
        include: { connections: { select: { connectionId: true } } },
      });
    });
    return this.serialize(department);
  }

  @Patch(":id")
  @RequirePermissions("departments.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    if (dto.active === false) {
      throw new BadRequestException(
        "Use o fluxo de inativação para validar e migrar as conversas abertas.",
      );
    }
    const existing = await this.findDepartmentOrThrow(id, current.tenantId);
    const department = await this.prisma.$transaction(async (tx) => {
      if (typeof (tx as Partial<Prisma.TransactionClient>).$queryRaw === "function") {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "departments" WHERE id = ${id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
        );
      }
      if (dto.name !== undefined) {
        await this.ensureNameAvailable(tx, current.tenantId, dto.name.trim(), existing.id);
      }
      if (dto.connectionIds !== undefined) {
        await this.assertConnections(tx, current.tenantId, dto.connectionIds);
        await tx.departmentConnection.deleteMany({
          where: { tenantId: current.tenantId, departmentId: existing.id },
        });
      }
      return tx.department.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          color: dto.color,
          icon: dto.icon,
          active: dto.active,
          connections:
            dto.connectionIds === undefined
              ? undefined
              : {
                  create: (dto.connectionIds ?? []).map((connectionId) => ({
                    connectionId,
                  })),
                },
        },
        include: { connections: { select: { connectionId: true } } },
      });
    });
    return this.serialize(department);
  }

  @Delete(":id")
  @RequirePermissions("departments.delete")
  async remove(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "departments" WHERE id = ${id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "roles" WHERE "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "user_invitations" WHERE "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      const state = await this.departmentDeletionState(tx, id, current.tenantId);
      const impact = this.departmentDeletionImpact(state);
      if (impact.snapshotToken !== dto.snapshotToken) return changedDeletion(impact);

      await tx.departmentMembership.deleteMany({
        where: { tenantId: current.tenantId, departmentId: id },
      });
      await tx.departmentConnection.deleteMany({
        where: { tenantId: current.tenantId, departmentId: id },
      });
      await Promise.all([
        tx.contact.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.conversation.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.ticket.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.lead.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.quickReply.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.automationRule.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
        tx.notification.updateMany({
          where: { tenantId: current.tenantId, departmentId: id },
          data: { departmentId: null },
        }),
      ]);
      for (const role of state.roles) {
        await tx.role.update({
          where: { id: role.id },
          data: { metadata: role.sanitizedMetadata as Prisma.InputJsonValue },
        });
      }
      for (const invitation of state.invitations) {
        await tx.userInvitation.update({
          where: { id: invitation.id },
          data: { departmentIds: invitation.departmentIds.filter((item) => item !== id) },
        });
      }
      await tx.department.delete({ where: { id } });
      return { status: "deleted" as const };
    });
  }

  @Get(":id/deletion-preview")
  @RequirePermissions("departments.delete")
  async deletionPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const state = await this.departmentDeletionState(this.prisma, id, current.tenantId);
    return this.departmentDeletionImpact(state);
  }

  @Post(":id/members")
  @RequirePermissions("departments.update")
  async assignMember(
    @Param("id") id: string,
    @Body() dto: AssignDepartmentMemberDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findDepartmentOrThrow(id, current.tenantId);
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: dto.membershipId, tenantId: current.tenantId, status: "ACTIVE" },
    });
    if (!membership) throw new BadRequestException("Membership inexistente para este tenant.");

    return this.prisma.departmentMembership.upsert({
      where: { departmentId_membershipId: { departmentId: id, membershipId: dto.membershipId } },
      update: {},
      create: { tenantId: current.tenantId, departmentId: id, membershipId: dto.membershipId },
    });
  }

  @Delete(":id/members/:membershipId")
  @RequirePermissions("departments.update")
  async removeMember(
    @Param("id") id: string,
    @Param("membershipId") membershipId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findDepartmentOrThrow(id, current.tenantId);
    await this.prisma.departmentMembership.deleteMany({
      where: { tenantId: current.tenantId, departmentId: id, membershipId },
    });
    return { ok: true };
  }

  private async departmentDeletionState(
    db: DepartmentDeletionClient,
    id: string,
    tenantId: string,
  ) {
    const department = await db.department.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, active: true, updatedAt: true },
    });
    if (!department) throw new NotFoundException("Departamento não encontrado.");
    const [
      memberships,
      connections,
      contacts,
      conversations,
      tickets,
      leads,
      quickReplies,
      automations,
      notifications,
      storedRoles,
      invitations,
    ] = await Promise.all([
      db.departmentMembership.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          membership: {
            select: {
              id: true,
              presentationName: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      }),
      db.departmentConnection.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { connectionId: true, connection: { select: { name: true } } },
      }),
      db.contact.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, phone: true, updatedAt: true },
      }),
      db.conversation.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          protocol: true,
          updatedAt: true,
          contact: { select: { name: true } },
        },
      }),
      db.ticket.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, protocol: true, title: true, updatedAt: true },
      }),
      db.lead.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, updatedAt: true, contact: { select: { name: true } } },
      }),
      db.quickReply.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, shortcut: true, updatedAt: true },
      }),
      db.automationRule.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, updatedAt: true },
      }),
      db.notification.findMany({
        where: { tenantId, departmentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, createdAt: true },
      }),
      db.role.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, metadata: true, updatedAt: true },
      }),
      db.userInvitation.findMany({
        where: { tenantId, departmentIds: { has: id } },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, departmentIds: true, updatedAt: true },
      }),
    ]);
    const roles = storedRoles.flatMap((role) => {
      const sanitizedMetadata = removeDepartmentFromRoleMetadata(role.metadata, id);
      return sanitizedMetadata ? [{ ...role, sanitizedMetadata }] : [];
    });
    return {
      department,
      memberships,
      connections,
      contacts,
      conversations,
      tickets,
      leads,
      quickReplies,
      automations,
      notifications,
      roles,
      invitations,
    };
  }

  private departmentDeletionImpact(
    state: Awaited<ReturnType<DepartmentsController["departmentDeletionState"]>>,
  ): DeletionImpactPreview {
    const dependencies: DeletionImpactPreview["dependencies"] = [
      deletionDependency(
        "memberships",
        "Atendentes vinculados",
        state.memberships.map((item) => ({
          id: item.membership.id,
          label:
            item.membership.presentationName ||
            item.membership.user.name ||
            item.membership.user.email,
          description: item.membership.user.email,
        })),
        "Os vínculos com o departamento serão removidos; os atendentes serão preservados.",
      ),
      deletionDependency(
        "contacts",
        "Contatos vinculados",
        state.contacts.map((item) => ({ id: item.id, label: item.name, description: item.phone })),
        "O departamento será removido dos contatos; os contatos serão preservados.",
      ),
      deletionDependency(
        "conversations",
        "Conversas vinculadas",
        state.conversations.map((item) => ({
          id: item.id,
          label: item.protocol || item.contact.name,
          description: item.contact.name,
        })),
        "As conversas ficarão sem departamento e serão preservadas.",
      ),
      deletionDependency(
        "tickets",
        "Chamados vinculados",
        state.tickets.map((item) => ({
          id: item.id,
          label: item.protocol,
          description: item.title,
        })),
        "Os chamados ficarão como “Sem departamento” e serão preservados.",
      ),
      deletionDependency(
        "leads",
        "Leads vinculados",
        state.leads.map((item) => ({ id: item.id, label: item.contact.name })),
        "Os leads ficarão sem departamento e serão preservados.",
      ),
      deletionDependency(
        "quick-replies",
        "Mensagens rápidas vinculadas",
        state.quickReplies.map((item) => ({
          id: item.id,
          label: item.title,
          description: `/${item.shortcut.replace(/^\//, "")}`,
        })),
        "As mensagens rápidas ficarão sem departamento e serão preservadas.",
      ),
      deletionDependency(
        "automations",
        "Automações vinculadas",
        state.automations.map((item) => ({ id: item.id, label: item.name })),
        "As automações ficarão sem departamento e serão preservadas.",
      ),
      deletionDependency(
        "notifications",
        "Notificações vinculadas",
        state.notifications.map((item) => ({ id: item.id, label: item.title })),
        "As notificações ficarão sem departamento e serão preservadas.",
      ),
      deletionDependency(
        "roles",
        "Perfis de acesso referenciando o departamento",
        state.roles.map((item) => ({ id: item.id, label: item.name })),
        "O departamento e a preferência de favorito serão removidos dos escopos.",
      ),
      deletionDependency(
        "invitations",
        "Convites referenciando o departamento",
        state.invitations.map((item) => ({ id: item.id, label: item.email })),
        "O departamento será removido dos convites; os convites serão preservados.",
      ),
      deletionDependency(
        "connections",
        "Instâncias vinculadas",
        state.connections.map((item) => ({
          id: item.connectionId,
          label: item.connection.name,
        })),
        "Os vínculos entre departamento e instância serão removidos.",
      ),
    ];
    return {
      snapshotToken: deletionSnapshot({
        department: [state.department.id, state.department.updatedAt],
        memberships: state.memberships.map((item) => item.id),
        connections: state.connections.map((item) => item.connectionId),
        contacts: state.contacts.map((item) => [item.id, item.updatedAt]),
        conversations: state.conversations.map((item) => [item.id, item.updatedAt]),
        tickets: state.tickets.map((item) => [item.id, item.updatedAt]),
        leads: state.leads.map((item) => [item.id, item.updatedAt]),
        quickReplies: state.quickReplies.map((item) => [item.id, item.updatedAt]),
        automations: state.automations.map((item) => [item.id, item.updatedAt]),
        notifications: state.notifications.map((item) => [item.id, item.createdAt]),
        roles: state.roles.map((item) => [item.id, item.updatedAt]),
        invitations: state.invitations.map((item) => [item.id, item.updatedAt]),
      }),
      title: "Excluir Departamento?",
      prompt:
        "Revise os vínculos que serão removidos. Os registros relacionados serão preservados.",
      record: {
        name: state.department.name,
        identifiers: [
          { label: "Status", value: state.department.active ? "Ativo" : "Inativo" },
        ],
      },
      dependencies,
      consequences: [
        {
          id: "department",
          text: "O departamento será excluído definitivamente e não poderá ser recuperado.",
          irreversible: true,
        },
      ],
      confirmation: {
        level: "standard",
        confirmLabel: "Confirmar",
      },
    };
  }

  private async findDepartmentOrThrow(id: string, tenantId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
      include: {
        connections: {
          where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
          select: { connectionId: true },
        },
      },
    });
    if (!department) throw new NotFoundException("Departamento não encontrado.");
    return department;
  }

  private async ensureNameAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    name: string,
    excludeDepartmentId?: string,
  ) {
    const departments = await this.findDepartmentsByNormalizedName(tx, tenantId, name);
    const duplicate = departments.find((department) => department.id !== excludeDepartmentId);
    if (duplicate) {
      throw new BadRequestException("Já existe um departamento com este nome.");
    }
  }

  private async findDepartmentsByNormalizedName(
    tx: Prisma.TransactionClient,
    tenantId: string,
    name: string,
  ) {
    const normalizedName = normalizeDepartmentName(name);
    const departments = await tx.department.findMany({
      where: { tenantId },
      select: { id: true, name: true, active: true },
    });
    return departments.filter(
      (department) => normalizeDepartmentName(department.name) === normalizedName,
    );
  }

  private serialize(department: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string;
    active: boolean;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
    connections?: Array<{ connectionId: string }>;
  }) {
    return {
      id: department.id,
      tenantId: department.tenantId,
      name: department.name,
      description: department.description,
      color: department.color,
      icon: department.icon,
      connectionIds: department.connections?.map((connection) => connection.connectionId) ?? [],
      active: department.active,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }

  private async assertConnections(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionIds: string[],
  ) {
    const uniqueIds = [...new Set(connectionIds)];
    const count = await tx.messagingConnection.count({
      where: { tenantId, id: { in: uniqueIds }, providerType: "EVOLUTION", archivedAt: null },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("Instância inexistente para esta organização.");
    }
  }

  private async deactivateDepartment(
    id: string,
    targets: Array<{ connectionId?: string | null; departmentId: string }>,
    current: AuthenticatedUser,
  ) {
    if (!this.messages) throw new Error("MessagesService indisponível.");
    const messages = this.messages;
    const targetByConnection = new Map<string, string>();
    for (const target of targets) {
      const key = target.connectionId ?? "";
      if (targetByConnection.has(key)) {
        throw new BadRequestException("Informe somente um destino por instância.");
      }
      targetByConnection.set(key, target.departmentId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "departments" WHERE id = ${id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      const source = await tx.department.findFirst({
        where: { id, tenantId: current.tenantId },
        include: {
          connections: {
            where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
            select: { connectionId: true },
          },
        },
      });
      if (!source) throw new NotFoundException("Departamento não encontrado.");
      if (!source.active) return { department: source, migrated: [] };

      const conversations = await tx.conversation.findMany({
        where: {
          tenantId: current.tenantId,
          departmentId: source.id,
          status: { not: ConversationStatus.FECHADA },
          archivedAt: null,
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          connectionId: true,
          assignedMembershipId: true,
        },
      });
      const connectionKeys = [...new Set(conversations.map((item) => item.connectionId ?? ""))];
      if (connectionKeys.some((key) => !targetByConnection.has(key))) {
        throw new BadRequestException(
          "Selecione um departamento de destino para cada instância com conversas abertas.",
        );
      }

      const destinations = new Map<string, { id: string; name: string }>();
      for (const key of connectionKeys) {
        const targetId = targetByConnection.get(key)!;
        if (targetId === source.id) {
          throw new BadRequestException("O departamento de destino deve ser diferente da origem.");
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "departments" WHERE id = ${targetId} AND "tenantId" = ${current.tenantId} FOR SHARE`,
        );
        const target = await tx.department.findFirst({
          where: {
            id: targetId,
            tenantId: current.tenantId,
            active: true,
            AND: [
              departmentIdAccess(current),
              ...(key ? [{ connections: { some: { connectionId: key } } }] : []),
            ],
          },
          select: { id: true, name: true },
        });
        if (!target) {
          throw new BadRequestException(
            "Departamento de destino inativo, inexistente ou incompatível com a instância.",
          );
        }
        destinations.set(key, target);
      }

      const assignedMembershipIds = [
        ...new Set(
          conversations.flatMap((conversation) =>
            conversation.assignedMembershipId ? [conversation.assignedMembershipId] : [],
          ),
        ),
      ];
      const assignedMemberships = await tx.tenantMembership.findMany({
        where: { id: { in: assignedMembershipIds }, tenantId: current.tenantId },
        include: { role: true, user: true },
      });
      const assignedMembershipById = new Map(
        assignedMemberships.map((membership) => [membership.id, membership]),
      );

      const migrated: Array<{
        id: string;
        assignedMembershipId: string | null;
        departmentId: string;
        updatedAt: Date;
      }> = [];
      for (const conversation of conversations) {
        const destination = destinations.get(conversation.connectionId ?? "")!;
        if (conversation.assignedMembershipId) {
          const membership = assignedMembershipById.get(conversation.assignedMembershipId);
          if (
            !membership ||
            membership.status !== MembershipStatus.ACTIVE ||
            membership.user.status !== "ACTIVE"
          ) {
            throw new BadRequestException(
              "Existe uma conversa atribuída a um atendente inativo ou inexistente.",
            );
          }
          if (membership.role.key !== "tenant_admin") {
            const connectionAllowed = conversation.connectionId
              ? (roleConnectionIds(membership.role) ?? []).includes(conversation.connectionId)
              : true;
            const departmentAllowed = conversation.connectionId
              ? roleChatScopes(membership.role).some(
                  (scope) =>
                    scope.connectionId === conversation.connectionId &&
                    scope.departmentIds.includes(destination.id),
                )
              : (roleChatDepartmentIds(membership.role) ?? []).includes(destination.id);
            if (!connectionAllowed || !departmentAllowed) {
              throw new BadRequestException(
                "O perfil de um atendente atribuído não permite o departamento de destino.",
              );
            }
          }
        }
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { departmentId: destination.id },
        });
        await messages.createSystemMessage(
          tx,
          conversation.id,
          current,
          `Conversa transferida do departamento ${source.name} para o departamento ${destination.name} devido à inativação.`,
        );
        const refreshed = await tx.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
          select: { id: true, assignedMembershipId: true, updatedAt: true },
        });
        migrated.push({ ...refreshed, departmentId: destination.id });
      }

      const department = await tx.department.update({
        where: { id: source.id },
        data: { active: false },
        include: {
          connections: {
            where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
            select: { connectionId: true },
          },
        },
      });
      return { department, migrated };
    });

    for (const conversation of result.migrated) {
      this.realtime?.publishAssignmentUpdated({
        tenantId: current.tenantId,
        conversationId: conversation.id,
        previousMembershipId: conversation.assignedMembershipId,
        membershipId: conversation.assignedMembershipId,
        departmentId: conversation.departmentId,
        updatedAt: conversation.updatedAt,
      });
      this.realtime?.publishConversationUpdated({
        tenantId: current.tenantId,
        conversationId: conversation.id,
        reason: "department.deactivated",
      });
    }
    return this.serialize(result.department);
  }
}

function normalizeDepartmentName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function deletionDependency(
  id: string,
  label: string,
  items: Array<{ id: string; label: string; description?: string }>,
  operationLabel: string,
): DeletionImpactPreview["dependencies"][number] {
  return {
    id,
    label,
    count: items.length,
    operation: "unlink",
    operationLabel,
    items: items.slice(0, 10),
    hasMore: items.length > 10,
  };
}

function removeDepartmentFromRoleMetadata(metadata: unknown, departmentId: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const before = JSON.stringify(metadata);
  const next = JSON.parse(before) as Record<string, unknown>;
  if (Array.isArray(next.chatScopes)) {
    const scopes = next.chatScopes.flatMap((scope) => {
      if (!scope || typeof scope !== "object" || Array.isArray(scope)) return [scope];
      const current = { ...(scope as Record<string, unknown>) };
      if (!Array.isArray(current.departmentIds)) return [current];
      const departmentIds = current.departmentIds.filter((item) => item !== departmentId);
      if (departmentIds.length === 0) return [];
      current.departmentIds = departmentIds;
      if (current.favoriteDepartmentId === departmentId) current.favoriteDepartmentId = null;
      return [current];
    });
    next.chatScopes = scopes;
    const validScopes = scopes.filter(
      (scope): scope is Record<string, unknown> =>
        !!scope && typeof scope === "object" && !Array.isArray(scope),
    );
    next.connectionIds = validScopes.flatMap((scope) =>
      typeof scope.connectionId === "string" ? [scope.connectionId] : [],
    );
    next.departmentIds = [
      ...new Set(
        validScopes.flatMap((scope) =>
          Array.isArray(scope.departmentIds)
            ? scope.departmentIds.filter((item): item is string => typeof item === "string")
            : [],
        ),
      ),
    ];
  } else if (Array.isArray(next.departmentIds)) {
    next.departmentIds = next.departmentIds.filter((item) => item !== departmentId);
  }
  if (next.favoriteDepartmentId === departmentId) next.favoriteDepartmentId = null;
  return JSON.stringify(next) === before ? null : next;
}
