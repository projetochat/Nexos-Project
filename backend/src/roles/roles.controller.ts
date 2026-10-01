import { RealtimeService } from "../realtime/realtime.service";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { isPermissionKey, PERMISSIONS } from "../auth/permissions.constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import type { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  @Get("permissions")
  @RequirePermissions("roles.read")
  listPermissions() {
    return PERMISSIONS.map((id) => ({ id }));
  }

  @Get("roles")
  @RequirePermissions("roles.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: current.tenantId },
      orderBy: [{ system: "desc" }, { name: "asc" }],
      include: { permissions: true },
    });
    return roles.map((role) => this.serialize(role));
  }

  @Get("roles/:id")
  @RequirePermissions("roles.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const role = await this.findRoleOrThrow(id, current.tenantId);
    return this.serialize(role);
  }

  @Post("roles")
  @RequirePermissions("roles.manage")
  async create(@Body() dto: CreateRoleDto, @CurrentUser() current: AuthenticatedUser) {
    this.assertPermissions(dto.permissionIds);
    this.assertPermissionDependencies(dto.permissionIds);
    this.assertCanGrantPermissions(dto.permissionIds, current);
    await this.assertMetadataScope(dto.metadata, current);
    const name = dto.name.trim();
    const key = (dto.key ?? name)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!key) throw new BadRequestException("Key de role invalida.");
    if (key === "tenant_admin" || normalizeRoleName(name) === "administrador") {
      throw new BadRequestException("O nome Administrador é reservado para gestão do sistema.");
    }

    const role = await this.prisma.$transaction(async (tx) => {
      await this.ensureNameAvailable(tx, current.tenantId, name);
      await this.ensurePermissions(tx, dto.permissionIds);
      return tx.role.create({
        data: {
          tenantId: current.tenantId,
          key,
          name,
          description: dto.description?.trim() || null,
          metadata:
            dto.metadata === undefined ? undefined : JSON.parse(JSON.stringify(dto.metadata)),
          system: false,
          permissions: {
            create: [...new Set(dto.permissionIds)].map((permissionId) => ({ permissionId })),
          },
        },
        include: { permissions: true },
      });
    });
    return this.serialize(role);
  }

  @Patch("roles/:id")
  @RequirePermissions("roles.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findRoleOrThrow(id, current.tenantId);
    this.assertAdministratorRoleProtected(existing);
    if (dto.name !== undefined && normalizeRoleName(dto.name) === "administrador") {
      throw new BadRequestException("O nome Administrador é reservado para gestão do sistema.");
    }
    if (dto.permissionIds) {
      this.assertPermissions(dto.permissionIds);
      this.assertPermissionDependencies(dto.permissionIds);
    }
    if (dto.permissionIds) {
      this.assertCanGrantPermissions(
        dto.permissionIds,
        current,
        existing.permissions.map((permission) => permission.permissionId),
      );
    }
    await this.assertMetadataScope(dto.metadata, current, existing.metadata);
    const role = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await this.ensureNameAvailable(tx, current.tenantId, dto.name.trim(), existing.id);
      }
      if (dto.permissionIds) {
        await this.ensurePermissions(tx, dto.permissionIds);
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.rolePermission.createMany({
          data: [...new Set(dto.permissionIds)].map((permissionId) => ({
            roleId: existing.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
      return tx.role.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          metadata:
            dto.metadata === undefined ? undefined : JSON.parse(JSON.stringify(dto.metadata)),
        },
        include: { permissions: true },
      });
    });
    this.realtime.publish({ tenantId: current.tenantId }, "instance-access.updated", {
      roleId: role.id,
    });
    return this.serialize(role);
  }

  @Delete("roles/:id")
  @RequirePermissions("roles.delete")
  async remove(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const role = await this.findRoleOrThrow(id, current.tenantId);
    this.assertAdministratorRoleProtected(role);
    const inUse = await this.prisma.tenantMembership.count({
      where: { tenantId: current.tenantId, roleId: id },
    });
    if (inUse > 0)
      throw new BadRequestException(
        "Perfil de Acesso não pode ser excluído pois possui atendentes vinculados.",
      );
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  private async findRoleOrThrow(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { permissions: true },
    });
    if (!role) throw new NotFoundException("Role não encontrada.");
    return role;
  }

  private assertPermissions(permissionIds: string[]) {
    const invalid = permissionIds.find((permissionId) => !isPermissionKey(permissionId));
    if (invalid) throw new BadRequestException(`Permission invalida: ${invalid}`);
  }

  private assertCanGrantPermissions(
    permissionIds: string[],
    current: AuthenticatedUser,
    existingPermissionIds: string[] = [],
  ) {
    if (current.roleKey === "tenant_admin") return;
    // D-001 mantém as permissões efetivas liberadas em runtime, mas a delegação
    // de um perfil continua limitada às permissões realmente atribuídas ao autor.
    const granted = new Set<string>(current.assignedPermissionIds ?? current.permissions ?? []);
    const requested = new Set(permissionIds);
    const existing = new Set(existingPermissionIds);
    const changed = [
      ...permissionIds.filter((permissionId) => !existing.has(permissionId)),
      ...existingPermissionIds.filter((permissionId) => !requested.has(permissionId)),
    ];
    const forbidden = changed.find((permissionId) => !granted.has(permissionId));
    if (forbidden) {
      throw new ForbiddenException(
        "Você não pode adicionar ou remover uma permissão que não possui.",
      );
    }
  }

  private assertPermissionDependencies(permissionIds: string[]) {
    const requested = new Set(permissionIds);
    for (const [readPermission, childPermissions] of Object.entries(PERMISSION_DEPENDENCIES)) {
      if (requested.has(readPermission)) continue;
      const child = childPermissions.find((permissionId) => requested.has(permissionId));
      if (child) {
        throw new BadRequestException(
          `A permissão ${readPermission} é obrigatória para habilitar ${child}.`,
        );
      }
    }
  }

  private async assertMetadataScope(
    metadata: unknown,
    current: AuthenticatedUser,
    existingMetadata?: unknown,
  ) {
    if (metadata === undefined) return;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new BadRequestException("Configuração do perfil inválida.");
    }
    const requestedValue = (metadata as { connectionIds?: unknown }).connectionIds;
    if (requestedValue === undefined) return;
    if (!Array.isArray(requestedValue) || requestedValue.some((id) => typeof id !== "string")) {
      throw new BadRequestException("Escopo de instâncias inválido.");
    }
    const requested = [...new Set(requestedValue as string[])];
    const existing = new Set(
      Array.isArray((existingMetadata as { connectionIds?: unknown } | null)?.connectionIds)
        ? ((existingMetadata as { connectionIds: unknown[] }).connectionIds.filter(
            (id): id is string => typeof id === "string",
          ) as string[])
        : [],
    );
    const added = requested.filter((id) => !existing.has(id));
    if (added.length) {
      const count = await this.prisma.messagingConnection.count({
        where: { tenantId: current.tenantId, id: { in: added }, archivedAt: null },
      });
      if (count !== added.length) {
        throw new BadRequestException("Instância inexistente para esta organização.");
      }
    }
    if (current.roleKey === "tenant_admin") return;
    const allowed = new Set(current.connectionIds ?? []);
    const requestedSet = new Set(requested);
    const changed = [
      ...requested.filter((id) => !existing.has(id)),
      ...[...existing].filter((id) => !requestedSet.has(id)),
    ];
    const forbidden = changed.find((id) => !allowed.has(id));
    if (forbidden) {
      throw new ForbiddenException(
        "Você não pode adicionar ou remover uma instância fora do seu escopo.",
      );
    }
  }

  private assertAdministratorRoleProtected(role: { key: string; name: string }) {
    if (role.key === "tenant_admin" || normalizeRoleName(role.name) === "administrador") {
      throw new BadRequestException("O perfil Administrador é reservado e não pode ser alterado.");
    }
  }

  private async ensurePermissions(tx: Prisma.TransactionClient, permissionIds: string[]) {
    await Promise.all(
      [...new Set(permissionIds)].map((permissionId) =>
        tx.permission.upsert({
          where: { id: permissionId },
          update: {},
          create: { id: permissionId, description: permissionId },
        }),
      ),
    );
  }

  private async ensureNameAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    name: string,
    excludeRoleId?: string,
  ) {
    const normalizedName = normalizeRoleName(name);
    const roles = await tx.role.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const duplicate = roles.find(
      (role) => role.id !== excludeRoleId && normalizeRoleName(role.name) === normalizedName,
    );
    if (duplicate) {
      throw new BadRequestException("Já existe um perfil de acesso com este nome.");
    }
  }

  private serialize(role: {
    id: string;
    tenantId: string;
    key: string;
    name: string;
    description: string | null;
    metadata: unknown;
    system: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: Array<{ permissionId: string }>;
  }) {
    return {
      id: role.id,
      tenantId: role.tenantId,
      key: role.key,
      name: role.name,
      description: role.description,
      metadata: role.metadata,
      system: role.system,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      permissionIds: role.permissions.map((permission) => permission.permissionId),
    };
  }
}

const PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  "dashboard.read": ["dashboard.manage", "dashboard.delete"],
  "users.read": ["users.manage", "users.delete"],
  "departments.read": ["departments.manage", "departments.delete"],
  "roles.read": ["roles.manage", "roles.delete"],
  "crm.read": ["crm.manage"],
  "contacts.read": ["contacts.manage", "contacts.delete"],
  "conversations.read": [
    "conversations.assign",
    "conversations.manage",
    "messages.send",
    "chat.contacts.edit",
    "chat.contacts.create",
    "chat.contacts.read",
    "chat.phone.read",
    "chat.customer_link.edit",
    "chat.tags.use",
    "chat.contacts.block",
    "chat.messages.delete",
    "chat.messages.edit",
    "chat.audio.send",
    "chat.agent_name.show",
    "chat.conversations.view_all_active",
    "tickets.create",
  ],
  "connections.read": ["connections.manage", "connections.delete"],
  "groups.read": ["groups.manage"],
  "chat.tags.read": ["chat.tags.manage", "chat.tags.delete"],
  "chat.quick_replies.read": ["chat.quick_replies.manage", "chat.quick_replies.delete"],
  "chat.leads.read": ["leads.manage"],
  "notifications.read": ["notifications.manage"],
  "automations.read": ["automations.manage", "automations.delete"],
  "tickets.read": [
    "tickets.update",
    "tickets.assign",
    "tickets.status.update",
    "tickets.comment",
    "tickets.attachments.upload",
    "tickets.attachments.delete",
    "tickets.manage",
    "tickets.delete",
  ],
  "campaigns.read": [
    "campaigns.create",
    "campaigns.update",
    "campaigns.schedule",
    "campaigns.start",
    "campaigns.pause",
    "campaigns.cancel",
    "campaigns.duplicate",
    "campaigns.recipients.read",
    "campaigns.manage",
    "campaigns.delete",
  ],
  "schedules.read": ["schedules.manage", "schedules.delete"],
  "bot_flows.read": ["bot_flows.manage", "bot_flows.delete"],
  "ai_agents.read": ["ai_agents.manage", "ai_agents.delete"],
  "settings.read": ["settings.manage", "settings.delete"],
};

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}
