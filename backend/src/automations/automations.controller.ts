import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { AutomationActionType, AutomationRuleStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

class ListAutomationRulesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: AutomationRuleStatus;
}

class CreateAutomationRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  matchText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  responseText?: string;

  @IsOptional()
  @IsIn(["BOT_REPLY", "ASSIGN_DEPARTMENT", "NOTIFY_TEAM"])
  actionType?: AutomationActionType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  matchText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  responseText?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: AutomationRuleStatus;

  @IsOptional()
  @IsIn(["BOT_REPLY", "ASSIGN_DEPARTMENT", "NOTIFY_TEAM"])
  actionType?: AutomationActionType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

const automationInclude = {
  department: true,
} satisfies Prisma.AutomationRuleInclude;

@Controller("automations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomationsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("automations.read")
  async list(
    @Query() query: ListAutomationRulesQueryDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.AutomationRuleWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationRule.findMany({
        where,
        include: automationInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.automationRule.count({ where }),
    ]);
    return {
      items: items.map(serializeAutomation),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  @Post()
  @RequirePermissions("automations.manage")
  async create(@Body() dto: CreateAutomationRuleDto, @CurrentUser() current: AuthenticatedUser) {
    await this.assertDepartment(dto.departmentId, current.tenantId);
    const actionType = dto.actionType ?? AutomationActionType.BOT_REPLY;
    if (actionType === AutomationActionType.BOT_REPLY && !dto.responseText?.trim()) {
      throw new BadRequestException("Resposta do bot obrigatoria para regra de bot.");
    }
    const rule = await this.prisma.automationRule.create({
      data: {
        tenantId: current.tenantId,
        name: dto.name.trim(),
        matchText: normalizeMatch(dto.matchText),
        responseText: dto.responseText?.trim(),
        actionType,
        departmentId: dto.departmentId,
        createdByMembershipId: current.membershipId,
      },
      include: automationInclude,
    });
    return serializeAutomation(rule);
  }

  @Patch(":id")
  @RequirePermissions("automations.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.assertDepartment(dto.departmentId, current.tenantId);
    const rule = await this.prisma.automationRule.update({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
      data: {
        name: dto.name?.trim(),
        matchText: dto.matchText ? normalizeMatch(dto.matchText) : undefined,
        responseText: dto.responseText?.trim(),
        actionType: dto.actionType,
        status: dto.status,
        departmentId: dto.departmentId,
      },
      include: automationInclude,
    });
    return serializeAutomation(rule);
  }

  @Delete(":id")
  @RequirePermissions("automations.manage")
  async archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.prisma.automationRule.update({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
      data: { archivedAt: new Date(), status: "DISABLED" },
    });
    return { ok: true };
  }

  private async assertDepartment(departmentId: string | undefined, tenantId: string) {
    if (!departmentId) return;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, tenantId, active: true },
    });
    if (!department) throw new BadRequestException("Departamento inexistente para este tenant.");
  }
}

function normalizeMatch(value: string) {
  return value.trim().toLowerCase();
}

function serializeAutomation(
  rule: Prisma.AutomationRuleGetPayload<{ include: typeof automationInclude }>,
) {
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status.toLowerCase(),
    actionType: rule.actionType.toLowerCase(),
    matchText: rule.matchText,
    responseText: rule.responseText,
    department: rule.department
      ? { id: rule.department.id, nome: rule.department.name, cor: rule.department.color }
      : null,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}
