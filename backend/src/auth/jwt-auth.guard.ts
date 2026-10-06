import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const [scheme, token] = header?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Token ausente.");

    const payload = await this.verifyAccessToken(token);
    if (payload.typ !== "access") throw new UnauthorizedException("Token inválido.");
    await this.auth.assertAccessSession(payload);

    const effectiveRoleKey = await this.assertOnboardingAccess(request, payload);

    request.user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      roleId: payload.roleId,
      roleKey: effectiveRoleKey,
      platformRole: payload.platformRole,
      surface: payload.surface,
      iatMs: payload.iatMs,
      sid: payload.sid,
      impersonationSessionId: payload.impersonationSessionId,
      actorPlatformUserId: payload.actorPlatformUserId,
    };
    return true;
  }

  private async assertOnboardingAccess(
    request: Request,
    payload: Awaited<ReturnType<AuthService["verifyToken"]>>,
  ) {
    if (!this.prisma || payload.surface !== "tenant" || !payload.tenantId) return payload.roleKey;
    const [state] = await this.prisma.$queryRaw<Array<{ status: string }>>(
      Prisma.sql`
        SELECT "status"::text AS "status"
        FROM "tenant_onboarding_states"
        WHERE "tenantId" = ${payload.tenantId}
        LIMIT 1
      `,
    );
    if (!state || state.status === "COMPLETED") return payload.roleKey;

    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: payload.membershipId,
        tenantId: payload.tenantId,
        userId: payload.sub,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
      },
      select: { role: { select: { key: true } } },
    });
    if (!membership) throw new UnauthorizedException("Membership inativa ou inválida.");

    const roleKey = membership.role.key;
    const method = request.method.toUpperCase();
    const path = normalizeRequestPath(request.originalUrl || request.path);
    if (isOnboardingStatusRequest(method, path) || isTenantBootstrapRequest(method, path)) {
      return roleKey;
    }
    if (
      roleKey === "tenant_admin" &&
      !payload.impersonationSessionId &&
      isOnboardingAdministratorRequest(method, path)
    ) {
      return roleKey;
    }
    throw new ForbiddenException({
      code: "ONBOARDING_PENDING",
      message: "A configuração inicial da organização ainda não foi concluída pelo administrador.",
    });
  }

  private async verifyAccessToken(token: string) {
    try {
      return await this.auth.verifyToken(token, "JWT_SECRET");
    } catch {
      throw new UnauthorizedException("Token inválido.");
    }
  }
}

export function normalizeRequestPath(value: string) {
  const path = value.split("?", 1)[0].replace(/^\/api(?=\/|$)/, "");
  return path || "/";
}

export function isOnboardingStatusRequest(method: string, path: string) {
  return method === "GET" && path === "/onboarding/status";
}

export function isTenantBootstrapRequest(method: string, path: string) {
  return method === "GET" && (path === "/auth/me" || path === "/me");
}

export function isOnboardingAdministratorRequest(method: string, path: string) {
  if (
    (method === "PATCH" && path === "/onboarding/progress") ||
    (method === "POST" && path === "/onboarding/complete")
  ) {
    return true;
  }
  if (path === "/messaging/connections") return method === "GET";
  if (path === "/messaging/connections/evolution") return method === "POST";
  if (/^\/messaging\/connections\/[^/]+\/(status|qr)$/.test(path)) return method === "GET";
  if (/^\/messaging\/connections\/[^/]+\/logout$/.test(path)) return method === "PATCH";
  if (/^\/messaging\/connections\/[^/]+$/.test(path)) {
    return ["GET", "PATCH", "DELETE"].includes(method);
  }
  if (path === "/permissions") return method === "GET";
  if (path === "/roles/scope-options") return method === "GET";
  if (path === "/roles" || /^\/roles\/[^/]+$/.test(path)) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(method);
  }
  if (path === "/departments/connection-options") return method === "GET";
  if (path === "/departments" || /^\/departments\/[^/]+$/.test(path)) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(method);
  }
  if (path === "/users" || /^\/users\/[^/]+$/.test(path)) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(method);
  }
  if (/^\/users\/[^/]+\/(activate|deactivate)$/.test(path)) {
    return method === "PATCH";
  }
  if (path === "/user-invitations") return method === "GET" || method === "POST";
  if (/^\/user-invitations\/[^/]+\/revoke$/.test(path)) return method === "PATCH";
  if (path === "/quick-replies" || /^\/quick-replies\/[^/]+$/.test(path)) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(method);
  }
  if (path === "/tags" || /^\/tags\/[^/]+$/.test(path)) {
    return ["GET", "POST", "PATCH", "DELETE"].includes(method);
  }
  return false;
}
