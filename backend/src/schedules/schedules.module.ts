import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigModule } from "@nestjs/config";
import { conversationVisibilityWhere } from "../conversations/conversation-visibility";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { MessageType, Prisma } from "../generated/prisma";
import {
  resolveMessageType,
  validatePolicy,
} from "../messaging/media/messaging-media-storage.service";
import type { QuickReplyAttachmentDto } from "../quick-replies/dto/quick-reply-message.dto";
import { RealtimeModule } from "../realtime/realtime.module";
import { RealtimeService } from "../realtime/realtime.service";
import { MessagingModule } from "../messaging/messaging.module";
import { ScheduleExecutionStatus } from "../generated/prisma";
import { ScheduleExecutorService } from "./schedule-executor.service";
import { ListSchedulesQueryDto, SaveScheduleDto, type ScheduleOrigin } from "./schedules.dto";
import {
  changedDeletion,
  ConfirmDeletionDto,
  deletionSnapshot,
  type DeletionImpactPreview,
  type DeletionResult,
} from "../common/deletion-impact";

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
  @RequirePermissions("schedules.read")
  async list(
    @CurrentUser() current: AuthenticatedUser,
    @Query() query: ListSchedulesQueryDto = {},
  ) {
    const where: Prisma.ScheduleWhereInput = query.conversationId
      ? {
          AND: [
            this.scope(current),
            {
              payload: {
                path: ["conversationId"],
                equals: query.conversationId,
              },
            },
          ],
        }
      : this.scope(current);
    if (query.conversationId) {
      await this.resolveConversation(query.conversationId, current);
    }
    const rows = await this.prisma.schedule.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const items = rows.sort(compareScheduleOrder).map(serializeSchedule);
    return query.origin ? items.filter((item) => item.origin === query.origin) : items;
  }
  @Post()
  @RequirePermissions("messages.send")
  async save(@Body() dto: SaveScheduleDto, @CurrentUser() current: AuthenticatedUser) {
    if (
      !dto.title.trim() ||
      !dto.identifier.trim() ||
      (!dto.content.trim() && !dto.attachment) ||
      !Number.isFinite(Date.parse(dto.scheduledAt))
    )
      throw new BadRequestException(
        "Informe título, identificador, conteúdo ou anexo e data válidos.",
      );
    const existing = await this.prisma.schedule.findUnique({
      where: { tenantId_id: { tenantId: current.tenantId, id: dto.id } },
    });
    if (
      existing?.connectionId &&
      current.roleKey !== "tenant_admin" &&
      !current.connectionIds?.includes(existing.connectionId)
    )
      throw new NotFoundException("Agendamento não encontrado.");
    if (existing?.executionStatus && existing.executionStatus !== ScheduleExecutionStatus.PENDING) {
      throw new BadRequestException(
        "Este agendamento já iniciou a execução e não pode mais ser alterado.",
      );
    }
    const conversation =
      dto.type === "message" && dto.conversationId
        ? await this.resolveConversation(dto.conversationId, current)
        : null;
    const resolvedConnectionId = conversation
      ? conversation.connectionId
      : dto.connectionId || null;
    if (!conversation && resolvedConnectionId) {
      const connection = await this.prisma.messagingConnection.findFirst({
        where: { id: resolvedConnectionId, tenantId: current.tenantId, archivedAt: null },
      });
      if (
        !connection ||
        (current.roleKey !== "tenant_admin" &&
          !current.connectionIds?.includes(resolvedConnectionId))
      )
        throw new BadRequestException("Instância indisponível para esta organização.");
    }
    if (
      dto.departmentId &&
      !(await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId: current.tenantId, active: true },
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
    if (dto.type === "message" && !dto.recipientIds.length && !dto.conversationId)
      throw new BadRequestException("Selecione um destinatário.");
    const executable =
      dto.type === "message" &&
      !!dto.conversationId &&
      dto.recurrence === "once" &&
      dto.recipientIds.length === 0;
    const dueAt = new Date(dto.scheduledAt);
    if (executable && dueAt.getTime() <= Date.now()) {
      throw new BadRequestException("Escolha uma data e horário futuros para o agendamento.");
    }
    if (executable && dto.content.trim().length > 4000) {
      throw new BadRequestException("A mensagem agendada deve ter no máximo 4000 caracteres.");
    }
    const attachment = normalizeScheduleAttachment(dto.attachment);
    const attachmentType = attachment
      ? resolveMessageType(attachment.mimeType, "")
      : MessageType.TEXT;
    if (
      (attachmentType === MessageType.AUDIO || attachmentType === MessageType.VOICE) &&
      !current.permissions?.includes("messages.send")
    ) {
      throw new ForbiddenException("Sem permissão para agendar mensagens de áudio.");
    }
    const payload = {
      ...dto,
      // A record keeps its creation origin even when another surface edits it.
      origin: existing ? scheduleOrigin(schedulePayload(existing.payload)) : scheduleOrigin(dto),
      scheduledAt: executable ? dueAt.toISOString() : dto.scheduledAt,
      status: executable ? "pending" : dto.status,
      attachment,
      attachmentName: attachment ? attachment.fileName : dto.attachmentName,
      connectionId: resolvedConnectionId ?? "",
    };
    const baseData = {
      connectionId: resolvedConnectionId,
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
    };
    const executionData = executable
      ? {
          dueAt,
          executionStatus: ScheduleExecutionStatus.PENDING,
          claimedAt: null,
          messageId: null,
          attempts: 0,
          lastError: null,
          completedAt: null,
          nextAttemptAt: null,
        }
      : {
          dueAt: null,
          executionStatus: null,
          claimedAt: null,
          messageId: null,
          attempts: 0,
          lastError: null,
          completedAt: null,
          nextAttemptAt: null,
        };
    let saved;
    if (!existing) {
      try {
        saved = await this.prisma.schedule.create({
          data: {
            id: dto.id,
            tenantId: current.tenantId,
            ...baseData,
            ...executionData,
            createdByMembershipId: current.membershipId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("O agendamento foi criado ou alterado em outra sessão.");
        }
        throw error;
      }
    } else {
      const updated = await this.prisma.schedule.updateMany({
        where: {
          tenantId: current.tenantId,
          id: dto.id,
          version: existing.version,
          executionStatus: existing.executionStatus,
        },
        data: {
          ...baseData,
          ...executionData,
          createdByMembershipId: existing.createdByMembershipId ?? current.membershipId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("O agendamento iniciou a execução ou foi alterado.");
      }
      saved = await this.prisma.schedule.findUnique({
        where: { tenantId_id: { tenantId: current.tenantId, id: dto.id } },
      });
      if (!saved) throw new ConflictException("O agendamento não está mais disponível.");
    }
    this.realtime.publish({ tenantId: current.tenantId }, "schedule.updated", {
      scheduleId: saved.id,
    });
    return serializeSchedule(saved);
  }
  @Delete(":id")
  @RequirePermissions("schedules.delete")
  async remove(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<DeletionResult> {
    const preview = await this.deletionImpact(id, current);
    if (dto.snapshotToken !== preview.snapshotToken) return changedDeletion(preview);
    const existing = await this.prisma.schedule.findUnique({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
    });
    if (!existing) throw new NotFoundException("Agendamento não encontrado.");
    if (
      existing.executionStatus === ScheduleExecutionStatus.CLAIMED ||
      existing.executionStatus === ScheduleExecutionStatus.QUEUED
    ) {
      throw new BadRequestException(
        "Este agendamento já está em execução e não pode ser excluído.",
      );
    }
    if (
      existing.connectionId &&
      current.roleKey !== "tenant_admin" &&
      !current.connectionIds?.includes(existing.connectionId)
    ) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    const payload = schedulePayload(existing.payload);
    if (payload.type === "message" && typeof payload.conversationId === "string") {
      await this.resolveConversation(payload.conversationId, current);
    }
    const result = await this.prisma.schedule.deleteMany({
      where: {
        tenantId: current.tenantId,
        id,
        version: existing.version,
        executionStatus: existing.executionStatus,
      },
    });
    if (!result.count) {
      throw new ConflictException("O agendamento iniciou a execução ou foi alterado.");
    }
    this.realtime.publish({ tenantId: current.tenantId }, "schedule.updated", { scheduleId: id });
    return { status: "deleted" };
  }

  @Get(":id/deletion-impact")
  @RequirePermissions("schedules.delete")
  async deletionImpact(
    @Param("id") id: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<DeletionImpactPreview> {
    const existing = await this.prisma.schedule.findUnique({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
    });
    if (!existing) throw new NotFoundException("Agendamento não encontrado.");
    if (
      existing.executionStatus === ScheduleExecutionStatus.CLAIMED ||
      existing.executionStatus === ScheduleExecutionStatus.QUEUED
    ) {
      throw new BadRequestException(
        "Este agendamento já está em execução e não pode ser excluído.",
      );
    }
    if (
      existing.connectionId &&
      current.roleKey !== "tenant_admin" &&
      !current.connectionIds?.includes(existing.connectionId)
    ) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    const payload = schedulePayload(existing.payload);
    if (payload.type === "message" && typeof payload.conversationId === "string") {
      await this.resolveConversation(payload.conversationId, current);
    }
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    const recipientIds = Array.isArray(payload.recipientIds) ? payload.recipientIds : [];
    const recipientCount = new Set([
      ...recipientIds.filter((value): value is string => typeof value === "string"),
      ...recipients.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const recipientId = (value as Record<string, Prisma.JsonValue>).id;
        return typeof recipientId === "string" ? [recipientId] : [];
      }),
    ]).size;
    const hasAttachment = Boolean(payload.attachment || payload.attachmentName);
    const title = typeof payload.title === "string" ? payload.title : "Agendamento";
    const scheduledAt = typeof payload.scheduledAt === "string" ? payload.scheduledAt : null;
    const status = existing.executionStatus ?? payload.status ?? "sem execução automática";
    return {
      snapshotToken: deletionSnapshot({
        id: existing.id,
        version: existing.version,
        executionStatus: existing.executionStatus,
        updatedAt: existing.updatedAt,
        dueAt: existing.dueAt,
        payload: existing.payload,
      }),
      title: "Excluir mensagem agendada?",
      prompt: "Ao excluir, esta mensagem agendada não será enviada.",
      record: {
        name: title,
        identifiers: [
          { label: "Identificador", value: String(payload.identifier ?? existing.id) },
          ...(scheduledAt ? [{ label: "Data programada", value: scheduledAt }] : []),
          { label: "Estado", value: String(status) },
        ],
      },
      dependencies: [
        ...(recipientCount
          ? [
              {
                id: "recipients",
                label: "Destinatários registrados",
                count: recipientCount,
                operation: "delete" as const,
                operationLabel: "Serão removidos com o agendamento",
              },
            ]
          : []),
        ...(hasAttachment
          ? [
              {
                id: "attachment",
                label: "Anexo incorporado",
                count: 1,
                operation: "delete" as const,
                operationLabel: "Será removido com o agendamento",
              },
            ]
          : []),
      ],
      consequences: [
        {
          id: "schedule",
          text: "A mensagem não será enviada e os dados do agendamento serão excluídos.",
          irreversible: true,
        },
      ],
      confirmation: { level: "standard", confirmLabel: "Confirmar" },
    };
  }

  private async resolveConversation(conversationId: string, current: AuthenticatedUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { id: conversationId, tenantId: current.tenantId, archivedAt: null },
          conversationVisibilityWhere(current),
        ],
      },
      select: { id: true, connectionId: true },
    });
    if (!conversation) throw new NotFoundException("Conversa não encontrada.");
    return conversation;
  }
}
@Module({
  imports: [AuthModule, ConfigModule, MessagingModule, RealtimeModule],
  controllers: [SchedulesController],
  providers: [ScheduleExecutorService],
  exports: [ScheduleExecutorService],
})
export class SchedulesModule {}

function schedulePayload(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function scheduleOrigin(payload: { origin?: unknown; conversationId?: unknown }): ScheduleOrigin {
  if (payload.origin === "CHAT" || payload.origin === "SCHEDULES") return payload.origin;
  // Legacy inference only: old records did not retain an explicit creation surface.
  return typeof payload.conversationId === "string" && payload.conversationId.trim()
    ? "CHAT"
    : "SCHEDULES";
}

function compareScheduleOrder(
  left: { id: string; payload: Prisma.JsonValue; createdAt: Date },
  right: { id: string; payload: Prisma.JsonValue; createdAt: Date },
) {
  const scheduledDifference = scheduleTime(left.payload) - scheduleTime(right.payload);
  if (scheduledDifference) return scheduledDifference;
  const createdDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return createdDifference || left.id.localeCompare(right.id);
}

function scheduleTime(value: Prisma.JsonValue) {
  const scheduledAt = schedulePayload(value).scheduledAt;
  const time = typeof scheduledAt === "string" ? Date.parse(scheduledAt) : Number.NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function serializeSchedule(row: {
  id: string;
  payload: Prisma.JsonValue;
  dueAt?: Date | null;
  executionStatus?: ScheduleExecutionStatus | null;
  claimedAt?: Date | null;
  messageId?: string | null;
  attempts?: number;
  lastError?: string | null;
  completedAt?: Date | null;
}) {
  const payload = schedulePayload(row.payload);
  return {
    ...payload,
    id: row.id,
    origin: scheduleOrigin(payload),
    status: row.executionStatus === ScheduleExecutionStatus.SENT ? "completed" : payload.status,
    dueAt: row.dueAt ?? null,
    executionStatus: row.executionStatus ?? null,
    claimedAt: row.claimedAt ?? null,
    messageId: row.messageId ?? null,
    attempts: row.attempts ?? 0,
    lastError: row.lastError ?? null,
    completedAt: row.completedAt ?? null,
  };
}

function normalizeScheduleAttachment(value: QuickReplyAttachmentDto | null | undefined) {
  if (value === undefined || value === null) return value;
  const [metadata, encoded] = value.dataUrl.split(",");
  const size = Buffer.from(encoded ?? "", "base64").byteLength;
  if (metadata !== `data:${value.mimeType};base64` || size !== value.size) {
    throw new BadRequestException("Os dados do anexo agendado são inválidos.");
  }
  validatePolicy(resolveMessageType(value.mimeType, ""), value.mimeType, size);
  return { ...value };
}
