import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { JwtPayload } from "../auth/auth.types";
import { moduleAwarePermissions } from "../auth/effective-permissions";
import { Prisma } from "../generated/prisma";

export type RealtimeAuthCode =
  | "REALTIME_TOKEN_MISSING"
  | "REALTIME_TOKEN_INVALID"
  | "REALTIME_TOKEN_EXPIRED"
  | "REALTIME_USER_INACTIVE"
  | "REALTIME_MEMBERSHIP_INACTIVE"
  | "REALTIME_ONBOARDING_PENDING";

export class RealtimeAuthError extends Error {
  constructor(readonly code: RealtimeAuthCode) {
    super(code);
  }
}

export type RealtimeSocketContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  surface: "tenant";
  departmentIds: string[];
  permissions: string[];
  sid?: string;
  portalAccessId?: string;
  exp: number;
  iatMs?: number;
  impersonationSessionId?: string;
  actorPlatformUserId?: string;
};

@Injectable()
export class RealtimeAuthService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async authenticate(accessToken: unknown): Promise<RealtimeSocketContext> {
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      throw new RealtimeAuthError("REALTIME_TOKEN_MISSING");
    }

    const payload = await this.verifyAccessToken(accessToken.trim());
    if (payload.typ !== "access") throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    if (payload.surface !== "tenant" || payload.aud !== "trixus-tenant") {
      throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
    const exp = this.assertNotExpired(payload.exp);
    if (payload.sid) {
      await this.assertPersistedSession({
        userId: payload.sub,
        tenantId: payload.tenantId,
        membershipId: payload.membershipId,
        sid: payload.sid,
        portalAccessId: payload.portalAccessId,
        impersonationSessionId: payload.impersonationSessionId,
      });
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: payload.membershipId,
        tenantId: payload.tenantId,
        userId: payload.sub,
      },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
        departments: { select: { departmentId: true } },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new RealtimeAuthError("REALTIME_MEMBERSHIP_INACTIVE");
    }
    if (membership.user.status !== "ACTIVE") throw new RealtimeAuthError("REALTIME_USER_INACTIVE");
    if (membership.tenant.status !== "ACTIVE" && membership.tenant.status !== "TRIAL") {
      throw new RealtimeAuthError("REALTIME_MEMBERSHIP_INACTIVE");
    }
    if (
      membership.tenant.authRevokedAt &&
      payload.iatMs &&
      payload.iatMs < membership.tenant.authRevokedAt.getTime()
    ) {
      throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
    if (payload.impersonationSessionId) {
      const session = await this.prisma.impersonationSession.findFirst({
        where: {
          id: payload.impersonationSessionId,
          actorUserId: payload.actorPlatformUserId,
          tenantId: payload.tenantId,
          impersonatedMembershipId: payload.membershipId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!session) throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
    let effectiveRole = membership.role;
    if (payload.portalAccessId) {
      await this.assertPortalAccess({
        portalAccessId: payload.portalAccessId,
        tenantId: payload.tenantId,
        membershipId: payload.membershipId,
      });
      const portalRole = await this.prisma.role.findUnique({
        where: { tenantId_key: { tenantId: payload.tenantId, key: "customer_portal" } },
        include: { permissions: { select: { permissionId: true } } },
      });
      if (!portalRole?.active) throw new RealtimeAuthError("REALTIME_MEMBERSHIP_INACTIVE");
      effectiveRole = portalRole;
    }
    await this.assertOnboardingCompleted(membership.tenantId);

    return {
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      roleId: effectiveRole.id,
      roleKey: effectiveRole.key,
      platformRole: membership.user.platformRole,
      surface: "tenant",
      departmentIds: payload.portalAccessId
        ? []
        : membership.departments.map((item) => item.departmentId),
      permissions: await moduleAwarePermissions(
        this.prisma,
        membership.tenantId,
        membership.tenant.featureOverrides,
        effectiveRole,
      ),
      sid: payload.sid,
      portalAccessId: payload.portalAccessId,
      exp,
      iatMs: payload.iatMs,
      impersonationSessionId: payload.impersonationSessionId,
      actorPlatformUserId: payload.actorPlatformUserId,
    };
  }

  async assertSession(
    context: Pick<
      RealtimeSocketContext,
      | "userId"
      | "tenantId"
      | "membershipId"
      | "sid"
      | "portalAccessId"
      | "exp"
      | "iatMs"
      | "impersonationSessionId"
      | "actorPlatformUserId"
    >,
  ) {
    this.assertNotExpired(context.exp);
    if (context.sid) await this.assertPersistedSession(context);
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        userId: context.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
      },
      select: { tenant: { select: { authRevokedAt: true } } },
    });
    if (!membership) throw new RealtimeAuthError("REALTIME_MEMBERSHIP_INACTIVE");
    if (context.portalAccessId) {
      await this.assertPortalAccess({
        portalAccessId: context.portalAccessId,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
      });
    }
    await this.assertOnboardingCompleted(context.tenantId);
    if (
      membership.tenant.authRevokedAt &&
      context.iatMs &&
      context.iatMs < membership.tenant.authRevokedAt.getTime()
    ) {
      throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
    if (context.impersonationSessionId) {
      const impersonation = await this.prisma.impersonationSession.findFirst({
        where: {
          id: context.impersonationSessionId,
          actorUserId: context.actorPlatformUserId,
          tenantId: context.tenantId,
          impersonatedMembershipId: context.membershipId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!impersonation) throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
  }

  private async assertPersistedSession(
    context: Pick<
      RealtimeSocketContext,
      "userId" | "tenantId" | "membershipId" | "sid" | "portalAccessId" | "impersonationSessionId"
    >,
  ) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: context.sid,
        userId: context.userId,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        portalAccessId: context.portalAccessId ?? null,
        impersonationSessionId: context.impersonationSessionId ?? null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
  }

  private async assertPortalAccess(input: {
    portalAccessId: string;
    tenantId: string;
    membershipId: string;
  }) {
    const access = await this.prisma.customerPortalAccess.findFirst({
      where: {
        id: input.portalAccessId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        active: true,
        contact: { active: true, archivedAt: null },
        customer: { status: "ACTIVE", archivedAt: null },
        branch: { status: "ACTIVE", archivedAt: null },
        OR: [{ accessProfile: "FULL_ACCESS" }, { department: { active: true, archivedAt: null } }],
      },
      select: { id: true },
    });
    if (!access) throw new RealtimeAuthError("REALTIME_MEMBERSHIP_INACTIVE");
  }

  private async assertOnboardingCompleted(tenantId: string) {
    const [state] = await this.prisma.$queryRaw<Array<{ status: string }>>(
      Prisma.sql`
        SELECT "status"::text AS "status"
        FROM "tenant_onboarding_states"
        WHERE "tenantId" = ${tenantId}
        LIMIT 1
      `,
    );
    if (state?.status === "PENDING") {
      const entitlements = await new PlanEntitlementService(this.prisma).getEntitlements(tenantId);
      if (entitlements.features.chat === false) return;
      throw new RealtimeAuthError("REALTIME_ONBOARDING_PENDING");
    }
  }

  private assertNotExpired(exp?: number) {
    if (!exp || exp * 1000 <= Date.now()) {
      throw new RealtimeAuthError("REALTIME_TOKEN_EXPIRED");
    }
    return exp;
  }

  private async verifyAccessToken(token: string) {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.requiredSecret("JWT_SECRET"),
      });
    } catch (error) {
      if ((error as { name?: string }).name === "TokenExpiredError") {
        throw new RealtimeAuthError("REALTIME_TOKEN_EXPIRED");
      }
      throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
  }

  private requiredSecret(name: "JWT_SECRET") {
    const value = this.config.get<string>(name);
    if (!value || value.startsWith("change-me")) {
      throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
    }
    return value;
  }
}
