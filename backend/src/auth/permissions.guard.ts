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
import { AuthenticatedRequest } from "./jwt-auth.guard";
import { PermissionKey } from "./permissions.constants";
import { effectivePermissions } from "./effective-permissions";
import { roleConnectionIds } from "./connection-access";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "./permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyRequired = this.reflector.getAllAndOverride<PermissionKey[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const current = request.user;
    if (!current) throw new UnauthorizedException("Token ausente.");

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
        tenant: true,
        role: {
          include: {
            permissions: { select: { permissionId: true } },
          },
        },
      },
    });
    if (!membership) throw new UnauthorizedException("Membership inativa ou invalida.");
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

    const permissions = effectivePermissions(membership.role);
    const granted = new Set<string>(permissions);
    const allowed = (required ?? []).every((permission) => granted.has(permission));
    const anyAllowed =
      !anyRequired?.length || anyRequired.some((permission) => granted.has(permission));
    if (!allowed || !anyAllowed) throw new ForbiddenException("Permissão insuficiente.");

    request.user.roleId = membership.roleId;
    request.user.roleKey = membership.role.key;
    request.user.connectionIds = roleConnectionIds(membership.role);
    request.user.permissions = permissions;
    const connectionId = /\/messaging\/connections\//.test(request.originalUrl)
      ? request.params.id
      : undefined;
    if (
      typeof connectionId === "string" &&
      membership.role.key !== "tenant_admin" &&
      !request.user.connectionIds?.includes(connectionId)
    ) {
      throw new ForbiddenException("Instância não permitida pelo perfil.");
    }
    return true;
  }
}
