import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { PLATFORM_PERMISSIONS_KEY, type PlatformPermission } from "./platform-auth.decorator";

const grants: Record<string, PlatformPermission[]> = {
  ADMIN: [
    "platform.tenants.read",
    "platform.tenants.create",
    "platform.tenants.update",
    "platform.tenants.suspend",
    "platform.tenants.terminate",
    "platform.plans.read",
    "platform.plans.create",
    "platform.plans.update",
    "platform.plans.archive",
    "platform.subscriptions.read",
    "platform.subscriptions.create",
    "platform.subscriptions.update",
    "platform.subscriptions.cancel",
    "platform.usage.read",
    "platform.audit.read",
    "platform.impersonation.start",
    "platform.impersonation.stop",
    "platform.system.health.read",
  ],
  SUPPORT: [
    "platform.tenants.read",
    "platform.plans.read",
    "platform.subscriptions.read",
    "platform.usage.read",
    "platform.audit.read",
    "platform.impersonation.start",
    "platform.impersonation.stop",
    "platform.system.health.read",
  ],
  READONLY: [
    "platform.tenants.read",
    "platform.plans.read",
    "platform.subscriptions.read",
    "platform.usage.read",
    "platform.audit.read",
    "platform.system.health.read",
  ],
};

const highRiskPermissions = new Set<PlatformPermission>([
  "platform.tenants.suspend",
  "platform.tenants.terminate",
  "platform.plans.create",
  "platform.plans.update",
  "platform.plans.archive",
  "platform.subscriptions.create",
  "platform.subscriptions.update",
  "platform.subscriptions.cancel",
  "platform.impersonation.start",
]);

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<PlatformPermission[]>(
      PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const current = request.user;
    if (!current) throw new UnauthorizedException("Token ausente.");

    const user = await this.prisma.user.findFirst({
      where: { id: current.userId, status: "ACTIVE", platformRole: { not: "USER" } },
      select: { id: true, platformRole: true, status: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: "PLATFORM_ACCESS_DENIED",
        message: "Usuario sem papel ativo no plano de controle.",
      });
    }
    const permissions = grants[user.platformRole] ?? [];
    if (required?.length && !required.every((permission) => permissions.includes(permission))) {
      throw new ForbiddenException({
        code: "PLATFORM_PERMISSION_DENIED",
        message: "Permissao insuficiente no plano de controle.",
      });
    }
    if (required?.some((permission) => highRiskPermissions.has(permission))) {
      const activeImpersonation = await this.prisma.impersonationSession.findFirst({
        where: { actorUserId: user.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (activeImpersonation) {
        throw new ForbiddenException({
          code: "IMPERSONATION_HIGH_RISK_ACTION_BLOCKED",
          message: "A acao deve ser executada fora de uma sessao de impersonacao.",
        });
      }
    }
    request.user.platformRole = user.platformRole;
    request.user.platformPermissions = permissions;
    request.user.context = "platform";
    return true;
  }
}
