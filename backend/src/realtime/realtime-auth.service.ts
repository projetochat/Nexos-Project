import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/auth.types";
import { effectivePermissions } from "../auth/effective-permissions";

export type RealtimeAuthCode =
  | "REALTIME_TOKEN_MISSING"
  | "REALTIME_TOKEN_INVALID"
  | "REALTIME_TOKEN_EXPIRED"
  | "REALTIME_USER_INACTIVE"
  | "REALTIME_MEMBERSHIP_INACTIVE";

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
  departmentIds: string[];
  permissions: string[];
  sid?: string;
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
    const exp = this.assertNotExpired(payload.exp);
    if (payload.sid) {
      await this.assertPersistedSession({
        userId: payload.sub,
        tenantId: payload.tenantId,
        membershipId: payload.membershipId,
        sid: payload.sid,
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

    return {
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      platformRole: membership.user.platformRole,
      departmentIds: membership.departments.map((item) => item.departmentId),
      permissions: effectivePermissions(membership.role),
      sid: payload.sid,
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
      "userId" | "tenantId" | "membershipId" | "sid" | "impersonationSessionId"
    >,
  ) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: context.sid,
        userId: context.userId,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        impersonationSessionId: context.impersonationSessionId ?? null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) throw new RealtimeAuthError("REALTIME_TOKEN_INVALID");
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
