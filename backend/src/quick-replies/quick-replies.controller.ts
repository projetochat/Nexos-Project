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
import { QuickReplyMessageDto } from "./dto/quick-reply-message.dto";
import {
  resolveMessageType,
  validatePolicy,
} from "../messaging/media/messaging-media-storage.service";

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
    const messages = normalizeMessages(dto.messages);
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
          messages,
          intervalSeconds: dto.intervalSeconds ?? 0,
          attachmentFileName: dto.attachmentFileName ?? null,
          attachmentMimeType: dto.attachmentMimeType ?? null,
          attachmentSize: dto.attachmentSize ?? null,
          attachmentDataUrl: dto.attachmentDataUrl ?? null,
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
    const messages = normalizeMessages(dto.messages);
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
          messages,
          intervalSeconds: dto.intervalSeconds,
          attachmentFileName: dto.attachmentFileName,
          attachmentMimeType: dto.attachmentMimeType,
          attachmentSize: dto.attachmentSize,
          attachmentDataUrl: dto.attachmentDataUrl,
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
    if (query.scope === "catalog" && current.permissions?.includes("chat.quick_replies.manage")) {
      return where;
    }
    const allowed = await this.allowedDepartmentIds(current);
    if (query.departmentId) {
      if (current.roleKey !== "tenant_admin" && !allowed.includes(query.departmentId)) {
        throw new ForbiddenException("Departamento fora do escopo operacional do usuário.");
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
        throw new ForbiddenException("Departamento fora do escopo operacional do usuário.");
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
    if (!reply) throw new NotFoundException("Resposta rápida não encontrada.");
    return reply;
  }

  private async ensureShortcutAvailable(
    tenantId: string,
    _departmentId: string | null,
    normalizedShortcut: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.quickReply.findFirst({
      where: {
        tenantId,
        normalizedShortcut,
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "QUICK_REPLY_SHORTCUT_ALREADY_EXISTS",
        message: "Já existe uma resposta rápida com este atalho neste escopo.",
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
    messages: reply.messages,
    intervalSeconds: reply.intervalSeconds,
    attachmentFileName: reply.attachmentFileName,
    attachmentMimeType: reply.attachmentMimeType,
    attachmentSize: reply.attachmentSize,
    attachmentDataUrl: reply.attachmentDataUrl,
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

export function normalizeMessages(messages?: QuickReplyMessageDto[]) {
  if (messages === undefined) return undefined;
  if (!Array.isArray(messages) || messages.length < 1) {
    throw new BadRequestException("Cadastre ao menos uma mensagem.");
  }
  if (messages.length > 10) {
    throw new BadRequestException("Número máximo de mensagens atingido");
  }
  if (messages.some((message) => !message.text.trim() && !message.attachment)) {
    throw new BadRequestException("Cada mensagem precisa de texto ou arquivo.");
  }
  for (const message of messages) {
    const attachment = message.attachment;
    if (!attachment) continue;
    const [metadata, encoded] = attachment.dataUrl.split(",");
    const size = Buffer.from(encoded ?? "", "base64").byteLength;
    if (
      metadata !== `data:${attachment.mimeType};base64` ||
      size !== attachment.size ||
      size > 10 * 1024 * 1024
    ) {
      throw new BadRequestException("Os dados do arquivo são inválidos ou excedem 10 MB.");
    }
    validatePolicy(resolveMessageType(attachment.mimeType, ""), attachment.mimeType, size);
  }
  if (
    messages.reduce((total, message) => total + (message.attachment?.dataUrl.length ?? 0), 0) >
    40 * 1024 * 1024
  ) {
    throw new BadRequestException("Os anexos da sequência excedem o limite de 30 MB.");
  }
  return messages.map((message) => ({
    text: message.text.trim(),
    attachment: message.attachment ? { ...message.attachment } : null,
  }));
}

function normalizeShortcut(value: string) {
  const shortcut = clean(value).toLocaleLowerCase("pt-BR");
  if (!/^[\p{L}-]+$/u.test(shortcut)) {
    throw new BadRequestException("O atalho deve conter somente letras e hífen.");
  }
  return shortcut;
}

function normalizeShortcutDisplay(value: string) {
  return `/${normalizeShortcut(value)}`;
}

function handleUniqueShortcut(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new ConflictException({
      code: "QUICK_REPLY_SHORTCUT_ALREADY_EXISTS",
      message: "Já existe uma resposta rápida com este atalho neste escopo.",
    });
  }
  throw error;
}
