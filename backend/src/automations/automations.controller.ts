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
import {
  changedDeletion,
  ConfirmDeletionDto,
  deletionSnapshot,
  type DeletionImpactPreview,
} from "../common/deletion-impact";
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

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return max ? Math.min(normalized, max) : normalized;
}

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
    const page = parsePositiveInteger(query.page, 1);
    const pageSize = parsePositiveInteger(query.pageSize, 25, 100);
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
  @RequirePermissions("automations.create")
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
  @RequirePermissions("automations.update")
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

  @Get(":id/deletion-preview")
  @RequirePermissions("automations.delete")
  async deletionPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.automationDeletionImpact(id, current.tenantId);
  }

  @Delete(":id")
  @RequirePermissions("automations.delete")
  async remove(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const impact = await this.automationDeletionImpact(id, current.tenantId, tx);
      if (impact.snapshotToken !== dto.snapshotToken) {
        return changedDeletion(impact);
      }
      await tx.outboxEvent.create({
        data: {
          tenantId: current.tenantId,
          type: "automation.deleted.audit",
          aggregateId: id,
          status: "PROCESSED",
          processedAt: new Date(),
          payload: {
            automationId: id,
            name: impact.record.name,
            deletedByMembershipId: current.membershipId,
            snapshotToken: impact.snapshotToken,
          },
        },
      });
      await tx.automationRule.delete({
        where: { tenantId_id: { tenantId: current.tenantId, id } },
      });
      return { status: "deleted" as const };
    });
  }

  private async automationDeletionImpact(
    id: string,
    tenantId: string,
    db: Pick<PrismaService, "automationRule"> | Prisma.TransactionClient = this.prisma,
  ): Promise<DeletionImpactPreview> {
    const rule = await db.automationRule.findFirst({
      where: { id, tenantId },
      include: automationInclude,
    });
    if (!rule) throw new NotFoundException("Automação não encontrada.");
    const snapshotToken = deletionSnapshot({
      id: rule.id,
      updatedAt: rule.updatedAt,
      status: rule.status,
      actionType: rule.actionType,
      departmentId: rule.departmentId,
    });
    return {
      snapshotToken,
      title: "Excluir automação",
      prompt: "Esta exclusão é permanente e removerá a regra de automação deste tenant.",
      record: {
        name: rule.name,
        identifiers: [
          { label: "Ação", value: rule.actionType.toLowerCase() },
          { label: "Disparo", value: rule.matchText },
        ],
      },
      dependencies: rule.department
        ? [
            {
              id: "department",
              label: "Departamento vinculado",
              count: 1,
              operation: "unlink" as const,
              operationLabel: "O vínculo será removido com a automação.",
              items: [{ id: rule.department.id, label: rule.department.name }],
            },
          ]
        : [],
      consequences: [
        {
          id: "rule",
          text: "A regra deixará de existir e não poderá ser reativada.",
          irreversible: true,
        },
      ],
      confirmation: {
        level: "standard" as const,
        confirmLabel: "Excluir automação",
      },
    };
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
