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
import { moduleAwarePermissions } from "./effective-permissions";
import { roleChatDepartmentIds, roleChatPreferences, roleConnectionIds } from "./connection-access";
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

    if (current.surface !== "tenant") {
      throw new ForbiddenException({
        code: "TENANT_SURFACE_REQUIRED",
        message: "Esta sessão não pertence à superfície de atendimento.",
      });
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

    let effectiveRole = membership.role;
    if (current.portalAccessId) {
      const portalAccess = await this.prisma.customerPortalAccess.findFirst({
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
        select: { id: true },
      });
      if (!portalAccess) throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
      const portalRole = await this.prisma.role.findUnique({
        where: { tenantId_key: { tenantId: current.tenantId, key: "customer_portal" } },
        include: { permissions: { select: { permissionId: true } } },
      });
      if (!portalRole?.active) {
        throw new UnauthorizedException("Acesso ao Portal do Cliente inativo.");
      }
      effectiveRole = portalRole;
    }

    const permissions = await moduleAwarePermissions(
      this.prisma,
      membership.tenantId,
      membership.tenant.featureOverrides,
      effectiveRole,
    );
    const granted = new Set<string>(permissions);
    const allowed = (required ?? []).every((permission) => granted.has(permission));
    const anyAllowed =
      !anyRequired?.length || anyRequired.some((permission) => granted.has(permission));
    if (!allowed || !anyAllowed) throw new ForbiddenException("Permissão insuficiente.");

    request.user.roleId = effectiveRole.id;
    request.user.roleKey = effectiveRole.key;
    request.user.connectionIds = roleConnectionIds(effectiveRole);
    request.user.chatDepartmentIds = roleChatDepartmentIds(effectiveRole);
    request.user.chatScopes = roleChatPreferences(effectiveRole);
    request.user.permissions = permissions;
    request.user.assignedPermissionIds = effectiveRole.permissions.map(
      (permission) => permission.permissionId,
    );
    return true;
  }
}
