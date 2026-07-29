import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() current: AuthenticatedUser) {
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: current.membershipId },
      include: { user: true, tenant: true },
    });

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      permissions: {
        canManageTenant: ["SUPER_ADMIN", "ADMIN"].includes(membership.role),
        canOperateInbox: ["ADMIN", "SUPERVISOR", "OPERATOR"].includes(membership.role),
      },
    };
  }
}
