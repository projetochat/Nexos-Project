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
  UseGuards,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { effectivePermissions } from "../auth/effective-permissions";
import { roleChatDepartmentIds, roleConnectionIds } from "../auth/connection-access";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsString()
  name?: string;
}

class UpdateMyProfileDto {
  @IsOptional()
  @IsBoolean()
  keepSidebarCollapsed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword?: string;
}

class UpdateAdministratorCredentialsDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword?: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  presentationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  avatarUrl?: string | null;
}

class UpdateCompanySettingsDto {
  @IsTimeZone()
  timezone!: string;
}

type MembershipWithRelations = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  presentationName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    avatarUrl?: string | null;
    keepSidebarCollapsed: boolean;
    status: string;
    platformRole: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
  };
  departments: Array<{
    department: {
      id: string;
      name: string;
      description: string | null;
      color: string;
      active: boolean;
    };
  }>;
};

@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  @Get("me")
  @UseGuards(PermissionsGuard)
  async me(@CurrentUser() current: AuthenticatedUser) {
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: current.membershipId },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
        departments: { include: { department: true } },
      },
    });
    const permissions = effectivePermissions(membership.role);

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.presentationName?.trim() || membership.user.name,
        avatarUrl: membership.user.avatarUrl,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        roleName: membership.role.name,
        platformRole: membership.user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      departments: membership.departments.map((item) => this.serializeDepartment(item.department)),
      permissions,
      capabilities: {
        canManageTenant:
          permissions.includes("users.create") || permissions.includes("users.update"),
        canOperateInbox: permissions.some((permission) => permission.startsWith("chat.")),
      },
    };
  }

  @Patch("me/profile")
  @UseGuards(PermissionsGuard)
  async updateMyProfile(
    @Body() dto: UpdateMyProfileDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const avatarUrl = normalizeAvatarUrl(dto.avatarUrl);
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: current.membershipId },
      include: {
        user: true,
        tenant: true,
        role: true,
        departments: { include: { department: true } },
      },
    });
    if (
      current.roleKey === "tenant_admin" &&
      dto.name !== undefined &&
      dto.name.trim() !== membership.user.name
    ) {
      throw new ForbiddenException("O nome do Administrador não pode ser alterado.");
    }
    if (dto.newPassword) {
      assertBcryptPasswordLength(dto.newPassword);
      if (!dto.currentPassword) throw new BadRequestException("Informe a senha atual.");
      assertBcryptPasswordLength(dto.currentPassword);
      const validPassword = await compare(dto.currentPassword, membership.user.passwordHash);
      if (!validPassword) throw new BadRequestException("Senha atual invalida.");
      if (dto.newPassword === dto.currentPassword) {
        throw new BadRequestException("A nova senha deve ser diferente da senha atual.");
      }
    }
    const passwordHash = dto.newPassword ? await hash(dto.newPassword, 12) : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.userId },
        data: {
          name: dto.name?.trim() || undefined,
          ...(dto.avatarUrl !== undefined ? { avatarUrl } : {}),
          ...(dto.keepSidebarCollapsed !== undefined
            ? { keepSidebarCollapsed: dto.keepSidebarCollapsed }
            : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      if (passwordHash) {
        await tx.authSession.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    const updated = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: current.membershipId },
      include: { user: true, role: true, departments: { include: { department: true } } },
    });
    return this.serializeMembership(updated);
  }

  @Patch("company/administrator-credentials")
  @UseGuards(PermissionsGuard)
  async updateAdministratorCredentials(
    @Body() dto: UpdateAdministratorCredentialsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    if (current.roleKey !== "tenant_admin" || current.impersonationSessionId) {
      throw new ForbiddenException("Somente o Administrador pode alterar estas credenciais.");
    }
    const isChangingPassword = dto.newPassword !== undefined || dto.confirmPassword !== undefined;
    const hasCredentialChange =
      isChangingPassword || dto.presentationName !== undefined || dto.avatarUrl !== undefined;
    const presentationName = dto.presentationName?.trim();
    if (!hasCredentialChange) {
      throw new BadRequestException("Nenhuma alteração foi informada.");
    }
    if (!dto.currentPassword) {
      throw new BadRequestException("Informe a senha atual.");
    }
    assertBcryptPasswordLength(dto.currentPassword);
    if (isChangingPassword && (!dto.currentPassword || !dto.newPassword || !dto.confirmPassword)) {
      throw new BadRequestException("Preencha todos os campos de senha.");
    }
    if (dto.newPassword) assertBcryptPasswordLength(dto.newPassword);
    if (isChangingPassword && dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException("A confirmação da nova senha não confere.");
    }
    if (dto.presentationName !== undefined && !presentationName) {
      throw new BadRequestException("Informe o nome de apresentação.");
    }
    const membership = await this.prisma.tenantMembership.findFirstOrThrow({
      where: {
        id: current.membershipId,
        tenantId: current.tenantId,
        userId: current.userId,
        status: "ACTIVE",
      },
      include: { user: true, role: true },
    });
    if (membership.role.key !== "tenant_admin") {
      throw new ForbiddenException("Somente o Administrador pode alterar estas credenciais.");
    }
    if (!(await compare(dto.currentPassword, membership.user.passwordHash))) {
      throw new BadRequestException("Senha atual inválida.");
    }
    if (isChangingPassword) {
      if (dto.newPassword === dto.currentPassword) {
        throw new BadRequestException("A nova senha deve ser diferente da senha atual.");
      }
    }
    const passwordHash = isChangingPassword ? await hash(dto.newPassword!, 12) : undefined;
    const avatarUrl = dto.avatarUrl === undefined ? undefined : normalizeAvatarUrl(dto.avatarUrl);
    await this.prisma.$transaction(async (tx) => {
      if (isChangingPassword) {
        await tx.user.update({
          where: { id: membership.userId },
          data: { passwordHash },
        });
        await tx.authSession.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      if (dto.presentationName !== undefined) {
        await tx.tenantMembership.update({
          where: { id: membership.id },
          data: { presentationName },
        });
      }
      if (dto.avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: membership.userId },
          data: { avatarUrl },
        });
      }
    });
    return {
      ok: true,
      presentationName: presentationName ?? membership.presentationName,
      avatarUrl: dto.avatarUrl === undefined ? (membership.user.avatarUrl ?? null) : avatarUrl,
    };
  }

  @Get("company")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("settings.manage")
  async company(@CurrentUser() current: AuthenticatedUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: current.tenantId },
      include: {
        users: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: { user: true, role: true },
        },
      },
    });
    const administrator =
      tenant.users.find((membership) => membership.role.key === "tenant_admin") ?? tenant.users[0];
    const administratorEmail = tenant.technicalEmail ?? administrator?.user.email ?? null;

    // Consolida cadastros legados: após a primeira leitura, o e-mail deixa de depender da sessão.
    if (!tenant.technicalEmail && administratorEmail) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { technicalEmail: administratorEmail },
      });
    }

    return {
      name: tenant.name,
      legalName: tenant.legalName,
      document: tenant.document,
      timezone: tenant.timezone,
      locale: tenant.locale,
      accessEmail: current.roleKey === "tenant_admin" ? administratorEmail : null,
      responsibleName: administrator?.user.name ?? null,
      presentationName:
        current.roleKey === "tenant_admin"
          ? (administrator?.presentationName ?? administrator?.user.name ?? null)
          : null,
      administratorAvatarUrl:
        current.roleKey === "tenant_admin" ? (administrator?.user.avatarUrl ?? null) : null,
      canManageAdministratorCredentials: current.roleKey === "tenant_admin",
    };
  }

  @Patch("company")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("settings.manage")
  async updateCompany(
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    if (current.impersonationSessionId) {
      throw new ForbiddenException("A empresa não pode ser alterada durante uma impersonação.");
    }
    return this.prisma.tenant.update({
      where: { id: current.tenantId },
      data: { timezone: dto.timezone },
      select: { timezone: true },
    });
  }

  @Get("company/financial")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("settings.manage")
  async financial(@CurrentUser() current: AuthenticatedUser) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: current.tenantId },
      orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
      include: { subscription: { include: { plan: true } } },
    });

    return invoices.map((invoice) => ({
      paymentId: invoice.number,
      subscriptionId: invoice.subscriptionId,
      service: invoice.subscription.plan.name,
      referenceAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      amountCents: invoice.totalCents,
      currency: invoice.currency,
      status: invoice.status,
    }));
  }

  @Get("users")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId: current.tenantId },
      orderBy: { user: { name: "asc" } },
      include: {
        user: true,
        role: true,
        departments: { include: { department: true } },
      },
    });

    return memberships
      .sort((left, right) => {
        if (left.role.key === "tenant_admin") return -1;
        if (right.role.key === "tenant_admin") return 1;
        return left.user.name.localeCompare(right.user.name, "pt-BR", { sensitivity: "base" });
      })
      .map((membership) => this.serializeMembership(membership));
  }

  @Get("users/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const membership = await this.findMembershipOrThrow(id, current.tenantId);
    return this.serializeMembership(membership);
  }

  @Post("users")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.create")
  async create(@Body() dto: CreateUserDto, @CurrentUser() current: AuthenticatedUser) {
    assertBcryptPasswordLength(dto.password);
    const roleId = dto.roleId ?? (await this.defaultRoleId(current.tenantId));
    await this.assertAssignableRole(roleId, current);
    await this.assertDepartmentsInTenant(dto.departmentIds ?? [], current.tenantId);

    const passwordHash = await hash(dto.password, 12);
    const email = dto.email.toLowerCase().trim();
    const avatarUrl = normalizeAvatarUrl(dto.avatarUrl);

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenants" WHERE id = ${current.tenantId} FOR UPDATE`,
      );
      await this.assertNameAvailable(tx, current.tenantId, dto.name);
      await this.entitlements.assertTenantOperational(current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxUsers",
        await tx.tenantMembership.count({
          where: { tenantId: current.tenantId, status: "ACTIVE", user: { status: "ACTIVE" } },
        }),
      );
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        const existing = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: current.tenantId, userId: user.id } },
        });
        if (existing) throw new BadRequestException("Usuário já pertence a este tenant.");
        throw new BadRequestException(
          "E-mail já vinculado a uma conta existente. Utilize o fluxo de convite ou vínculo.",
        );
      } else {
        user = await tx.user.create({
          data: {
            email,
            name: dto.name.trim(),
            passwordHash,
            ...(dto.avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        });
      }

      const created = await tx.tenantMembership.create({
        data: { tenantId: current.tenantId, userId: user.id, roleId, status: "ACTIVE" },
      });
      await this.replaceDepartments(tx, current.tenantId, created.id, dto.departmentIds ?? []);
      return tx.tenantMembership.findUniqueOrThrow({
        where: { id: created.id },
        include: { user: true, role: true, departments: { include: { department: true } } },
      });
    });

    return this.serializeMembership(membership);
  }

  @Patch("users/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.updateMembership(id, dto, current);
  }

  private async updateMembership(
    id: string,
    dto: UpdateUserDto,
    current: AuthenticatedUser,
    reactivationOnly = false,
  ) {
    if (dto.password) assertBcryptPasswordLength(dto.password);
    const existing = await this.findMembershipOrThrow(id, current.tenantId);
    this.assertMasterMembershipProtected(existing);
    this.assertSelfAccessPreserved(existing, dto, current);
    if (dto.roleId) await this.assertAssignableRole(dto.roleId, current);
    if (dto.departmentIds)
      await this.assertDepartmentsInTenant(dto.departmentIds, current.tenantId);
    const avatarUrl = normalizeAvatarUrl(dto.avatarUrl);

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenants" WHERE id = ${current.tenantId} FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "users" WHERE id = ${existing.userId} FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenant_memberships" WHERE id = ${existing.id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      const latest = await this.findMembershipOrThrow(id, current.tenantId, tx);
      this.assertMasterMembershipProtected(latest);
      this.assertSelfAccessPreserved(latest, dto, current);
      const reactivating =
        (latest.status !== "ACTIVE" && dto.membershipStatus === "ACTIVE") ||
        (latest.user.status === "DISABLED" && dto.status === "ACTIVE");
      if (reactivationOnly && !reactivating) return latest;
      if (dto.name !== undefined) {
        await this.assertNameAvailable(tx, current.tenantId, dto.name, existing.id);
      }
      const otherMembership = await tx.tenantMembership.findFirst({
        where: { userId: latest.userId, tenantId: { not: current.tenantId } },
        select: { id: true },
      });
      const changesSharedGlobalIdentity =
        Boolean(otherMembership) &&
        (dto.password !== undefined ||
          (dto.email !== undefined && dto.email.toLowerCase().trim() !== latest.user.email) ||
          (dto.status !== undefined && dto.status !== latest.user.status) ||
          (dto.avatarUrl !== undefined && avatarUrl !== (latest.user.avatarUrl ?? null)));
      if (changesSharedGlobalIdentity) {
        throw new BadRequestException(
          "Esta conta pertence a mais de uma empresa. Credenciais e dados globais só podem ser alterados pelo próprio usuário.",
        );
      }
      const userData = {
        email: dto.email?.toLowerCase().trim(),
        passwordHash: dto.password ? await hash(dto.password, 12) : undefined,
        status: dto.status,
        ...(dto.avatarUrl !== undefined ? { avatarUrl } : {}),
      };
      if (Object.values(userData).some((value) => value !== undefined)) {
        await tx.user.update({
          where: { id: existing.userId },
          data: userData,
        });
      }
      await tx.tenantMembership.update({
        where: { id: existing.id },
        data: {
          roleId: dto.roleId,
          status: dto.membershipStatus,
          ...(dto.name !== undefined ? { presentationName: dto.name.trim() } : {}),
        },
      });
      if (dto.departmentIds) {
        await this.replaceDepartments(tx, current.tenantId, existing.id, dto.departmentIds);
      }
      return tx.tenantMembership.findUniqueOrThrow({
        where: { id: existing.id },
        include: { user: true, role: true, departments: { include: { department: true } } },
      });
    });

    return this.serializeMembership(membership);
  }

  @Patch("users/:id/activate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.update")
  activate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.updateMembership(
      id,
      { membershipStatus: "ACTIVE", status: "ACTIVE" },
      current,
      true,
    );
  }

  @Patch("users/:id/deactivate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.delete")
  deactivate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.setMembershipStatus(id, current, "DISABLED");
  }

  @Get("user-invitations")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.read")
  async listInvitations(@CurrentUser() current: AuthenticatedUser) {
    const invitations = await this.prisma.userInvitation.findMany({
      where: { tenantId: current.tenantId },
      include: { role: true },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: { id: invitation.role.id, key: invitation.role.key, name: invitation.role.name },
      departmentIds: invitation.departmentIds,
      status: invitation.status.toLowerCase(),
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    }));
  }

  @Post("user-invitations")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.create")
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertAssignableRole(dto.roleId, current);
    await this.assertDepartmentsInTenant(dto.departmentIds ?? [], current.tenantId);
    const token = randomBytes(32).toString("base64url");
    const email = dto.email.toLowerCase().trim();
    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.userInvitation.updateMany({
        where: { tenantId: current.tenantId, email, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      return tx.userInvitation.create({
        data: {
          tenantId: current.tenantId,
          email,
          roleId: dto.roleId,
          departmentIds: dto.departmentIds ?? [],
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          invitedByMembershipId: current.membershipId,
        },
      });
    });
    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status.toLowerCase(),
      expiresAt: invitation.expiresAt,
      ...(exposeLocalTokens()
        ? { acceptUrl: `${tenantAppUrl()}/login?invite=${token}` }
        : { delivery: "provider_required" }),
    };
  }

  @Patch("user-invitations/:id/revoke")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.update")
  async revokeInvitation(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.prisma.userInvitation.updateMany({
      where: { id, tenantId: current.tenantId, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async setMembershipStatus(
    id: string,
    current: AuthenticatedUser,
    status: "ACTIVE" | "DISABLED",
  ) {
    const membership = await this.findMembershipOrThrow(id, current.tenantId);
    this.assertMasterMembershipProtected(membership);
    if (status !== "ACTIVE") {
      this.assertSelfAccessPreserved(membership, { membershipStatus: status }, current);
    }
    const updated = await this.prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { status },
      include: { user: true, role: true, departments: { include: { department: true } } },
    });
    return this.serializeMembership(updated);
  }

  private assertMasterMembershipProtected(membership: { role: { key: string } }) {
    if (membership.role.key === "tenant_admin") {
      throw new BadRequestException("O usuário master não pode ser alterado por esta tela.");
    }
  }

  private assertSelfAccessPreserved(
    membership: { id: string; userId: string; role: { id: string } },
    dto: Pick<UpdateUserDto, "status" | "membershipStatus" | "roleId">,
    current: AuthenticatedUser,
  ) {
    if (membership.id !== current.membershipId && membership.userId !== current.userId) return;
    const disablesUser = dto.status !== undefined && dto.status !== "ACTIVE";
    const disablesMembership =
      dto.membershipStatus !== undefined && dto.membershipStatus !== "ACTIVE";
    const changesRole = dto.roleId !== undefined && dto.roleId !== membership.role.id;
    if (disablesUser || disablesMembership || changesRole) {
      throw new ForbiddenException(
        "Você não pode bloquear seu próprio usuário nem alterar o próprio perfil de acesso.",
      );
    }
  }

  private async defaultRoleId(tenantId: string) {
    const role = await this.prisma.role.findUnique({
      where: { tenantId_key: { tenantId, key: "agent" } },
    });
    if (!role) throw new BadRequestException("Role padrão não encontrada.");
    return role.id;
  }

  private async assertRoleInTenant(roleId: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
      include: { permissions: { select: { permissionId: true } } },
    });
    if (!role) throw new BadRequestException("Role inexistente para este tenant.");
    return role;
  }

  private async assertAssignableRole(roleId: string, current: AuthenticatedUser) {
    const role = await this.assertRoleInTenant(roleId, current.tenantId);
    if (role.key === "tenant_admin") {
      throw new BadRequestException("O perfil Administrador é reservado ao usuário administrador.");
    }
    if (current.roleKey === "tenant_admin") return;
    const granted = new Set<string>(current.permissions ?? []);
    const forbiddenPermission = effectivePermissions(role).find(
      (permission) => !granted.has(permission),
    );
    if (forbiddenPermission) {
      throw new ForbiddenException("Você não pode atribuir um perfil com permissões superiores.");
    }
    const assignedConnectionIds = roleConnectionIds(role) ?? [];
    const allowedConnectionIds = new Set(current.connectionIds ?? []);
    if (assignedConnectionIds.some((id) => !allowedConnectionIds.has(id))) {
      throw new ForbiddenException("Você não pode atribuir um perfil com instâncias superiores.");
    }
    const assignedDepartmentIds = roleChatDepartmentIds(role) ?? [];
    const allowedDepartmentIds = new Set(current.chatDepartmentIds ?? []);
    if (assignedDepartmentIds.some((id) => !allowedDepartmentIds.has(id))) {
      throw new ForbiddenException(
        "Você não pode atribuir um perfil com departamentos superiores.",
      );
    }
  }

  private async assertDepartmentsInTenant(departmentIds: string[], tenantId: string) {
    if (!departmentIds.length) return;
    const count = await this.prisma.department.count({
      where: { tenantId, id: { in: departmentIds }, active: true },
    });
    if (count !== new Set(departmentIds).size) {
      throw new BadRequestException("Departamento inexistente para este tenant.");
    }
  }

  private async assertNameAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    name: string,
    excludeMembershipId?: string,
  ) {
    const normalizedName = normalizeUserName(name);
    const memberships = await tx.tenantMembership.findMany({
      where: { tenantId, ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}) },
      select: { presentationName: true, user: { select: { name: true } } },
    });
    if (
      memberships.some(
        (membership) =>
          normalizeUserName(membership.presentationName?.trim() || membership.user.name) ===
          normalizedName,
      )
    ) {
      throw new BadRequestException("Já existe um atendente com este nome.");
    }
  }

  private async findMembershipOrThrow(
    id: string,
    tenantId: string,
    db: Pick<PrismaService, "tenantMembership"> = this.prisma,
  ) {
    const membership = await db.tenantMembership.findFirst({
      where: { id, tenantId },
      include: { user: true, role: true, departments: { include: { department: true } } },
    });
    if (!membership) throw new NotFoundException("Usuário não encontrado.");
    return membership;
  }

  private async replaceDepartments(
    tx: Pick<PrismaService, "departmentMembership">,
    tenantId: string,
    membershipId: string,
    departmentIds: string[],
  ) {
    await tx.departmentMembership.deleteMany({ where: { tenantId, membershipId } });
    if (!departmentIds.length) return;
    await tx.departmentMembership.createMany({
      data: [...new Set(departmentIds)].map((departmentId) => ({
        tenantId,
        membershipId,
        departmentId,
      })),
      skipDuplicates: true,
    });
  }

  private serializeMembership(membership: MembershipWithRelations) {
    return {
      id: membership.id,
      status: membership.status,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      presentationName: membership.presentationName,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        // A listagem de atendentes deve sempre exibir o nome configurado para o administrador.
        // O nome persistido no usuário continua intacto e é usado apenas para regras internas.
        name: membership.presentationName?.trim() || membership.user.name,
        presentationName: membership.presentationName,
        avatarUrl: membership.user.avatarUrl,
        keepSidebarCollapsed: membership.user.keepSidebarCollapsed,
        status: membership.user.status,
        platformRole: membership.user.platformRole,
      },
      role: {
        id: membership.role.id,
        key: membership.role.key,
        name: membership.role.name,
      },
      departments: membership.departments.map((item) => this.serializeDepartment(item.department)),
    };
  }

  private serializeDepartment(department: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    active: boolean;
  }) {
    return {
      id: department.id,
      name: department.name,
      description: department.description,
      color: department.color,
      active: department.active,
    };
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

function exposeLocalTokens() {
  return process.env.NODE_ENV !== "production" || process.env.TRIXUS_EXPOSE_LOCAL_TOKENS === "true";
}

function tenantAppUrl() {
  return (
    process.env.TRIXUS_TENANT_APP_URL ??
    process.env.TRIXUS_PUBLIC_APP_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

function normalizeAvatarUrl(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed)) {
    throw new BadRequestException("Imagem de perfil invalida.");
  }
  return trimmed;
}

function normalizeUserName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function assertBcryptPasswordLength(value: string) {
  if (Buffer.byteLength(value, "utf8") > 72) {
    throw new BadRequestException("A senha deve possuir no máximo 72 bytes.");
  }
}
