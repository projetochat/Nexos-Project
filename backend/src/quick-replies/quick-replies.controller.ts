import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQuickReplyDto } from "./dto/create-quick-reply.dto";
import { ListQuickRepliesQueryDto } from "./dto/list-quick-replies-query.dto";
import { UpdateQuickReplyDto } from "./dto/update-quick-reply.dto";

@Controller("quick-replies")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuickRepliesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("chat.quick_replies.read")
  async list(@Query() query: ListQuickRepliesQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const where = await this.visibleWhere(current, query);
    const replies = await this.prisma.quickReply.findMany({
      where,
      orderBy: [{ shortcut: "asc" }, { title: "asc" }],
      include: quickReplyInclude,
    });
    return replies.map(serializeQuickReply);
  }

  @Post()
  @RequirePermissions("chat.quick_replies.manage")
  async create(@Body() dto: CreateQuickReplyDto, @CurrentUser() current: AuthenticatedUser) {
    const departmentId = await this.resolveDepartmentId(dto.departmentId ?? null, current);
    const normalizedShortcut = normalizeShortcut(dto.shortcut);
    await this.ensureShortcutAvailable(current.tenantId, departmentId, normalizedShortcut);
    try {
      const reply = await this.prisma.quickReply.create({
        data: {
          tenantId: current.tenantId,
          title: clean(dto.title),
          shortcut: normalizeShortcutDisplay(dto.shortcut),
          normalizedShortcut,
          content: dto.content.trim(),
          closeOnSend: dto.closeOnSend ?? false,
          departmentId,
          createdByMembershipId: current.membershipId,
        },
        include: quickReplyInclude,
      });
      return serializeQuickReply(reply);
    } catch (error) {
      handleUniqueShortcut(error);
    }
  }

  @Patch(":id")
  @RequirePermissions("chat.quick_replies.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateQuickReplyDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const existing = await this.findOrThrow(id, current.tenantId);
    const departmentId =
      dto.departmentId === undefined
        ? undefined
        : await this.resolveDepartmentId(dto.departmentId ?? null, current);
    const nextDepartmentId = departmentId === undefined ? existing.departmentId : departmentId;
    const normalizedShortcut = dto.shortcut
      ? normalizeShortcut(dto.shortcut)
      : existing.normalizedShortcut;
    await this.ensureShortcutAvailable(
      current.tenantId,
      nextDepartmentId,
      normalizedShortcut,
      existing.id,
    );
    try {
      const reply = await this.prisma.quickReply.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: {
          title: dto.title ? clean(dto.title) : undefined,
          shortcut: dto.shortcut ? normalizeShortcutDisplay(dto.shortcut) : undefined,
          normalizedShortcut: dto.shortcut ? normalizedShortcut : undefined,
          content: dto.content?.trim(),
          closeOnSend: dto.closeOnSend,
          departmentId,
        },
        include: quickReplyInclude,
      });
      return serializeQuickReply(reply);
    } catch (error) {
      handleUniqueShortcut(error);
    }
  }

  @Delete(":id")
  @RequirePermissions("chat.quick_replies.manage")
  async archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const existing = await this.findOrThrow(id, current.tenantId);
    const reply = await this.prisma.quickReply.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
      data: { archivedAt: new Date() },
      include: quickReplyInclude,
    });
    return serializeQuickReply(reply);
  }

  private async visibleWhere(
    current: AuthenticatedUser,
    query: ListQuickRepliesQueryDto,
  ): Promise<Prisma.QuickReplyWhereInput> {
    const status = query.status ?? "active";
    const q = query.q?.trim();
    const where: Prisma.QuickReplyWhereInput = {
      tenantId: current.tenantId,
      ...(status === "active" ? { archivedAt: null } : {}),
      ...(status === "archived" ? { archivedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { shortcut: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const allowed = await this.allowedDepartmentIds(current);
    if (query.departmentId) {
      if (current.roleKey !== "tenant_admin" && !allowed.includes(query.departmentId)) {
        throw new ForbiddenException("Departamento fora do escopo operacional do usuario.");
      }
      return { ...where, OR: [{ departmentId: null }, { departmentId: query.departmentId }] };
    }
    if (current.roleKey === "tenant_admin") return where;
    return { ...where, OR: [{ departmentId: null }, { departmentId: { in: allowed } }] };
  }

  private async resolveDepartmentId(departmentId: string | null, current: AuthenticatedUser) {
    if (!departmentId) return null;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, tenantId: current.tenantId, active: true },
    });
    if (!department) throw new BadRequestException("Departamento inexistente para este tenant.");
    if (current.roleKey !== "tenant_admin") {
      const allowed = await this.allowedDepartmentIds(current);
      if (!allowed.includes(departmentId)) {
        throw new ForbiddenException("Departamento fora do escopo operacional do usuario.");
      }
    }
    return departmentId;
  }

  private async allowedDepartmentIds(current: AuthenticatedUser) {
    const memberships = await this.prisma.departmentMembership.findMany({
      where: { tenantId: current.tenantId, membershipId: current.membershipId },
      select: { departmentId: true },
    });
    return memberships.map((item) => item.departmentId);
  }

  private async findOrThrow(id: string, tenantId: string) {
    const reply = await this.prisma.quickReply.findFirst({
      where: { id, tenantId, archivedAt: null },
    });
    if (!reply) throw new NotFoundException("Resposta rapida nao encontrada.");
    return reply;
  }

  private async ensureShortcutAvailable(
    tenantId: string,
    departmentId: string | null,
    normalizedShortcut: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.quickReply.findFirst({
      where: {
        tenantId,
        departmentId,
        normalizedShortcut,
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "QUICK_REPLY_SHORTCUT_ALREADY_EXISTS",
        message: "Ja existe uma resposta rapida com este atalho neste escopo.",
      });
    }
  }
}

const quickReplyInclude = {
  department: { select: { id: true, name: true, color: true } },
} satisfies Prisma.QuickReplyInclude;

type QuickReplyWithRelations = Prisma.QuickReplyGetPayload<{ include: typeof quickReplyInclude }>;

function serializeQuickReply(reply: QuickReplyWithRelations) {
  return {
    id: reply.id,
    tenantId: reply.tenantId,
    title: reply.title,
    atalho: reply.shortcut,
    shortcut: reply.shortcut,
    texto: reply.content,
    content: reply.content,
    departmentId: reply.departmentId,
    department: reply.department
      ? { id: reply.department.id, nome: reply.department.name, cor: reply.department.color }
      : null,
    archivedAt: reply.archivedAt,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
    close_on_send: reply.closeOnSend,
    closeOnSend: reply.closeOnSend,
  };
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeShortcut(value: string) {
  const shortcut = normalizeShortcutDisplay(value).toLowerCase();
  if (!shortcut) throw new BadRequestException("Atalho invalido.");
  return shortcut;
}

function normalizeShortcutDisplay(value: string) {
  const trimmed = clean(value);
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function handleUniqueShortcut(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new ConflictException({
      code: "QUICK_REPLY_SHORTCUT_ALREADY_EXISTS",
      message: "Ja existe uma resposta rapida com este atalho neste escopo.",
    });
  }
  throw error;
}
