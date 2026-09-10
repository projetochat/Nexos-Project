import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ConversationStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { AssignDepartmentMemberDto } from "./dto/assign-department-member.dto";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Controller("departments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
  ) {}

  @Get()
  @RequirePermissions("departments.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const departments = await this.prisma.department.findMany({
      where: { tenantId: current.tenantId },
      orderBy: { name: "asc" },
      include: {
        members: true,
        conversations: {
          where: { status: { not: ConversationStatus.FECHADA }, archivedAt: null },
          select: { id: true },
        },
      },
    });
    return departments.map((department) => ({
      ...this.serialize(department),
      memberCount: department.members.length,
      openConversationCount: department.conversations.length,
    }));
  }

  @Get(":id")
  @RequirePermissions("departments.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const department = await this.findDepartmentOrThrow(id, current.tenantId);
    return this.serialize(department);
  }

  @Post()
  @RequirePermissions("departments.manage")
  async create(@Body() dto: CreateDepartmentDto, @CurrentUser() current: AuthenticatedUser) {
    const name = dto.name.trim();
    const department = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tenants" WHERE id = ${current.tenantId} FOR UPDATE`,
      );
      await this.entitlements.assertTenantOperational(current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxDepartments",
        await tx.department.count({ where: { tenantId: current.tenantId, active: true } }),
      );
      await this.ensureNameAvailable(tx, current.tenantId, name);
      return tx.department.create({
        data: {
          tenantId: current.tenantId,
          name,
          description: dto.description?.trim() || null,
          color: dto.color ?? "#3B82F6",
          active: dto.active ?? true,
        },
      });
    });
    return this.serialize(department);
  }

  @Patch(":id")
  @RequirePermissions("departments.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findDepartmentOrThrow(id, current.tenantId);
    const department = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await this.ensureNameAvailable(tx, current.tenantId, dto.name.trim(), existing.id);
      }
      return tx.department.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          color: dto.color,
          active: dto.active,
        },
      });
    });
    return this.serialize(department);
  }

  @Delete(":id")
  @RequirePermissions("departments.manage")
  async deactivate(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findDepartmentOrThrow(id, current.tenantId);
    const department = await this.prisma.department.update({
      where: { id },
      data: { active: false },
    });
    return this.serialize(department);
  }

  @Post(":id/members")
  @RequirePermissions("departments.manage")
  async assignMember(
    @Param("id") id: string,
    @Body() dto: AssignDepartmentMemberDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findDepartmentOrThrow(id, current.tenantId);
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: dto.membershipId, tenantId: current.tenantId, status: "ACTIVE" },
    });
    if (!membership) throw new BadRequestException("Membership inexistente para este tenant.");

    return this.prisma.departmentMembership.upsert({
      where: { departmentId_membershipId: { departmentId: id, membershipId: dto.membershipId } },
      update: {},
      create: { tenantId: current.tenantId, departmentId: id, membershipId: dto.membershipId },
    });
  }

  @Delete(":id/members/:membershipId")
  @RequirePermissions("departments.manage")
  async removeMember(
    @Param("id") id: string,
    @Param("membershipId") membershipId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findDepartmentOrThrow(id, current.tenantId);
    await this.prisma.departmentMembership.deleteMany({
      where: { tenantId: current.tenantId, departmentId: id, membershipId },
    });
    return { ok: true };
  }

  private async findDepartmentOrThrow(id: string, tenantId: string) {
    const department = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!department) throw new NotFoundException("Departamento não encontrado.");
    return department;
  }

  private async ensureNameAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    name: string,
    excludeDepartmentId?: string,
  ) {
    const normalizedName = normalizeDepartmentName(name);
    const departments = await tx.department.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const duplicate = departments.find(
      (department) =>
        department.id !== excludeDepartmentId &&
        normalizeDepartmentName(department.name) === normalizedName,
    );
    if (duplicate) {
      throw new BadRequestException("Já existe um departamento com este nome.");
    }
  }

  private serialize(department: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    active: boolean;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: department.id,
      tenantId: department.tenantId,
      name: department.name,
      description: department.description,
      color: department.color,
      active: department.active,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }
}

function normalizeDepartmentName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}
