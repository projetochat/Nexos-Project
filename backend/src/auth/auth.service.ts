import { moduleAwarePermissions } from "./effective-permissions";
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { type AuthenticatedUser, JwtPayload } from "./auth.types";
import { LoginDto } from "./dto/login.dto";

type LoginUserWithMemberships = Prisma.UserGetPayload<{
  include: {
    memberships: {
      include: {
        user: true;
        tenant: true;
        role: { include: { permissions: { select: { permissionId: true } } } };
      };
    };
  };
}>;

@Injectable()
export class AuthService {
  private static readonly MAX_TRACKED_LOGIN_IDENTITIES = 10_000;
  private readonly failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    return this.loginForSurface(dto, "legacy");
  }

  async loginPlatform(dto: LoginDto) {
    return this.loginForSurface(dto, "platform");
  }

  async loginTenant(dto: LoginDto) {
    return this.loginForSurface(dto, "tenant");
  }

  private async loginForSurface(dto: LoginDto, surface: "legacy" | "platform" | "tenant") {
    const email = dto.email.toLowerCase().trim();
    this.assertLoginRateLimit(email);
    if (Buffer.byteLength(dto.password, "utf8") > 72) throw this.invalidCredentials(email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            // The login response exposes the membership display name. Load the
            // membership user explicitly so the fallback to its immutable name
            // is available when no presentation name was configured.
            user: true,
            tenant: true,
            role: { include: { permissions: { select: { permissionId: true } } } },
          },
        },
      },
    });
    if (!user) throw this.invalidCredentials(email);
    if (user.status !== "ACTIVE") {
      throw new ForbiddenException({
        code: "USER_INACTIVE",
        message: "Usuário inativo.",
      });
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) throw this.invalidCredentials(email);
    this.failedLoginAttempts.delete(email);

    const requestedTenantSlug = dto.tenantSlug?.trim().toLowerCase();
    if (surface === "platform" && user.platformRole === "USER") {
      throw new ForbiddenException({
        code: "PLATFORM_ACCESS_DENIED",
        message: "Usuário sem papel ativo no plano de controle.",
      });
    }
    if (
      surface === "platform" ||
      (surface === "legacy" && !requestedTenantSlug && user.platformRole !== "USER")
    ) {
      const sid = await this.createSession({ userId: user.id });
      const basePayload = {
        sub: user.id,
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "platform_admin",
        platformRole: user.platformRole,
        iatMs: Date.now(),
        sid,
        surface: "platform" as const,
        aud: "trixus-platform" as const,
      };
      return {
        accessToken: await this.signToken({ ...basePayload, typ: "access" }, "JWT_SECRET", "15m"),
        refreshToken: await this.signToken(
          { ...basePayload, typ: "refresh" },
          "JWT_REFRESH_SECRET",
          "7d",
        ),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          keepSidebarCollapsed: user.keepSidebarCollapsed,
          roleId: "",
          roleKey: "platform_admin",
          platformRole: user.platformRole,
        },
        tenant: {
          id: "platform",
          slug: "platform",
          name: "Trixus Platform",
        },
        membership: {
          id: "",
          role: "platform_admin",
          roleId: "",
        },
        permissions: [],
      };
    }

    const activeMemberships = user.memberships.filter(
      (item) => item.status === "ACTIVE" && ["ACTIVE", "TRIAL"].includes(item.tenant.status),
    );
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: {
        email: user.email,
        status: "PENDING",
        tenantId: { in: activeMemberships.map((item) => item.tenantId) },
      },
      select: { tenantId: true, roleId: true },
    });
    if (pendingInitialPassword) {
      const pendingMembership = activeMemberships.find(
        (item) =>
          item.tenantId === pendingInitialPassword.tenantId &&
          item.roleId === pendingInitialPassword.roleId,
      );
      if (pendingMembership) return this.issueTenantLogin(user, pendingMembership);
    }
    if (activeMemberships.length > 1) {
      const selectionPayload = {
        sub: user.id,
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "tenant_selection",
        platformRole: user.platformRole,
        iatMs: Date.now(),
        typ: "tenant_selection" as const,
        surface: "tenant" as const,
        aud: "trixus-tenant" as const,
      };
      return {
        tenantSelectionRequired: true as const,
        tenantSelectionToken: await this.signToken(selectionPayload, "JWT_SECRET", "10m"),
        tenants: activeMemberships.map((item) => ({
          id: item.tenant.id,
          slug: item.tenant.slug,
          name: item.tenant.name,
        })),
      };
    }
    const membership = requestedTenantSlug
      ? activeMemberships.find((item) => item.tenant.slug === requestedTenantSlug)
      : activeMemberships.length === 1
        ? activeMemberships[0]
        : null;
    if (!membership) {
      throw new ForbiddenException({
        code: "USER_WITHOUT_ACTIVE_MEMBERSHIP",
        message: "Seu usuário não possui acesso a nenhuma organização ativa.",
      });
    }
    if (!["ACTIVE", "TRIAL"].includes(membership.tenant.status)) {
      throw new ForbiddenException({
        code: "TENANT_INACTIVE",
        message: "Organização suspensa ou encerrada.",
      });
    }
    return this.issueTenantLogin(user, membership);
  }

  async selectTenant(selectionToken: string, tenantId: string) {
    let payload: JwtPayload;
    try {
      payload = await this.verifyToken(selectionToken, "JWT_SECRET");
    } catch {
      throw new UnauthorizedException("Seleção de Tenant inválida ou expirada.");
    }
    if (payload.typ !== "tenant_selection") {
      throw new UnauthorizedException("Token de seleção de Tenant inválido.");
    }
    if (payload.surface !== "tenant" || payload.aud !== "trixus-tenant") {
      throw new UnauthorizedException("Token de seleção de Tenant inválido.");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          include: {
            user: true,
            tenant: true,
            role: { include: { permissions: { select: { permissionId: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("Usuário inativo.");
    const activeMemberships = user.memberships.filter(
      (item) => item.status === "ACTIVE" && ["ACTIVE", "TRIAL"].includes(item.tenant.status),
    );
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: {
        email: user.email,
        status: "PENDING",
        tenantId: { in: activeMemberships.map((item) => item.tenantId) },
      },
      select: { tenantId: true, roleId: true },
    });
    if (pendingInitialPassword) {
      const pendingMembership = activeMemberships.find(
        (item) =>
          item.tenantId === pendingInitialPassword.tenantId &&
          item.roleId === pendingInitialPassword.roleId,
      );
      if (pendingMembership) return this.issueTenantLogin(user, pendingMembership);
    }
    const membership = user.memberships.find(
      (item) =>
        item.tenantId === tenantId &&
        item.status === "ACTIVE" &&
        ["ACTIVE", "TRIAL"].includes(item.tenant.status),
    );
    if (!membership) {
      throw new ForbiddenException({
        code: "TENANT_ACCESS_DENIED",
        message: "Você não possui acesso ativo à Tenant selecionada.",
      });
    }
    return this.issueTenantLogin(user, membership);
  }

  private async issueTenantLogin(
    user: LoginUserWithMemberships,
    membership: LoginUserWithMemberships["memberships"][number],
  ) {
    const permissions = await moduleAwarePermissions(
      this.prisma,
      membership.tenantId,
      membership.tenant.featureOverrides,
      membership.role,
    );
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: {
        tenantId: membership.tenantId,
        email: user.email,
        roleId: membership.roleId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pendingInitialPassword) {
      const setupPayload = {
        sub: user.id,
        tenantId: membership.tenantId,
        membershipId: membership.id,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        platformRole: user.platformRole,
        iatMs: Date.now(),
        typ: "password_setup" as const,
        surface: "tenant" as const,
        aud: "trixus-tenant" as const,
      };
      return {
        passwordChangeRequired: true as const,
        passwordSetupToken: await this.signToken(setupPayload, "JWT_SECRET", "10m"),
        user: {
          id: user.id,
          email: user.email,
          name: membershipDisplayName(membership, user.name),
        },
        tenant: {
          id: membership.tenant.id,
          slug: membership.tenant.slug,
          name: membership.tenant.name,
        },
      };
    }

    const sid = await this.createSession({
      userId: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
    });
    const basePayload = {
      sub: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      platformRole: user.platformRole,
      iatMs: Date.now(),
      sid,
      surface: "tenant" as const,
      aud: "trixus-tenant" as const,
    };

    return {
      accessToken: await this.signToken({ ...basePayload, typ: "access" }, "JWT_SECRET", "15m"),
      refreshToken: await this.signToken(
        { ...basePayload, typ: "refresh" },
        "JWT_REFRESH_SECRET",
        "7d",
      ),
      user: {
        id: user.id,
        email: user.email,
        name: membershipDisplayName(membership, user.name),
        avatarUrl: user.avatarUrl,
        keepSidebarCollapsed: user.keepSidebarCollapsed,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        platformRole: user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: membership.role.key,
        roleId: membership.roleId,
      },
      permissions,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyToken(refreshToken, "JWT_REFRESH_SECRET");
    if (payload.typ !== "refresh") throw new UnauthorizedException("Refresh token inválido.");
    this.assertSurfaceClaims(payload);
    await this.assertRefreshSession(payload);

    if (!payload.membershipId && payload.platformRole !== "USER") {
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: "ACTIVE", platformRole: { not: "USER" } },
      });
      if (!user) throw new UnauthorizedException("Sessão expirada.");
      return {
        accessToken: await this.signToken(
          {
            sub: user.id,
            tenantId: "",
            membershipId: "",
            roleId: "",
            roleKey: "platform_admin",
            platformRole: user.platformRole,
            iatMs: Date.now(),
            sid: payload.sid,
            typ: "access",
            surface: "platform",
            aud: "trixus-platform",
          },
          "JWT_SECRET",
          "15m",
        ),
      };
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: payload.membershipId,
        tenantId: payload.tenantId,
        userId: payload.sub,
      },
      include: { user: true, tenant: true, role: true },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Sessão expirada.");
    }
    if (!["ACTIVE", "TRIAL"].includes(membership.tenant.status)) {
      throw new UnauthorizedException("Tenant inativo.");
    }
    if (
      membership.tenant.authRevokedAt &&
      payload.iatMs &&
      payload.iatMs < membership.tenant.authRevokedAt.getTime()
    ) {
      throw new UnauthorizedException("Sessão revogada.");
    }
    if (payload.impersonationSessionId) {
      const session = await this.prisma.impersonationSession.findFirst({
        where: {
          id: payload.impersonationSessionId,
          actorUserId: payload.actorPlatformUserId,
          tenantId: membership.tenantId,
          impersonatedMembershipId: membership.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new UnauthorizedException("Sessão de impersonação expirada.");
    }

    return {
      accessToken: await this.signToken(
        {
          sub: membership.userId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          roleId: membership.roleId,
          roleKey: membership.role.key,
          platformRole: membership.user.platformRole,
          iatMs: Date.now(),
          sid: payload.sid,
          typ: "access",
          impersonationSessionId: payload.impersonationSessionId,
          actorPlatformUserId: payload.actorPlatformUserId,
          surface: "tenant",
          aud: "trixus-tenant",
        },
        "JWT_SECRET",
        "15m",
      ),
    };
  }

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE") return { ok: true };
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: { email, status: "PENDING" },
      select: { id: true },
    });
    if (pendingInitialPassword) return { ok: true };

    const token = secureToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    return {
      ok: true,
      ...(this.exposeLocalTokens()
        ? { resetUrl: `${this.tenantAppUrl()}/login?reset=${token}` }
        : {}),
    };
  }

  async resetPassword(token: string, password: string) {
    this.assertPasswordLength(password);
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!record || record.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Token de redefinição inválido ou expirado.");
    }
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: { email: record.user.email, status: "PENDING" },
      select: { id: true },
    });
    if (pendingInitialPassword) {
      throw new ForbiddenException({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Conclua a troca obrigatória da senha temporária pelo primeiro acesso.",
      });
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hash(password, 12) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async acceptInvitation(dto: { token: string; password: string; name?: string }) {
    this.assertPasswordLength(dto.password);
    const tokenHash = hashToken(dto.token);
    const invitation = await this.prisma.userInvitation.findFirst({
      where: { tokenHash, status: "PENDING", expiresAt: { gt: new Date() } },
      include: { tenant: true, role: true },
    });
    if (!invitation) throw new UnauthorizedException("Convite inválido ou expirado.");
    const requestedName = dto.name?.trim();
    const tenantAdministratorName =
      invitation.role.key === "tenant_admin"
        ? invitation.tenant.responsibleName?.trim()
        : undefined;
    const invitationName = requestedName || tenantAdministratorName;

    await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: invitation.email } });
      if (user) {
        if (user.status !== "ACTIVE" || !(await compare(dto.password, user.passwordHash))) {
          throw new UnauthorizedException(
            "Este e-mail já possui uma conta. Informe a senha atual para aceitar o vínculo.",
          );
        }
      } else {
        user = await tx.user.create({
          data: {
            email: invitation.email,
            name: invitationName || invitation.email,
            passwordHash: await hash(dto.password, 12),
          },
        });
      }
      const membership = await tx.tenantMembership.upsert({
        where: {
          tenantId_userId: { tenantId: invitation.tenantId, userId: user.id },
        },
        update: { roleId: invitation.roleId, status: "ACTIVE" },
        create: {
          tenantId: invitation.tenantId,
          userId: user.id,
          roleId: invitation.roleId,
          presentationName: invitationName || null,
          status: "ACTIVE",
        },
      });
      if (invitation.departmentIds.length) {
        await tx.departmentMembership.deleteMany({
          where: { tenantId: invitation.tenantId, membershipId: membership.id },
        });
        await tx.departmentMembership.createMany({
          data: invitation.departmentIds.map((departmentId) => ({
            tenantId: invitation.tenantId,
            departmentId,
            membershipId: membership.id,
          })),
          skipDuplicates: true,
        });
      }
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
    });

    return this.loginTenant({
      email: invitation.email,
      password: dto.password,
      tenantSlug: invitation.tenant.slug,
    });
  }

  async completeRequiredPasswordChange(dto: {
    setupToken: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new ForbiddenException({
        code: "PASSWORD_CONFIRMATION_MISMATCH",
        message: "A confirmação da nova senha não confere.",
      });
    }
    if (Buffer.byteLength(dto.newPassword, "utf8") > 72) {
      throw new ForbiddenException({
        code: "PASSWORD_TOO_LONG",
        message: "A senha deve possuir no máximo 72 bytes.",
      });
    }
    if (dto.newPassword === "Trixus@2026") {
      throw new ForbiddenException({
        code: "TEMPORARY_PASSWORD_REUSE",
        message: "A nova senha deve ser diferente da senha temporária.",
      });
    }

    let payload: JwtPayload;
    try {
      payload = await this.verifyToken(dto.setupToken, "JWT_SECRET");
    } catch {
      throw new UnauthorizedException("Token de troca de senha inválido ou expirado.");
    }
    if (payload.typ !== "password_setup") {
      throw new UnauthorizedException("Token de troca de senha inválido.");
    }
    if (payload.surface !== "tenant" || payload.aud !== "trixus-tenant") {
      throw new UnauthorizedException("Token de troca de senha inválido.");
    }
    const changedAt = new Date();
    const loginIdentity = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.sub}))`;
      const membership = await tx.tenantMembership.findFirst({
        where: {
          id: payload.membershipId,
          tenantId: payload.tenantId,
          userId: payload.sub,
          status: "ACTIVE",
          tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
        },
        include: { user: true, tenant: true, role: true },
      });
      if (!membership || membership.user.status !== "ACTIVE") {
        throw new UnauthorizedException("Acesso temporário inválido ou expirado.");
      }
      const pending = await tx.userInvitation.findFirst({
        where: {
          tenantId: membership.tenantId,
          email: membership.user.email,
          roleId: membership.roleId,
          status: "PENDING",
        },
      });
      if (!pending) {
        throw new UnauthorizedException("A troca inicial de senha já foi concluída.");
      }
      if (await compare(dto.newPassword, membership.user.passwordHash)) {
        throw new ForbiddenException({
          code: "PASSWORD_REUSE",
          message: "A nova senha deve ser diferente da senha temporária.",
        });
      }

      await tx.user.update({
        where: { id: membership.userId },
        data: { passwordHash: await hash(dto.newPassword, 12) },
      });
      await tx.userInvitation.updateMany({
        where: {
          tenantId: membership.tenantId,
          email: membership.user.email,
          roleId: membership.roleId,
          status: "PENDING",
        },
        data: { status: "ACCEPTED", acceptedAt: changedAt },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: membership.userId, usedAt: null },
        data: { usedAt: changedAt },
      });
      await tx.authSession.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: changedAt },
      });
      await tx.tenant.update({
        where: { id: membership.tenantId },
        data: { authRevokedAt: changedAt },
      });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: membership.userId,
          actorPlatformRole: membership.user.platformRole,
          action: "tenant_administrator.initial_password_changed",
          targetType: "tenant_administrator",
          targetId: membership.userId,
          tenantId: membership.tenantId,
          metadataJson: { membershipId: membership.id },
        },
      });
      return {
        email: membership.user.email,
        tenantSlug: membership.tenant.slug,
      };
    });

    return this.loginTenant({
      email: loginIdentity.email,
      password: dto.newPassword,
      tenantSlug: loginIdentity.tenantSlug,
    });
  }

  async issueImpersonationTokens(input: {
    actorPlatformUserId: string;
    impersonationSessionId: string;
    membershipId: string;
  }) {
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: input.membershipId },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
      },
    });
    const permissions = await moduleAwarePermissions(
      this.prisma,
      membership.tenantId,
      membership.tenant.featureOverrides,
      membership.role,
    );
    const sid = await this.createSession({
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      impersonationSessionId: input.impersonationSessionId,
    });
    const basePayload = {
      sub: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      platformRole: membership.user.platformRole,
      iatMs: Date.now(),
      sid,
      impersonationSessionId: input.impersonationSessionId,
      actorPlatformUserId: input.actorPlatformUserId,
      surface: "tenant" as const,
      aud: "trixus-tenant" as const,
    };
    return {
      accessToken: await this.signToken({ ...basePayload, typ: "access" }, "JWT_SECRET", "15m"),
      refreshToken: await this.signToken(
        { ...basePayload, typ: "refresh" },
        "JWT_REFRESH_SECRET",
        "7d",
      ),
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membershipDisplayName(membership),
        avatarUrl: membership.user.avatarUrl,
        keepSidebarCollapsed: membership.user.keepSidebarCollapsed,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        platformRole: membership.user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: membership.role.key,
        roleId: membership.roleId,
      },
      permissions,
    };
  }

  async me(current: AuthenticatedUser) {
    if (!current.membershipId && current.platformRole !== "USER") {
      if (current.surface !== "platform") {
        throw new UnauthorizedException("Superfície de autenticação inválida.");
      }
      const user = await this.prisma.user.findFirst({
        where: { id: current.userId, status: "ACTIVE", platformRole: { not: "USER" } },
      });
      if (!user) throw new UnauthorizedException("Sessão expirada.");
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          keepSidebarCollapsed: user.keepSidebarCollapsed,
          roleId: "",
          roleKey: "platform_admin",
          roleName: "Dono",
          platformRole: user.platformRole,
        },
        tenant: { id: "platform", slug: "platform", name: "Trixus Platform" },
        membership: { id: "", role: "platform_admin", roleId: "" },
        departments: [],
        permissions: [],
        capabilities: { canManageTenant: false, canOperateInbox: false },
      };
    }
    if (current.surface !== "tenant") {
      throw new UnauthorizedException("Superfície de autenticação inválida.");
    }
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: current.membershipId,
        tenantId: current.tenantId,
        userId: current.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
      },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
        departments: { include: { department: true } },
      },
    });
    if (!membership) throw new UnauthorizedException("Membership inativa ou inválida.");
    if (
      membership.tenant.authRevokedAt &&
      current.iatMs &&
      current.iatMs < membership.tenant.authRevokedAt.getTime()
    ) {
      throw new UnauthorizedException("Sessão revogada.");
    }
    if (current.impersonationSessionId) {
      const session = await this.prisma.impersonationSession.findFirst({
        where: {
          id: current.impersonationSessionId,
          actorUserId: current.actorPlatformUserId,
          tenantId: current.tenantId,
          impersonatedMembershipId: current.membershipId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new UnauthorizedException("Sessão de impersonação expirada.");
    }
    const permissions = await moduleAwarePermissions(
      this.prisma,
      membership.tenantId,
      membership.tenant.featureOverrides,
      membership.role,
    );

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membershipDisplayName(membership),
        avatarUrl: membership.user.avatarUrl,
        keepSidebarCollapsed: membership.user.keepSidebarCollapsed,
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
      membership: {
        id: membership.id,
        role: membership.role.key,
        roleId: membership.roleId,
      },
      departments: membership.departments.map((item) => ({
        id: item.department.id,
        name: item.department.name,
        description: item.department.description,
        color: item.department.color,
        active: item.department.active,
      })),
      permissions,
      capabilities: {
        canManageTenant:
          permissions.includes("users.create") || permissions.includes("users.update"),
        canOperateInbox: permissions.some((permission) => permission.startsWith("chat.")),
      },
    };
  }

  async verifyToken(token: string, secretName: "JWT_SECRET" | "JWT_REFRESH_SECRET") {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.requiredSecret(secretName),
    });
  }

  async assertAccessSession(payload: JwtPayload) {
    this.assertSurfaceClaims(payload);
    // Tokens issued before this migration have no sid. They receive only the
    // remainder of their existing 15-minute access lifetime and cannot refresh.
    if (!payload.sid) return;
    await this.assertPersistedSession(payload);
  }

  async logout(authorization?: string) {
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Token ausente.");
    let payload: JwtPayload;
    try {
      payload = await this.verifyToken(token, "JWT_SECRET");
    } catch {
      throw new UnauthorizedException("Token inválido.");
    }
    if (payload.typ !== "access") throw new UnauthorizedException("Token inválido.");
    this.assertSurfaceClaims(payload);
    if (payload.sid) {
      await this.prisma.authSession.updateMany({
        where: {
          id: payload.sid,
          userId: payload.sub,
          tenantId: payload.tenantId || null,
          membershipId: payload.membershipId || null,
          impersonationSessionId: payload.impersonationSessionId ?? null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  private async assertRefreshSession(payload: JwtPayload) {
    if (!payload.sid) {
      throw new UnauthorizedException("Sessão legada expirada. Entre novamente.");
    }
    await this.assertPersistedSession(payload);
  }

  private assertSurfaceClaims(payload: JwtPayload) {
    const validPlatform =
      payload.surface === "platform" &&
      payload.aud === "trixus-platform" &&
      !payload.tenantId &&
      !payload.membershipId &&
      payload.platformRole !== "USER";
    const validTenant =
      payload.surface === "tenant" &&
      payload.aud === "trixus-tenant" &&
      Boolean(payload.tenantId) &&
      Boolean(payload.membershipId);
    if (!validPlatform && !validTenant) {
      throw new UnauthorizedException("Superfície de autenticação inválida.");
    }
  }

  private async assertPersistedSession(payload: JwtPayload) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        tenantId: payload.tenantId || null,
        membershipId: payload.membershipId || null,
        impersonationSessionId: payload.impersonationSessionId ?? null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException("Sessão expirada.");
  }

  private async createSession(input: {
    userId: string;
    tenantId?: string;
    membershipId?: string;
    impersonationSessionId?: string;
  }) {
    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        impersonationSessionId: input.impersonationSessionId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
      select: { id: true },
    });
    return session.id;
  }

  private signToken(
    payload: JwtPayload,
    secretName: "JWT_SECRET" | "JWT_REFRESH_SECRET",
    expiresIn: JwtSignOptions["expiresIn"],
  ) {
    return this.jwt.signAsync(payload, {
      secret: this.requiredSecret(secretName),
      expiresIn,
    });
  }

  private requiredSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET") {
    const value = this.config.get<string>(name);
    if (!value || value.startsWith("change-me")) {
      throw new Error(`${name} must be configured with a non-placeholder value.`);
    }
    return value;
  }

  private invalidCredentials(email: string) {
    this.recordFailedLogin(email);
    return new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "É-mail ou senha invalidos.",
    });
  }

  private assertLoginRateLimit(email: string) {
    const now = Date.now();
    this.pruneExpiredLoginAttempts(now);
    const entry = this.failedLoginAttempts.get(email);
    if (entry?.count && entry.count >= 5) throw this.loginRateLimitException();
    if (!entry && this.failedLoginAttempts.size >= AuthService.MAX_TRACKED_LOGIN_IDENTITIES) {
      throw this.loginRateLimitException();
    }
  }

  private recordFailedLogin(email: string) {
    const now = Date.now();
    const entry = this.failedLoginAttempts.get(email);
    if (!entry || entry.resetAt <= now) {
      this.pruneExpiredLoginAttempts(now);
      if (this.failedLoginAttempts.size >= AuthService.MAX_TRACKED_LOGIN_IDENTITIES) return;
      this.failedLoginAttempts.set(email, { count: 1, resetAt: now + 60_000 });
      return;
    }
    entry.count += 1;
  }

  private pruneExpiredLoginAttempts(now: number) {
    for (const [identity, attempt] of this.failedLoginAttempts) {
      if (attempt.resetAt <= now) this.failedLoginAttempts.delete(identity);
    }
  }

  private loginRateLimitException() {
    return new HttpException(
      {
        code: "TOO_MANY_LOGIN_ATTEMPTS",
        message: "Muitas tentativas de acesso. Aguarde é tente novamente.",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private assertPasswordLength(password: string) {
    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new ForbiddenException({
        code: "PASSWORD_TOO_LONG",
        message: "A senha deve possuir no máximo 72 bytes.",
      });
    }
  }

  private exposeLocalTokens() {
    return (
      process.env.NODE_ENV !== "production" ||
      this.config.get<string>("TRIXUS_EXPOSE_LOCAL_TOKENS") === "true"
    );
  }

  private tenantAppUrl() {
    return (
      this.config.get<string>("TRIXUS_TENANT_APP_URL") ??
      this.config.get<string>("TRIXUS_PUBLIC_APP_URL") ??
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }
}

function secureToken() {
  return randomBytes(32).toString("base64url");
}

function membershipDisplayName(
  membership: {
    presentationName?: string | null;
    user?: { name: string } | null;
  },
  fallbackName?: string,
) {
  return membership.presentationName?.trim() || membership.user?.name || fallbackName || "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
