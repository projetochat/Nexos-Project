import {
  BadRequestException,
  Body,
  ConflictException,
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
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  @Get("tags")
  @RequirePermissions("crm.read")
  async list(@CurrentUser() current: AuthenticatedUser) {
    const tags = await this.prisma.tag.findMany({
      where: { tenantId: current.tenantId, archivedAt: null },
      orderBy: [{ name: "asc" }],
    });
    return tags.map(serializeTag);
  }

  @Post("tags")
  @RequirePermissions("chat.tags.manage")
  async create(@Body() dto: CreateTagDto, @CurrentUser() current: AuthenticatedUser) {
    try {
      const tag = await this.prisma.tag.create({
        data: {
          tenantId: current.tenantId,
          name: clean(dto.name),
          normalizedName: normalizeName(dto.name),
          color: dto.color ?? "#6366f1",
        },
      });
      return serializeTag(tag);
    } catch (error) {
      handleUniqueTag(error);
    }
  }

  @Patch("tags/:id")
  @RequirePermissions("chat.tags.manage")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findTagOrThrow(id, current.tenantId);
    try {
      const tag = await this.prisma.tag.update({
        where: { tenantId_id: { tenantId: current.tenantId, id } },
        data: {
          name: dto.name ? clean(dto.name) : undefined,
          normalizedName: dto.name ? normalizeName(dto.name) : undefined,
          color: dto.color,
        },
      });
      return serializeTag(tag);
    } catch (error) {
      handleUniqueTag(error);
    }
  }

  @Delete("tags/:id")
  @RequirePermissions("chat.tags.manage")
  async archive(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    await this.findTagOrThrow(id, current.tenantId);
    const tag = await this.prisma.tag.update({
      where: { tenantId_id: { tenantId: current.tenantId, id } },
      data: { archivedAt: new Date() },
    });
    return serializeTag(tag);
  }

  @Post("contacts/:id/tags/:tagId")
  @RequirePermissions("chat.tags.use")
  async assign(
    @Param("id") contactId: string,
    @Param("tagId") tagId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactOrThrow(contactId, current.tenantId);
    await this.findTagOrThrow(tagId, current.tenantId);
    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      update: {},
      create: { tenantId: current.tenantId, contactId, tagId },
    });
    const contact = await this.contactWithTags(contactId, current.tenantId);
    this.realtime.publishContactTagsUpdated({
      tenantId: current.tenantId,
      contactId,
      tags: contact.tags.map((item) => serializeTag(item.tag)),
    });
    return contact.tags.map((item) => serializeTag(item.tag));
  }

  @Delete("contacts/:id/tags/:tagId")
  @RequirePermissions("chat.tags.use")
  async remove(
    @Param("id") contactId: string,
    @Param("tagId") tagId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactOrThrow(contactId, current.tenantId);
    await this.prisma.contactTag.deleteMany({
      where: { tenantId: current.tenantId, contactId, tagId },
    });
    const contact = await this.contactWithTags(contactId, current.tenantId);
    this.realtime.publishContactTagsUpdated({
      tenantId: current.tenantId,
      contactId,
      tags: contact.tags.map((item) => serializeTag(item.tag)),
    });
    return contact.tags.map((item) => serializeTag(item.tag));
  }

  private async findTagOrThrow(id: string, tenantId: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, tenantId, archivedAt: null } });
    if (!tag) throw new NotFoundException("Etiqueta nao encontrada.");
    return tag;
  }

  private async findContactOrThrow(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException("Contato nao encontrado.");
    return contact;
  }

  private async contactWithTags(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: { tags: { include: { tag: true }, where: { tag: { archivedAt: null } } } },
    });
    if (!contact) throw new NotFoundException("Contato nao encontrado.");
    return contact;
  }
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeName(value: string) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) throw new BadRequestException("Nome de etiqueta invalido.");
  return normalized;
}

function serializeTag(tag: { id: string; name: string; color: string }) {
  return { id: tag.id, nome: tag.name, cor: tag.color };
}

function handleUniqueTag(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new ConflictException({
      code: "TAG_ALREADY_EXISTS",
      message: "Já existe uma etiqueta com este nome.",
    });
  }
  throw error;
}

