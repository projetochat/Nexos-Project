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
import { PERMISSIONS_KEY } from "./permissions.decorator";

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
    if (!required?.length) return true;

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
      },
      include: {
        role: {
          include: {
            permissions: { select: { permissionId: true } },
          },
        },
      },
    });
    if (!membership) throw new UnauthorizedException("Membership inativa ou invalida.");

    const granted = new Set(membership.role.permissions.map((item) => item.permissionId));
    const allowed = required.every((permission) => granted.has(permission));
    if (!allowed) throw new ForbiddenException("Permissao insuficiente.");

    request.user.roleId = membership.roleId;
    request.user.roleKey = membership.role.key;
    request.user.permissions = [...granted] as PermissionKey[];
    return true;
  }
}
