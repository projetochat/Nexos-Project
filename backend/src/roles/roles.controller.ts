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
import { roleChatScopes } from "../auth/connection-access";
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

  @Get("roles/scope-options")
  @RequirePermissions("roles.read")
  async scopeOptions(@CurrentUser() current: AuthenticatedUser) {
    const connectionIds = current.roleKey === "tenant_admin" ? null : (current.connectionIds ?? []);
    const departmentIds =
      current.roleKey === "tenant_admin" ? null : (current.chatDepartmentIds ?? []);
    const editorScopes =
      current.chatScopes ??
      (current.connectionIds ?? []).map((connectionId) => ({
        connectionId,
        departmentIds: current.chatDepartmentIds ?? [],
        favoriteDepartmentId: null,
      }));
    const [connections, departments] = await Promise.all([
      this.prisma.messagingConnection.findMany({
        where: {
          tenantId: current.tenantId,
          providerType: "EVOLUTION",
          archivedAt: null,
          ...(connectionIds === null ? {} : { id: { in: connectionIds } }),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          departments: {
            where: { department: { active: true } },
            select: {
              department: {
                select: { id: true, name: true, description: true, color: true, icon: true },
              },
            },
          },
        },
      }),
      this.prisma.department.findMany({
        where: {
          tenantId: current.tenantId,
          active: true,
          ...(departmentIds === null ? {} : { id: { in: departmentIds } }),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    return {
      connections: connections.map((connection) => ({
        id: connection.id,
        name: connection.name,
        status: connection.status.toLowerCase(),
        departments: (connection.departments ?? [])
          .map(({ department }) => department)
          .filter(
            (department) =>
              current.roleKey === "tenant_admin" ||
              editorScopes.some(
                (scope) =>
                  scope.connectionId === connection.id &&
                  scope.departmentIds.includes(department.id),
              ),
          ),
      })),
      departments,
    };
  }

  @Get("roles/:id")
  @RequirePermissions("roles.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const role = await this.findRoleOrThrow(id, current.tenantId);
    return this.serialize(role);
  }

  @Post("roles")
  @RequirePermissions("roles.create")
  async create(@Body() dto: CreateRoleDto, @CurrentUser() current: AuthenticatedUser) {
    const permissionIds = normalizePermissionIds(dto.permissionIds);
    this.assertPermissions(permissionIds);
    this.assertPermissionDependencies(permissionIds);
    this.assertCanGrantPermissions(permissionIds, current);
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
      await this.ensurePermissions(tx, permissionIds);
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
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: { permissions: true },
      });
    });
    return this.serialize(role);
  }

  @Patch("roles/:id")
  @RequirePermissions("roles.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findRoleOrThrow(id, current.tenantId);
    this.assertAdministratorRoleProtected(existing);
    const permissionIds = dto.permissionIds ? normalizePermissionIds(dto.permissionIds) : undefined;
    if (dto.name !== undefined && normalizeRoleName(dto.name) === "administrador") {
      throw new BadRequestException("O nome Administrador é reservado para gestão do sistema.");
    }
    if (permissionIds) {
      this.assertPermissions(permissionIds);
      this.assertPermissionDependencies(permissionIds);
    }
    if (permissionIds) {
      this.assertCanGrantPermissions(
        permissionIds,
        current,
        normalizePermissionIds(existing.permissions.map((permission) => permission.permissionId)),
      );
    }
    await this.assertMetadataScope(dto.metadata, current, existing.metadata);
    const role = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await this.ensureNameAvailable(tx, current.tenantId, dto.name.trim(), existing.id);
      }
      if (permissionIds) {
        await this.ensurePermissions(tx, permissionIds);
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
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
    const granted = new Set<string>(
      normalizePermissionIds(current.assignedPermissionIds ?? current.permissions ?? []),
    );
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
    const requestedMetadata = metadata as {
      connectionIds?: unknown;
      departmentIds?: unknown;
      chatScopes?: unknown;
    };
    const existing = (existingMetadata ?? {}) as {
      connectionIds?: unknown;
      departmentIds?: unknown;
      chatScopes?: unknown;
    };
    await this.assertScopeIds(
      {
        requestedValue: requestedMetadata.connectionIds,
        existingValue: existing.connectionIds,
        allowedIds: current.connectionIds,
        label: "instâncias",
        count: (ids) =>
          this.prisma.messagingConnection.count({
            where: { tenantId: current.tenantId, id: { in: ids }, archivedAt: null },
          }),
      },
      current,
    );
    await this.assertScopeIds(
      {
        requestedValue: requestedMetadata.departmentIds,
        existingValue: existing.departmentIds,
        allowedIds: current.chatDepartmentIds,
        label: "departamentos",
        count: (ids) =>
          this.prisma.department.count({
            where: { tenantId: current.tenantId, id: { in: ids }, active: true },
          }),
      },
      current,
    );
    await this.assertChatScopes(requestedMetadata.chatScopes, existing.chatScopes, current);
  }

  private async assertChatScopes(
    requestedValue: unknown,
    existingValue: unknown,
    current: AuthenticatedUser,
  ) {
    if (requestedValue === undefined) return;
    if (!Array.isArray(requestedValue)) {
      throw new BadRequestException("Visualização do atendimento inválida.");
    }
    for (const item of requestedValue) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new BadRequestException("Visualização do atendimento inválida.");
      }
      const raw = item as Record<string, unknown>;
      if (
        typeof raw.connectionId !== "string" ||
        !Array.isArray(raw.departmentIds) ||
        raw.departmentIds.some((id) => typeof id !== "string") ||
        !(
          raw.favoriteDepartmentId === null ||
          raw.favoriteDepartmentId === undefined ||
          typeof raw.favoriteDepartmentId === "string"
        )
      ) {
        throw new BadRequestException("Visualização do atendimento inválida.");
      }
      if (
        typeof raw.favoriteDepartmentId === "string" &&
        !raw.departmentIds.includes(raw.favoriteDepartmentId)
      ) {
        throw new BadRequestException("O departamento favorito precisa estar liberado.");
      }
    }
    const parse = (value: unknown) =>
      roleChatScopes({ key: "custom", metadata: { chatScopes: value } });
    const requested = parse(requestedValue);
    if (requested.length !== requestedValue.length) {
      throw new BadRequestException("Visualização do atendimento inválida.");
    }
    const connectionIds = requested.map((scope) => scope.connectionId);
    if (new Set(connectionIds).size !== connectionIds.length) {
      throw new BadRequestException("Cada instância pode aparecer apenas uma vez no perfil.");
    }
    for (const scope of requested) {
      const linked = await this.prisma.departmentConnection.count({
        where: {
          tenantId: current.tenantId,
          connectionId: scope.connectionId,
          departmentId: { in: scope.departmentIds },
          department: { active: true },
          connection: { archivedAt: null },
        },
      });
      if (linked !== new Set(scope.departmentIds).size) {
        throw new BadRequestException(
          "Há um departamento que não está vinculado à instância selecionada.",
        );
      }
    }
    if (current.roleKey === "tenant_admin") return;
    const currentScopes =
      current.chatScopes ??
      (current.connectionIds ?? []).map((connectionId) => ({
        connectionId,
        departmentIds: current.chatDepartmentIds ?? [],
        favoriteDepartmentId: null,
      }));
    const allowedPairs = new Set(
      currentScopes.flatMap((scope) =>
        scope.departmentIds.map((departmentId) => `${scope.connectionId}:${departmentId}`),
      ),
    );
    const existingPairs = new Set(
      parse(existingValue).flatMap((scope) =>
        scope.departmentIds.map((departmentId) => `${scope.connectionId}:${departmentId}`),
      ),
    );
    const requestedPairs = new Set(
      requested.flatMap((scope) =>
        scope.departmentIds.map((departmentId) => `${scope.connectionId}:${departmentId}`),
      ),
    );
    const changed = [
      ...[...requestedPairs].filter((pair) => !existingPairs.has(pair)),
      ...[...existingPairs].filter((pair) => !requestedPairs.has(pair)),
    ];
    if (changed.some((pair) => !allowedPairs.has(pair))) {
      throw new ForbiddenException(
        "Você não pode alterar uma visualização fora do seu próprio escopo.",
      );
    }
  }

  private async assertScopeIds(
    input: {
      requestedValue: unknown;
      existingValue: unknown;
      allowedIds: string[] | null | undefined;
      label: string;
      count: (ids: string[]) => Promise<number>;
    },
    current: AuthenticatedUser,
  ) {
    if (input.requestedValue === undefined) return;
    if (
      !Array.isArray(input.requestedValue) ||
      input.requestedValue.some((id) => typeof id !== "string")
    ) {
      throw new BadRequestException(`Escopo de ${input.label} inválido.`);
    }
    const requested = [...new Set(input.requestedValue as string[])];
    const existing = new Set(
      Array.isArray(input.existingValue)
        ? input.existingValue.filter((id): id is string => typeof id === "string")
        : [],
    );
    const added = requested.filter((id) => !existing.has(id));
    if (added.length && (await input.count(added)) !== added.length) {
      throw new BadRequestException(
        input.label === "instâncias"
          ? "Instância inexistente para esta organização."
          : "Departamento inexistente para esta organização.",
      );
    }
    if (current.roleKey === "tenant_admin") return;
    const requestedSet = new Set(requested);
    const changed = [
      ...requested.filter((id) => !existing.has(id)),
      ...[...existing].filter((id) => !requestedSet.has(id)),
    ];
    const allowed = new Set(input.allowedIds ?? []);
    if (changed.some((id) => !allowed.has(id))) {
      throw new ForbiddenException(
        input.label === "instâncias"
          ? "Você não pode adicionar ou remover uma instância fora do seu escopo."
          : "Você não pode adicionar ou remover um departamento fora do seu escopo.",
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
      permissionIds: normalizePermissionIds(
        role.permissions.map((permission) => permission.permissionId),
      ),
    };
  }
}

const PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  "dashboard.read": ["dashboard.create", "dashboard.update", "dashboard.delete"],
  "users.read": ["users.create", "users.update", "users.delete"],
  "departments.read": ["departments.create", "departments.update", "departments.delete"],
  "roles.read": ["roles.create", "roles.update", "roles.delete"],
  "contacts.read": [
    "contacts.create",
    "contacts.update",
    "contacts.delete",
    "contacts.additional_fields.read",
  ],
  "conversations.read": [
    "conversations.assign",
    "messages.send",
    "chat.phone.read",
    "chat.tags.use",
    "chat.messages.delete",
    "chat.messages.edit",
    "chat.agent_name.show",
    "chat.conversations.view_all_active",
  ],
  "connections.read": ["connections.create", "connections.update", "connections.delete"],
  "groups.read": ["groups.create", "groups.update", "groups.leave"],
  "chat.tags.read": ["chat.tags.use", "chat.tags.create", "chat.tags.update", "chat.tags.delete"],
  "chat.quick_replies.read": [
    "chat.quick_replies.create",
    "chat.quick_replies.update",
    "chat.quick_replies.delete",
  ],
  "automations.read": ["automations.create", "automations.update", "automations.delete"],
  "tickets.read": ["tickets.create", "tickets.update", "tickets.delete"],
  "campaigns.read": ["campaigns.create", "campaigns.update", "campaigns.delete"],
  "schedules.read": ["schedules.create", "schedules.update", "schedules.delete"],
  "bot_flows.read": ["bot_flows.create", "bot_flows.update", "bot_flows.delete"],
  "ai_agents.read": ["ai_agents.create", "ai_agents.update", "ai_agents.delete"],
};

const LEGACY_PERMISSION_REPLACEMENTS: Record<string, readonly string[]> = {
  "chat.audio.send": ["messages.send"],
  "chat.contacts.create": ["contacts.read", "contacts.create"],
  "chat.contacts.edit": ["contacts.read", "contacts.update"],
  "chat.contacts.read": ["contacts.read"],
  "chat.contacts.block": ["conversations.read", "contacts.read", "contacts.update"],
  "chat.customer_link.edit": ["contacts.read", "contacts.update"],
  "chat.tickets.create": ["tickets.read", "tickets.create"],
  "conversations.manage": ["messages.send", "conversations.assign"],
};

function normalizePermissionIds(permissionIds: readonly string[]) {
  return [
    ...new Set(
      permissionIds.flatMap(
        (permissionId) => LEGACY_PERMISSION_REPLACEMENTS[permissionId] ?? [permissionId],
      ),
    ),
  ];
}

function normalizeRoleName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}
