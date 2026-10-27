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
import { LoginDto, PortalLoginDto } from "./dto/login.dto";

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

type PortalLoginAccess = Prisma.CustomerPortalAccessGetPayload<{
  include: {
    tenant: true;
    customer: true;
    contact: true;
    branch: true;
    department: true;
    user: true;
    membership: {
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

  async loginPortal(dto: PortalLoginDto) {
    return this.loginForSurface(
      { email: dto.login, password: dto.password, tenantSlug: dto.tenantSlug },
      "portal",
    );
  }

  private async loginForSurface(
    dto: { email: string; password: string; tenantSlug?: string },
    surface: "legacy" | "platform" | "tenant" | "portal",
  ) {
    const identity = dto.email.toLowerCase().trim();
    this.assertLoginRateLimit(identity);
    if (Buffer.byteLength(dto.password, "utf8") > 72) throw this.invalidCredentials(identity);
    if (surface !== "portal" && !identity.includes("@")) {
      throw this.invalidCredentials(identity);
    }

    let userId: string | undefined;
    if (surface === "portal") {
      const candidates = await this.prisma.customerPortalAccess.findMany({
        where: {
          login: identity,
          active: true,
          contact: { active: true, archivedAt: null },
          customer: { status: "ACTIVE", archivedAt: null },
          membership: {
            status: "ACTIVE",
            user: { status: "ACTIVE" },
            tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
          },
        },
        select: {
          user: { select: { id: true, passwordHash: true } },
          membership: { select: { user: { select: { id: true, passwordHash: true } } } },
        },
      });
      const uniqueCandidates = new Map(
        candidates
          .filter(
            (candidate) =>
              !candidate.user ||
              !candidate.membership ||
              candidate.user.id === candidate.membership.user.id,
          )
          .map((candidate) => candidate.user ?? candidate.membership?.user)
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
          .map((candidate) => [candidate.id, candidate]),
      );
      for (const candidate of uniqueCandidates.values()) {
        if (await compare(dto.password, candidate.passwordHash)) {
          userId = candidate.id;
          break;
        }
      }
      if (!userId) throw this.invalidCredentials(identity);
    }

    const user = await this.prisma.user.findUnique({
      where: userId ? { id: userId } : { email: identity },
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
    if (!user) throw this.invalidCredentials(identity);
    if (user.status !== "ACTIVE") {
      throw new ForbiddenException({
        code: "USER_INACTIVE",
        message: "Usuário inativo.",
      });
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) throw this.invalidCredentials(identity);
    this.failedLoginAttempts.delete(identity);

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
          chatBubbleColor: user.chatBubbleColor,
          chatBubbleTextColor: user.chatBubbleTextColor,
          customerBubbleColor: user.customerBubbleColor,
          customerBubbleTextColor: user.customerBubbleTextColor,
          chatBackgroundColor: user.chatBackgroundColor,
          chatBackgroundMode: user.chatBackgroundMode,
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
    const portalAccesses =
      surface === "portal" ? await this.activePortalAccesses(user.id, identity) : [];
    const internalMemberships = activeMemberships.filter(
      (item) => item.role.key !== "customer_portal",
    );
    if (surface !== "portal") {
      const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
        where: {
          email: user.email,
          status: "PENDING",
          portalAccessId: null,
          tenantId: { in: internalMemberships.map((item) => item.tenantId) },
        },
        select: { tenantId: true, roleId: true },
      });
      if (pendingInitialPassword) {
        const pendingMembership = internalMemberships.find(
          (item) =>
            item.tenantId === pendingInitialPassword.tenantId &&
            item.roleId === pendingInitialPassword.roleId,
        );
        if (pendingMembership) return this.issueTenantLogin(user, pendingMembership);
      }
    }
    const requestedInternalMemberships = requestedTenantSlug
      ? internalMemberships.filter((item) => item.tenant.slug === requestedTenantSlug)
      : internalMemberships;
    const requestedPortalAccesses = requestedTenantSlug
      ? portalAccesses.filter((item) => item.tenant.slug === requestedTenantSlug)
      : portalAccesses;
    const destinations =
      surface === "portal"
        ? requestedPortalAccesses.map((item) => ({
            selectionId: `portal:${item.id}`,
            kind: "CUSTOMER_PORTAL" as const,
            tenant: item.tenant,
            customer: item.customer,
            portalAccess: item,
          }))
        : requestedInternalMemberships.map((item) => ({
            selectionId: `membership:${item.id}`,
            kind: "TENANT" as const,
            tenant: item.tenant,
            membership: item,
          }));
    if (destinations.length > 1) {
      const selectionPayload = {
        sub: user.id,
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: surface === "portal" ? "portal_selection" : "tenant_selection",
        platformRole: user.platformRole,
        iatMs: Date.now(),
        typ: "tenant_selection" as const,
        surface: "tenant" as const,
        aud: "trixus-tenant" as const,
      };
      return {
        tenantSelectionRequired: true as const,
        tenantSelectionToken: await this.signToken(selectionPayload, "JWT_SECRET", "10m"),
        tenants: destinations.map((item) => ({
          id: item.tenant.id,
          slug: item.tenant.slug,
          name: item.tenant.name,
          selectionId: item.selectionId,
          kind: item.kind,
          customer:
            item.kind === "CUSTOMER_PORTAL"
              ? { id: item.customer.id, name: item.customer.name }
              : undefined,
        })),
        destinations: destinations.map((item) => ({
          selectionId: item.selectionId,
          type: item.kind === "CUSTOMER_PORTAL" ? "customer_portal" : "tenant",
          tenant: { id: item.tenant.id, slug: item.tenant.slug, name: item.tenant.name },
          customer:
            item.kind === "CUSTOMER_PORTAL"
              ? { id: item.customer.id, name: item.customer.name }
              : undefined,
        })),
      };
    }
    const destination = destinations[0];
    if (!destination) {
      throw new ForbiddenException({
        code: surface === "portal" ? "PORTAL_ACCESS_DENIED" : "INTERNAL_ACCESS_DENIED",
        message:
          surface === "portal"
            ? "Seu usuário não possui acesso ao Portal do Cliente."
            : "Seu usuário não possui acesso ao Trixus.",
      });
    }
    return destination.kind === "CUSTOMER_PORTAL"
      ? this.issuePortalLogin(user, destination.portalAccess)
      : this.issueTenantLogin(user, destination.membership);
  }

  async selectTenant(selectionToken: string, tenantId?: string, selectionId?: string) {
    return this.selectDestination(selectionToken, tenantId, selectionId, "internal");
  }

  async selectPortal(selectionToken: string, tenantId?: string, selectionId?: string) {
    return this.selectDestination(selectionToken, tenantId, selectionId, "portal");
  }

  private async selectDestination(
    selectionToken: string,
    tenantId: string | undefined,
    selectionId: string | undefined,
    expectedAudience: "internal" | "portal",
  ) {
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
    const selectionAudience =
      payload.roleKey === "portal_selection"
        ? "portal"
        : payload.roleKey === "tenant_selection"
          ? "internal"
          : null;
    if (!selectionAudience) {
      throw new UnauthorizedException("Token de seleção de Tenant inválido.");
    }
    if (selectionAudience !== expectedAudience) {
      throw new ForbiddenException({
        code: "AUTH_CHANNEL_MISMATCH",
        message:
          expectedAudience === "portal"
            ? "Este usuário não possui acesso pelo Portal do Cliente."
            : "Este usuário não possui acesso pelo login do Trixus.",
      });
    }
    if (!tenantId && !selectionId) {
      throw new ForbiddenException({
        code: "DESTINATION_SELECTION_REQUIRED",
        message: "Selecione a organização ou o cliente que deseja acessar.",
      });
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
    const internalMemberships = activeMemberships.filter(
      (item) => item.role.key !== "customer_portal",
    );
    if (selectionId?.startsWith("portal:")) {
      if (selectionAudience !== "portal") {
        throw new ForbiddenException({
          code: "PORTAL_ACCESS_DENIED",
          message: "Este acesso deve ser realizado pelo Portal do Cliente.",
        });
      }
      const portalAccessId = selectionId.slice("portal:".length);
      const portalAccess = (await this.activePortalAccesses(user.id)).find(
        (item) => item.id === portalAccessId && (!tenantId || item.tenantId === tenantId),
      );
      if (!portalAccess) {
        throw new ForbiddenException({
          code: "PORTAL_ACCESS_DENIED",
          message: "Você não possui acesso ativo ao cliente selecionado.",
        });
      }
      return this.issuePortalLogin(user, portalAccess);
    }
    if (selectionAudience === "portal") {
      throw new ForbiddenException({
        code: "PORTAL_ACCESS_DENIED",
        message: "Selecione um acesso válido do Portal do Cliente.",
      });
    }
    const pendingInitialPassword = await this.prisma.userInvitation.findFirst({
      where: {
        email: user.email,
        status: "PENDING",
        portalAccessId: null,
        tenantId: { in: internalMemberships.map((item) => item.tenantId) },
      },
      select: { tenantId: true, roleId: true },
    });
    if (pendingInitialPassword) {
      const pendingMembership = internalMemberships.find(
        (item) =>
          item.tenantId === pendingInitialPassword.tenantId &&
          item.roleId === pendingInitialPassword.roleId,
      );
      if (pendingMembership) return this.issueTenantLogin(user, pendingMembership);
    }
    const selectedMembershipId = selectionId?.startsWith("membership:")
      ? selectionId.slice("membership:".length)
      : undefined;
    const membership = user.memberships.find(
      (item) =>
        (!tenantId || item.tenantId === tenantId) &&
        (!selectedMembershipId || item.id === selectedMembershipId) &&
        item.role.key !== "customer_portal" &&
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
        portalAccessId: null,
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
        chatBubbleColor: user.chatBubbleColor,
        chatBubbleTextColor: user.chatBubbleTextColor,
        customerBubbleColor: user.customerBubbleColor,
        customerBubbleTextColor: user.customerBubbleTextColor,
        chatBackgroundColor: user.chatBackgroundColor,
        chatBackgroundMode: user.chatBackgroundMode,
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

  private activePortalAccesses(userId: string, login?: string) {
    return this.prisma.customerPortalAccess.findMany({
      where: {
        ...(login ? { login } : {}),
        active: true,
        revokedAt: null,
        contact: { active: true, archivedAt: null },
        customer: { status: "ACTIVE", archivedAt: null },
        branch: { status: "ACTIVE", archivedAt: null },
        membership: {
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
        },
        AND: [
          { OR: [{ userId }, { userId: null, membership: { userId } }] },
          {
            OR: [
              { accessProfile: "FULL_ACCESS" },
              { department: { active: true, archivedAt: null } },
            ],
          },
        ],
      },
      include: {
        tenant: true,
        customer: true,
        contact: true,
        branch: true,
        department: true,
        user: true,
        membership: {
          include: {
            user: true,
            tenant: true,
            role: { include: { permissions: { select: { permissionId: true } } } },
          },
        },
      },
      orderBy: [{ tenant: { name: "asc" } }, { customer: { name: "asc" } }],
    });
  }

  private async issuePortalLogin(user: LoginUserWithMemberships, access: PortalLoginAccess) {
    const membership = access.membership;
    if (
      !membership ||
      membership.userId !== user.id ||
      (access.userId && access.userId !== user.id)
    ) {
      throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
    }
    const portalRole = await this.prisma.role.findUnique({
      where: { tenantId_key: { tenantId: access.tenantId, key: "customer_portal" } },
      include: { permissions: { select: { permissionId: true } } },
    });
    if (!portalRole?.active) {
      throw new ForbiddenException({
        code: "PORTAL_ROLE_INACTIVE",
        message: "O Portal do Cliente não está disponível nesta organização.",
      });
    }
    const permissions = await moduleAwarePermissions(
      this.prisma,
      access.tenantId,
      access.tenant.featureOverrides,
      portalRole,
    );
    const sid = await this.createSession({
      userId: user.id,
      tenantId: access.tenantId,
      membershipId: membership.id,
      portalAccessId: access.id,
    });
    const basePayload = {
      sub: user.id,
      tenantId: access.tenantId,
      membershipId: membership.id,
      roleId: portalRole.id,
      roleKey: portalRole.key,
      platformRole: user.platformRole,
      portalAccessId: access.id,
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
        name: access.contact.name,
        avatarUrl: user.avatarUrl,
        keepSidebarCollapsed: user.keepSidebarCollapsed,
        chatBubbleColor: user.chatBubbleColor,
        chatBubbleTextColor: user.chatBubbleTextColor,
        customerBubbleColor: user.customerBubbleColor,
        customerBubbleTextColor: user.customerBubbleTextColor,
        chatBackgroundColor: user.chatBackgroundColor,
        chatBackgroundMode: user.chatBackgroundMode,
        roleId: portalRole.id,
        roleKey: portalRole.key,
        platformRole: user.platformRole,
      },
      tenant: { id: access.tenant.id, slug: access.tenant.slug, name: access.tenant.name },
      membership: { id: membership.id, role: portalRole.key, roleId: portalRole.id },
      portalAccess: {
        id: access.id,
        customer: { id: access.customer.id, name: access.customer.name },
        contactId: access.contactId,
        branchId: access.branchId,
        departmentId: access.departmentId,
        accessProfile: access.accessProfile,
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

    let effectiveRole = membership.role;
    if (payload.portalAccessId) {
      const portalAccess = await this.prisma.customerPortalAccess.findFirst({
        where: {
          id: payload.portalAccessId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          active: true,
          contact: { active: true, archivedAt: null },
          customer: { status: "ACTIVE", archivedAt: null },
          branch: { status: "ACTIVE", archivedAt: null },
          OR: [
            { accessProfile: "FULL_ACCESS" },
            { department: { active: true, archivedAt: null } },
          ],
        },
        select: { id: true },
      });
      if (!portalAccess) throw new UnauthorizedException("Acesso ao Portal do Cliente expirado.");
      const portalRole = await this.prisma.role.findUnique({
        where: { tenantId_key: { tenantId: membership.tenantId, key: "customer_portal" } },
      });
      if (!portalRole?.active) {
        throw new UnauthorizedException("Acesso ao Portal do Cliente expirado.");
      }
      effectiveRole = portalRole;
    }

    return {
      accessToken: await this.signToken(
        {
          sub: membership.userId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          roleId: effectiveRole.id,
          roleKey: effectiveRole.key,
          platformRole: membership.user.platformRole,
          iatMs: Date.now(),
          sid: payload.sid,
          portalAccessId: payload.portalAccessId,
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
      include: {
        tenant: true,
        role: true,
        contact: true,
        portalAccess: { include: { contact: true } },
      },
    });
    if (!invitation) throw new UnauthorizedException("Convite inválido ou expirado.");
    const invitationContact = invitation.portalAccess?.contact ?? invitation.contact;
    if (
      invitation.contactId &&
      (!invitationContact || invitationContact.archivedAt || invitationContact.active === false)
    ) {
      throw new UnauthorizedException("Convite de contato não está mais ativo.");
    }
    const requestedName = dto.name?.trim();
    const tenantAdministratorName =
      invitation.role.key === "tenant_admin"
        ? invitation.tenant.responsibleName?.trim()
        : undefined;
    const invitationName = invitationContact?.name || requestedName || tenantAdministratorName;

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
      if (invitation.contactId && !invitation.portalAccessId) {
        const existingMembership = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
        });
        if (existingMembership && existingMembership.roleId !== invitation.roleId) {
          throw new UnauthorizedException(
            "Este e-mail já possui outro acesso nesta organização. Solicite o vínculo explícito ao administrador.",
          );
        }
      }
      let membership;
      if (invitation.portalAccessId) {
        const currentMembership = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
        });
        if (currentMembership && currentMembership.status !== "ACTIVE") {
          throw new UnauthorizedException(
            "A conta existente está inativa nesta organização. Solicite a reativação ao administrador.",
          );
        }
        membership = currentMembership
          ? currentMembership
          : await tx.tenantMembership.create({
              data: {
                tenantId: invitation.tenantId,
                userId: user.id,
                roleId: invitation.roleId,
                presentationName: invitationName || null,
                status: "ACTIVE",
              },
            });
      } else {
        membership = await tx.tenantMembership.upsert({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
          update: { roleId: invitation.roleId, status: "ACTIVE" },
          create: {
            tenantId: invitation.tenantId,
            userId: user.id,
            roleId: invitation.roleId,
            presentationName: invitationName || null,
            status: "ACTIVE",
          },
        });
      }
      if (invitation.departmentIds.length && !invitation.portalAccessId) {
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
      if (invitation.portalAccessId) {
        const linkedAccess = await tx.customerPortalAccess.updateMany({
          where: {
            id: invitation.portalAccessId,
            tenantId: invitation.tenantId,
            contactId: invitation.contactId ?? undefined,
            revokedAt: null,
            contact: { archivedAt: null, active: true },
          },
          data: { userId: user.id, membershipId: membership.id, active: true },
        });
        if (linkedAccess.count !== 1) {
          throw new UnauthorizedException("Convite de contato não está mais ativo.");
        }
      } else if (invitation.contactId) {
        const linkedContact = await tx.contact.updateMany({
          where: {
            id: invitation.contactId,
            tenantId: invitation.tenantId,
            archivedAt: null,
            active: true,
          },
          data: { portalMembershipId: membership.id, portalAccessActive: true },
        });
        if (linkedContact.count !== 1) {
          throw new UnauthorizedException("Convite de contato não está mais ativo.");
        }
      }
      const acceptedAt = new Date();
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt },
      });
      if (invitation.portalAccessId) {
        await tx.userInvitation.updateMany({
          where: {
            tenantId: invitation.tenantId,
            portalAccessId: invitation.portalAccessId,
            status: "PENDING",
            id: { not: invitation.id },
          },
          data: { status: "REVOKED", revokedAt: acceptedAt },
        });
      }
    });

    if (invitation.portalAccess) {
      return this.loginPortal({
        login: invitation.portalAccess.login,
        password: dto.password,
        tenantSlug: invitation.tenant.slug,
      });
    }
    return this.loginTenant({
      email: invitation.email,
      password: dto.password,
      tenantSlug: invitation.tenant.slug,
    });
  }

  async invitationPreview(token: string) {
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        tokenHash: hashToken(token),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        role: { select: { key: true, name: true } },
        contact: {
          include: {
            customer: { select: { id: true, name: true } },
            customerDepartment: { select: { id: true, name: true } },
            customerBranch: { select: { id: true, name: true } },
          },
        },
        portalAccess: {
          include: {
            contact: true,
            customer: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!invitation) throw new UnauthorizedException("Convite inválido ou expirado.");
    const previewContact = invitation.portalAccess?.contact ?? invitation.contact;
    if (
      invitation.contactId &&
      (!previewContact || previewContact.archivedAt || previewContact.active === false)
    ) {
      throw new UnauthorizedException("Convite de contato não está mais ativo.");
    }
    const linkedPortalLogin =
      invitation.portalAccess?.login ??
      (invitation.contactId
        ? (
            await this.prisma.customerPortalAccess.findFirst({
              where: {
                tenantId: invitation.tenant.id,
                contactId: invitation.contactId,
                revokedAt: null,
              },
              orderBy: { updatedAt: "desc" },
              select: { login: true },
            })
          )?.login
        : undefined);
    return {
      email: invitation.email,
      login: linkedPortalLogin ?? invitation.email,
      expiresAt: invitation.expiresAt,
      tenant: invitation.tenant,
      profile:
        invitation.portalAccess?.accessProfile ??
        invitation.contact?.customerAccessProfile ??
        invitation.role.name,
      contact: previewContact
        ? {
            id: previewContact.id,
            name: previewContact.name,
            customer: invitation.portalAccess?.customer ?? invitation.contact?.customer,
            department:
              invitation.portalAccess?.department ?? invitation.contact?.customerDepartment,
            branch: invitation.portalAccess?.branch ?? invitation.contact?.customerBranch,
          }
        : null,
    };
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
        chatBubbleColor: membership.user.chatBubbleColor,
        chatBubbleTextColor: membership.user.chatBubbleTextColor,
        customerBubbleColor: membership.user.customerBubbleColor,
        customerBubbleTextColor: membership.user.customerBubbleTextColor,
        chatBackgroundColor: membership.user.chatBackgroundColor,
        chatBackgroundMode: membership.user.chatBackgroundMode,
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
          chatBubbleColor: user.chatBubbleColor,
          chatBubbleTextColor: user.chatBubbleTextColor,
          customerBubbleColor: user.customerBubbleColor,
          customerBubbleTextColor: user.customerBubbleTextColor,
          chatBackgroundColor: user.chatBackgroundColor,
          chatBackgroundMode: user.chatBackgroundMode,
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
    let effectiveRole = membership.role;
    let portalAccess:
      | {
          id: string;
          contactId: string;
          branchId: string;
          departmentId: string | null;
          accessProfile: "COLLABORATOR" | "MANAGER" | "FULL_ACCESS";
          customer: { id: string; name: string };
        }
      | undefined;
    let portalContactName: string | undefined;
    if (current.portalAccessId) {
      const access = await this.prisma.customerPortalAccess.findFirst({
        where: {
          id: current.portalAccessId,
          tenantId: current.tenantId,
          membershipId: current.membershipId,
          active: true,
          contact: { active: true, archivedAt: null },
          customer: { status: "ACTIVE", archivedAt: null },
          branch: { status: "ACTIVE", archivedAt: null },
          OR: [
            { accessProfile: "FULL_ACCESS" },
            { department: { active: true, archivedAt: null } },
          ],
        },
        include: {
          customer: { select: { id: true, name: true } },
          contact: { select: { name: true } },
        },
      });
      if (!access) throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
      const role = await this.prisma.role.findUnique({
        where: { tenantId_key: { tenantId: current.tenantId, key: "customer_portal" } },
        include: { permissions: { select: { permissionId: true } } },
      });
      if (!role?.active) throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
      effectiveRole = role;
      portalAccess = {
        id: access.id,
        customer: access.customer,
        contactId: access.contactId,
        branchId: access.branchId,
        departmentId: access.departmentId,
        accessProfile: access.accessProfile,
      };
      portalContactName = access.contact.name;
    }
    const permissions = await moduleAwarePermissions(
      this.prisma,
      membership.tenantId,
      membership.tenant.featureOverrides,
      effectiveRole,
    );

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: portalContactName ?? membershipDisplayName(membership),
        avatarUrl: membership.user.avatarUrl,
        keepSidebarCollapsed: membership.user.keepSidebarCollapsed,
        chatBubbleColor: membership.user.chatBubbleColor,
        chatBubbleTextColor: membership.user.chatBubbleTextColor,
        customerBubbleColor: membership.user.customerBubbleColor,
        customerBubbleTextColor: membership.user.customerBubbleTextColor,
        chatBackgroundColor: membership.user.chatBackgroundColor,
        chatBackgroundMode: membership.user.chatBackgroundMode,
        roleId: effectiveRole.id,
        roleKey: effectiveRole.key,
        roleName: effectiveRole.name,
        platformRole: membership.user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: effectiveRole.key,
        roleId: effectiveRole.id,
      },
      portalAccess,
      departments: current.portalAccessId
        ? []
        : membership.departments.map((item) => ({
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
    if (payload.portalAccessId) await this.assertActivePortalContext(payload);
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
          portalAccessId: payload.portalAccessId ?? null,
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
        portalAccessId: payload.portalAccessId ?? null,
        impersonationSessionId: payload.impersonationSessionId ?? null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException("Sessão expirada.");
  }

  private async assertActivePortalContext(payload: JwtPayload) {
    const access = await this.prisma.customerPortalAccess.findFirst({
      where: {
        id: payload.portalAccessId,
        tenantId: payload.tenantId,
        membershipId: payload.membershipId,
        active: true,
        contact: { active: true, archivedAt: null },
        customer: { status: "ACTIVE", archivedAt: null },
        branch: { status: "ACTIVE", archivedAt: null },
        OR: [{ accessProfile: "FULL_ACCESS" }, { department: { active: true, archivedAt: null } }],
      },
      select: { id: true },
    });
    if (!access) throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
  }

  private async createSession(input: {
    userId: string;
    tenantId?: string;
    membershipId?: string;
    portalAccessId?: string;
    impersonationSessionId?: string;
  }) {
    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        portalAccessId: input.portalAccessId,
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
