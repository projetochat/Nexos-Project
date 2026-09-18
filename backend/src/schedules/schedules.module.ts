import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma";
import { RealtimeModule } from "../realtime/realtime.module";
import { RealtimeService } from "../realtime/realtime.service";
import { SaveScheduleDto } from "./schedules.dto";

@Controller("schedules")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchedulesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}
  private scope(current: AuthenticatedUser): Prisma.ScheduleWhereInput {
    return {
      tenantId: current.tenantId,
      ...(current.roleKey !== "tenant_admin"
        ? { OR: [{ connectionId: null }, { connectionId: { in: current.connectionIds ?? [] } }] }
        : {}),
    };
  }
  @Get()
  @RequirePermissions("automations.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const rows = await this.prisma.schedule.findMany({
      where: this.scope(current),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({ ...(row.payload as object), id: row.id }));
  }
  @Post()
  @RequirePermissions("automations.manage")
  async save(@Body() dto: SaveScheduleDto, @CurrentUser() current: AuthenticatedUser) {
    if (
      !dto.title.trim() ||
      !dto.identifier.trim() ||
      !dto.content.trim() ||
      !Number.isFinite(Date.parse(dto.scheduledAt))
    )
      throw new BadRequestException("Informe título, identificador, conteúdo e data válidos.");
    const existing = await this.prisma.schedule.findUnique({
      where: { tenantId_id: { tenantId: current.tenantId, id: dto.id } },
    });
    if (
      existing?.connectionId &&
      current.roleKey !== "tenant_admin" &&
      !current.connectionIds?.includes(existing.connectionId)
    )
      throw new NotFoundException("Agendamento não encontrado.");
    if (dto.connectionId) {
      const connection = await this.prisma.messagingConnection.findFirst({
        where: { id: dto.connectionId, tenantId: current.tenantId, archivedAt: null },
      });
      if (
        !connection ||
        (current.roleKey !== "tenant_admin" && !current.connectionIds?.includes(dto.connectionId))
      )
        throw new BadRequestException("Instância indisponível para esta organização.");
    }
    if (
      dto.departmentId &&
      !(await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId: current.tenantId },
      }))
    )
      throw new BadRequestException("Departamento inválido.");
    if (
      dto.assignedMembershipId &&
      !(await this.prisma.tenantMembership.findFirst({
        where: { id: dto.assignedMembershipId, tenantId: current.tenantId, status: "ACTIVE" },
      }))
    )
      throw new BadRequestException("Atendente inválido.");
    const ids = [
      ...new Set([...dto.recipientIds, ...dto.recipients.map((recipient) => recipient.id)]),
    ];
    if (
      ids.length &&
      (await this.prisma.contact.count({
        where: { id: { in: ids }, tenantId: current.tenantId, archivedAt: null },
      })) !== ids.length
    )
      throw new BadRequestException("Contato inválido para esta organização.");
    if (dto.type === "message" && !dto.recipientIds.length)
      throw new BadRequestException("Selecione um destinatário.");
    const data = {
      connectionId: dto.connectionId || null,
      payload: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
    };
    const saved = await this.prisma.schedule.upsert({
      where: { tenantId_id: { tenantId: current.tenantId, id: dto.id } },
      create: { id: dto.id, tenantId: current.tenantId, ...data },
      update: data,
    });
    this.realtime.publish({ tenantId: current.tenantId }, "schedule.updated", {
      scheduleId: saved.id,
    });
    return { ...(saved.payload as object), id: saved.id };
  }
  @Delete(":id")
  @RequirePermissions("automations.manage")
  async remove(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const result = await this.prisma.schedule.deleteMany({ where: { ...this.scope(current), id } });
    if (!result.count) throw new NotFoundException("Agendamento não encontrado.");
    this.realtime.publish({ tenantId: current.tenantId }, "schedule.updated", { scheduleId: id });
    return { ok: true };
  }
}
@Module({ imports: [AuthModule, RealtimeModule], controllers: [SchedulesController] })
export class SchedulesModule {}
