import { Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { NotificationStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("notifications.read")
  async list(@Query() query: ListNotificationsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.NotificationWhereInput = {
      tenantId: current.tenantId,
      membershipId: current.membershipId,
      ...(query.status ? { status: query.status } : {}),
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
        where: { tenantId: current.tenantId, membershipId: current.membershipId, status: "UNREAD" },
      }),
    ]);
    return {
      items: items.map(serializeNotification),
      unread,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  @Patch(":id/read")
  @RequirePermissions("notifications.read")
  async markRead(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.prisma.notification.updateMany({
      where: {
        id,
        tenantId: current.tenantId,
        membershipId: current.membershipId,
        status: "UNREAD",
      },
      data: { status: "READ", readAt: new Date() },
    });
    return { ok: true };
  }

  @Post("read-all")
  @RequirePermissions("notifications.read")
  async markAllRead(@CurrentUser() current: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId: current.tenantId, membershipId: current.membershipId, status: "UNREAD" },
      data: { status: "READ", readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }
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
