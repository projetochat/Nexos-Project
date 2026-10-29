import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ConversationStatus, NotificationStatus, Prisma } from "../generated/prisma";
import { TasksService } from "../tasks/tasks.service";
import { PrismaService } from "../prisma/prisma.service";
import { conversationVisibilityWhere } from "../conversations/conversation-visibility";

class ListNotificationsQueryDto {
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
  @IsIn(["UNREAD", "READ", "ARCHIVED"])
  status?: NotificationStatus;
}

@Controller("notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(TasksService) private readonly tasks?: TasksService,
  ) {}

  @Get()
  async list(@Query() query: ListNotificationsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const page = integerQueryValue(query.page, 1, 1);
    const pageSize = integerQueryValue(query.pageSize, 25, 1, 100);
    const access = await this.notificationAccess(current);
    const where: Prisma.NotificationWhereInput = {
      tenantId: current.tenantId,
      membershipId: current.membershipId,
      ...(query.status ? { status: query.status } : {}),
      ...access,
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...where, status: "UNREAD" },
      }),
    ]);
    const taskDetails =
      this.tasks?.enabled() && current.permissions?.includes("schedules.read")
        ? await this.tasks.notificationDetails(
            items
              .filter((item) => item.entityType === "task" && item.entityId)
              .map((item) => item.entityId!),
            current,
          )
        : {};
    return {
      items: items.map((item) => ({
        ...serializeNotification(item),
        ...(item.entityType === "task" && item.entityId && taskDetails[item.entityId]
          ? { priority: taskDetails[item.entityId].priority }
          : {}),
      })),
      unread,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  @Patch(":id/read")
  async markRead(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const access = await this.notificationAccess(current);
    await this.prisma.notification.updateMany({
      where: {
        id,
        tenantId: current.tenantId,
        membershipId: current.membershipId,
        status: "UNREAD",
        ...access,
      },
      data: { status: "READ", readAt: new Date() },
    });
    return { ok: true };
  }

  @Get(":id/target")
  async target(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId: current.tenantId, membershipId: current.membershipId },
      select: { entityType: true, entityId: true },
    });
    if (!notification?.entityId)
      throw new NotFoundException("Destino da notificação indisponível.");

    if (notification.entityType === "task") {
      if (!this.tasks?.enabled() || !current.permissions?.includes("schedules.read"))
        throw new NotFoundException("Destino da notificação indisponível.");
      const task = await this.tasks.getTask(notification.entityId, current);
      return { destination: "tasks" as const, taskId: task.id };
    }

    const conversationId =
      notification.entityType === "conversation"
        ? notification.entityId
        : notification.entityType === "lead"
          ? (
              await this.prisma.lead.findFirst({
                where: { id: notification.entityId, tenantId: current.tenantId },
                select: { conversationId: true },
              })
            )?.conversationId
          : null;
    if (!conversationId) throw new NotFoundException("Destino da notificação indisponível.");

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { id: conversationId, tenantId: current.tenantId, archivedAt: null },
          conversationVisibilityWhere(current),
        ],
      },
      select: { id: true, status: true },
    });
    if (!conversation) throw new NotFoundException("Conversa não disponível para este atendente.");

    return {
      conversationId: conversation.id,
      destination: conversation.status === ConversationStatus.FECHADA ? "history" : "inbox",
    };
  }

  @Post("read-all")
  async markAllRead(@CurrentUser() current: AuthenticatedUser) {
    const access = await this.notificationAccess(current);
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId: current.tenantId,
        membershipId: current.membershipId,
        status: "UNREAD",
        ...access,
      },
      data: { status: "READ", readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }

  private async notificationAccess(
    current: AuthenticatedUser,
  ): Promise<Prisma.NotificationWhereInput> {
    const taskIds: string[] = [];
    if (this.tasks?.enabled() && current.permissions?.includes("schedules.read")) {
      const candidates = await this.prisma.notification.findMany({
        where: {
          tenantId: current.tenantId,
          membershipId: current.membershipId,
          entityType: "task",
        },
        select: { entityId: true },
        distinct: ["entityId"],
      });
      const candidatesIds = candidates.flatMap((item) => (item.entityId ? [item.entityId] : []));
      for (let offset = 0; offset < candidatesIds.length; offset += 100) {
        taskIds.push(
          ...Object.keys(
            await this.tasks.notificationDetails(
              candidatesIds.slice(offset, offset + 100),
              current,
            ),
          ),
        );
      }
    }
    const taskAccess: Prisma.NotificationWhereInput = {
      entityType: "task",
      entityId: { in: taskIds },
    };
    if (current.roleKey === "tenant_admin")
      return { OR: [{ entityType: null }, { entityType: { not: "task" } }, taskAccess] };
    const conversations = await this.prisma.conversation.findMany({
      where: {
        AND: [
          { tenantId: current.tenantId, archivedAt: null },
          conversationVisibilityWhere(current),
        ],
      },
      select: { id: true },
    });
    const conversationIds = conversations.map((conversation) => conversation.id);
    const leads = await this.prisma.lead.findMany({
      where: { tenantId: current.tenantId, conversationId: { in: conversationIds } },
      select: { id: true },
    });
    return {
      OR: [
        { entityType: "conversation", entityId: { in: conversationIds } },
        { entityType: "lead", entityId: { in: leads.map((lead) => lead.id) } },
        { OR: [{ entityType: null }, { entityType: { notIn: ["conversation", "lead", "task"] } }] },
        taskAccess,
      ],
    };
  }
}

function integerQueryValue(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max?: number,
) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const boundedMin = Math.max(min, parsed);
  return max === undefined ? boundedMin : Math.min(max, boundedMin);
}

function serializeNotification(notification: {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: notification.id,
    kind: notification.kind.toLowerCase(),
    status: notification.status.toLowerCase(),
    title: notification.title,
    body: notification.body,
    entityType: notification.entityType,
    entityId: notification.entityId,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
  };
}
