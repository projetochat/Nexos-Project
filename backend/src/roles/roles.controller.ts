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
import { AuthenticatedUser } from "../auth/auth.types";
import { isPermissionKey, PERMISSIONS } from "../auth/permissions.constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("permissions")
  @RequirePermissions("roles.read")
  listPermissions() {
    return PERMISSIONS.map((id) => ({ id }));
  }

  @Get("roles")
  @RequirePermissions("roles.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: current.tenantId },
      orderBy: [{ system: "desc" }, { name: "asc" }],
      include: { permissions: true },
    });
    return roles.map((role) => this.serialize(role));
  }

  @Get("roles/:id")
  @RequirePermissions("roles.read")
  async findOne(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const role = await this.findRoleOrThrow(id, current.tenantId);
    return this.serialize(role);
  }

  @Post("roles")
  @RequirePermissions("roles.manage")
  async create(@Body() dto: CreateRoleDto, @CurrentUser() current: AuthenticatedUser) {
    this.assertPermissions(dto.permissionIds);
    const key = (dto.key ?? dto.name)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!key) throw new BadRequestException("Key de role invalida.");

    const role = await this.prisma.role.create({
      data: {
        tenantId: current.tenantId,
        key,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        metadata: dto.metadata === undefined ? undefined : JSON.parse(JSON.stringify(dto.metadata)),
        system: false,
        permissions: {
          create: [...new Set(dto.permissionIds)].map((permissionId) => ({ permissionId })),
        },
      },
      include: { permissions: true },
    });
    return this.serialize(role);
  }

  @Patch("roles/:id")
  @RequirePermissions("roles.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findRoleOrThrow(id, current.tenantId);
    if (dto.permissionIds) this.assertPermissions(dto.permissionIds);
    const role = await this.prisma.$transaction(async (tx) => {
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.rolePermission.createMany({
          data: [...new Set(dto.permissionIds)].map((permissionId) => ({
            roleId: existing.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
      return tx.role.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          metadata:
            dto.metadata === undefined ? undefined : JSON.parse(JSON.stringify(dto.metadata)),
        },
        include: { permissions: true },
      });
    });
    return this.serialize(role);
  }

  @Delete("roles/:id")
  @RequirePermissions("roles.manage")
  async remove(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const role = await this.findRoleOrThrow(id, current.tenantId);
    if (role.system) throw new BadRequestException("Role de sistema nao pode ser removida.");
    const inUse = await this.prisma.tenantMembership.count({
      where: { tenantId: current.tenantId, roleId: id },
    });
    if (inUse > 0) throw new BadRequestException("Role em uso por usuarios.");
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  private async findRoleOrThrow(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { permissions: true },
    });
    if (!role) throw new NotFoundException("Role nao encontrada.");
    return role;
  }

  private assertPermissions(permissionIds: string[]) {
    const invalid = permissionIds.find((permissionId) => !isPermissionKey(permissionId));
    if (invalid) throw new BadRequestException(`Permission invalida: ${invalid}`);
  }

  private serialize(role: {
    id: string;
    tenantId: string;
    key: string;
    name: string;
    description: string | null;
    metadata: unknown;
    system: boolean;
    permissions: Array<{ permissionId: string }>;
  }) {
    return {
      id: role.id,
      tenantId: role.tenantId,
      key: role.key,
      name: role.name,
      description: role.description,
      metadata: role.metadata,
      system: role.system,
      permissionIds: role.permissions.map((permission) => permission.permissionId),
    };
  }
}
