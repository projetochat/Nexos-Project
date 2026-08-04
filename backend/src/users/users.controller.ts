import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type MembershipWithRelations = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
    platformRole: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
  };
  departments: Array<{
    department: {
      id: string;
      name: string;
      description: string | null;
      color: string;
      active: boolean;
    };
  }>;
};

@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  @Get("me")
  async me(@CurrentUser() current: AuthenticatedUser) {
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: current.membershipId },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
        departments: { include: { department: true } },
      },
    });
    const permissions = membership.role.permissions.map((item) => item.permissionId);

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
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
      departments: membership.departments.map((item) => this.serializeDepartment(item.department)),
      permissions,
      capabilities: {
        canManageTenant: permissions.includes("users.manage"),
        canOperateInbox: permissions.some((permission) => permission.startsWith("chat.")),
      },
    };
  }

  @Get("users")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId: current.tenantId },
      orderBy: { user: { name: "asc" } },
      include: {
        user: true,
        role: true,
        departments: { include: { department: true } },
      },
    });

    return memberships.map((membership) => this.serializeMembership(membership));
  }

  @Get("users/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const membership = await this.findMembershipOrThrow(id, current.tenantId);
    return this.serializeMembership(membership);
  }

  @Post("users")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.manage")
  async create(@Body() dto: CreateUserDto, @CurrentUser() current: AuthenticatedUser) {
    const roleId = dto.roleId ?? (await this.defaultRoleId(current.tenantId));
    await this.assertRoleInTenant(roleId, current.tenantId);
    await this.assertDepartmentsInTenant(dto.departmentIds ?? [], current.tenantId);

    const passwordHash = await hash(dto.password, 12);
    const email = dto.email.toLowerCase().trim();

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenants" WHERE id = ${current.tenantId} FOR UPDATE`,
      );
      await this.entitlements.assertTenantOperational(current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxUsers",
        await tx.tenantMembership.count({
          where: { tenantId: current.tenantId, status: "ACTIVE", user: { status: "ACTIVE" } },
        }),
      );
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        const existing = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: current.tenantId, userId: user.id } },
        });
        if (existing) throw new BadRequestException("Usuario ja pertence a este tenant.");
        user = await tx.user.update({
          where: { id: user.id },
          data: { name: dto.name.trim(), passwordHash, status: "ACTIVE" },
        });
      } else {
        user = await tx.user.create({
          data: { email, name: dto.name.trim(), passwordHash },
        });
      }

      const created = await tx.tenantMembership.create({
        data: { tenantId: current.tenantId, userId: user.id, roleId, status: "ACTIVE" },
      });
      await this.replaceDepartments(tx, current.tenantId, created.id, dto.departmentIds ?? []);
      return tx.tenantMembership.findUniqueOrThrow({
        where: { id: created.id },
        include: { user: true, role: true, departments: { include: { department: true } } },
      });
    });

    return this.serializeMembership(membership);
  }

  @Patch("users/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findMembershipOrThrow(id, current.tenantId);
    if (dto.roleId) await this.assertRoleInTenant(dto.roleId, current.tenantId);
    if (dto.departmentIds)
      await this.assertDepartmentsInTenant(dto.departmentIds, current.tenantId);

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          email: dto.email?.toLowerCase().trim(),
          name: dto.name?.trim(),
          passwordHash: dto.password ? await hash(dto.password, 12) : undefined,
          status: dto.status,
        },
      });
      await tx.tenantMembership.update({
        where: { id: existing.id },
        data: { roleId: dto.roleId, status: dto.membershipStatus },
      });
      if (dto.departmentIds) {
        await this.replaceDepartments(tx, current.tenantId, existing.id, dto.departmentIds);
      }
      return tx.tenantMembership.findUniqueOrThrow({
        where: { id: existing.id },
        include: { user: true, role: true, departments: { include: { department: true } } },
      });
    });

    return this.serializeMembership(membership);
  }

  @Patch("users/:id/activate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.manage")
  activate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.setMembershipStatus(id, current.tenantId, "ACTIVE");
  }

  @Patch("users/:id/deactivate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users.manage")
  deactivate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.setMembershipStatus(id, current.tenantId, "DISABLED");
  }

  private async setMembershipStatus(id: string, tenantId: string, status: "ACTIVE" | "DISABLED") {
    const membership = await this.findMembershipOrThrow(id, tenantId);
    const updated = await this.prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { status },
      include: { user: true, role: true, departments: { include: { department: true } } },
    });
    return this.serializeMembership(updated);
  }

  private async defaultRoleId(tenantId: string) {
    const role = await this.prisma.role.findUnique({
      where: { tenantId_key: { tenantId, key: "agent" } },
    });
    if (!role) throw new BadRequestException("Role padrao nao encontrada.");
    return role.id;
  }

  private async assertRoleInTenant(roleId: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new BadRequestException("Role inexistente para este tenant.");
  }

  private async assertDepartmentsInTenant(departmentIds: string[], tenantId: string) {
    if (!departmentIds.length) return;
    const count = await this.prisma.department.count({
      where: { tenantId, id: { in: departmentIds }, active: true },
    });
    if (count !== new Set(departmentIds).size) {
      throw new BadRequestException("Departamento inexistente para este tenant.");
    }
  }

  private async findMembershipOrThrow(id: string, tenantId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id, tenantId },
      include: { user: true, role: true, departments: { include: { department: true } } },
    });
    if (!membership) throw new NotFoundException("Usuario nao encontrado.");
    return membership;
  }

  private async replaceDepartments(
    tx: Pick<PrismaService, "departmentMembership">,
    tenantId: string,
    membershipId: string,
    departmentIds: string[],
  ) {
    await tx.departmentMembership.deleteMany({ where: { tenantId, membershipId } });
    if (!departmentIds.length) return;
    await tx.departmentMembership.createMany({
      data: [...new Set(departmentIds)].map((departmentId) => ({
        tenantId,
        membershipId,
        departmentId,
      })),
      skipDuplicates: true,
    });
  }

  private serializeMembership(membership: MembershipWithRelations) {
    return {
      id: membership.id,
      status: membership.status,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        status: membership.user.status,
        platformRole: membership.user.platformRole,
      },
      role: {
        id: membership.role.id,
        key: membership.role.key,
        name: membership.role.name,
      },
      departments: membership.departments.map((item) => this.serializeDepartment(item.department)),
    };
  }

  private serializeDepartment(department: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    active: boolean;
  }) {
    return {
      id: department.id,
      name: department.name,
      description: department.description,
      color: department.color,
      active: department.active,
    };
  }
}
