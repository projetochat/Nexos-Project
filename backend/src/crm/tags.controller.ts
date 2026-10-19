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
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequireAnyPermission, RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { Prisma } from "../generated/prisma";
import {
  ConfirmDeletionDto,
  type DeletionImpactPreview,
  deletionSnapshot,
} from "../common/deletion-impact";
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
  @RequireAnyPermission("chat.tags.read", "contacts.update")
  async list(
    @CurrentUser() current: AuthenticatedUser,
    @Query("scope") scope?: "catalog" | "active",
  ) {
    const tags = await this.prisma.tag.findMany({
      where: {
        tenantId: current.tenantId,
        archivedAt: null,
        ...(scope === "catalog" ? {} : { active: true }),
      },
      orderBy: [{ name: "asc" }],
    });
    return tags.map(serializeTag);
  }

  @Post("tags")
  @RequirePermissions("chat.tags.create")
  async create(@Body() dto: CreateTagDto, @CurrentUser() current: AuthenticatedUser) {
    await this.assertTagNameAvailable(dto.name, current.tenantId);
    const archived = await this.prisma.tag.findFirst({
      where: {
        tenantId: current.tenantId,
        archivedAt: { not: null },
        normalizedName: normalizeName(dto.name),
      },
    });
    if (archived) {
      const tag = await this.prisma.tag.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: archived.id } },
        data: {
          name: clean(dto.name),
          normalizedName: normalizeName(dto.name),
          description: cleanOptional(dto.description),
          color: dto.color ?? archived.color,
          active: dto.active ?? true,
          archivedAt: null,
        },
      });
      return serializeTag(tag);
    }
    try {
      const tag = await this.prisma.tag.create({
        data: {
          tenantId: current.tenantId,
          name: clean(dto.name),
          normalizedName: normalizeName(dto.name),
          description: cleanOptional(dto.description),
          color: dto.color ?? "#3B82F6",
          active: dto.active ?? true,
        },
      });
      return serializeTag(tag);
    } catch (error) {
      handleUniqueTag(error, dto.name);
    }
  }

  @Patch("tags/:id")
  @RequirePermissions("chat.tags.update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findTagOrThrow(id, current.tenantId);
    if (dto.name) await this.assertTagNameAvailable(dto.name, current.tenantId, id);
    try {
      const tag = await this.prisma.tag.update({
        where: { tenantId_id: { tenantId: current.tenantId, id } },
        data: {
          name: dto.name ? clean(dto.name) : undefined,
          normalizedName: dto.name ? normalizeName(dto.name) : undefined,
          description: dto.description === undefined ? undefined : cleanOptional(dto.description),
          color: dto.color,
          active: dto.active,
        },
      });
      return serializeTag(tag);
    } catch (error) {
      handleUniqueTag(error, dto.name);
    }
  }

  @Delete("tags/:id")
  @RequirePermissions("chat.tags.delete")
  async archive(
    @Param("id") id: string,
    @Body() dto: ConfirmDeletionDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "tags" WHERE id = ${id} AND "tenantId" = ${current.tenantId} FOR UPDATE`,
      );
      const impact = await this.buildDeletionPreview(id, current.tenantId, tx);
      if (impact.snapshotToken !== dto.snapshotToken) {
        return {
          status: "changed" as const,
          impact,
          message: "Os vínculos da etiqueta mudaram. Revise os dados atualizados.",
        };
      }
      const campaigns = await tx.campaign.findMany({
        where: { tenantId: current.tenantId, audienceTagIds: { has: id } },
        select: { id: true, audienceTagIds: true },
      });
      await tx.contactTag.deleteMany({ where: { tenantId: current.tenantId, tagId: id } });
      for (const campaign of campaigns) {
        await tx.campaign.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: campaign.id } },
          data: { audienceTagIds: campaign.audienceTagIds.filter((tagId) => tagId !== id) },
        });
      }
      await tx.tag.delete({ where: { tenantId_id: { tenantId: current.tenantId, id } } });
      return { status: "deleted" as const };
    });
  }

  @Get("tags/:id/deletion-preview")
  @RequirePermissions("chat.tags.delete")
  deletionPreview(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    return this.buildDeletionPreview(id, current.tenantId);
  }

  private async buildDeletionPreview(
    id: string,
    tenantId: string,
    db: Pick<Prisma.TransactionClient, "tag" | "contactTag" | "campaign"> = this.prisma,
  ): Promise<DeletionImpactPreview> {
    const tag = await db.tag.findFirst({ where: { id, tenantId, archivedAt: null } });
    if (!tag) throw new NotFoundException("Etiqueta não encontrada.");
    const [contactLinks, campaigns] = await Promise.all([
      db.contactTag.findMany({
        where: { tenantId, tagId: id },
        orderBy: { createdAt: "asc" },
        select: { contactId: true, contact: { select: { name: true, phone: true } } },
      }),
      db.campaign.findMany({
        where: { tenantId, audienceTagIds: { has: id } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, updatedAt: true },
      }),
    ]);
    const snapshotToken = deletionSnapshot({
      id: tag.id,
      updatedAt: tag.updatedAt,
      contacts: contactLinks.map((item) => item.contactId),
      campaigns: campaigns.map((item) => [item.id, item.updatedAt]),
    });
    return {
      snapshotToken,
      title: "Excluir Etiqueta?",
      prompt: `Deseja realmente excluir a etiqueta "${tag.name}"?`,
      record: { name: tag.name, identifiers: [] },
      dependencies: [
        {
          id: "contacts",
          label: "Contatos vinculados",
          count: contactLinks.length,
          operation: "unlink",
          operationLabel: "A etiqueta será removida; os contatos serão preservados.",
          items: contactLinks.slice(0, 10).map((item) => ({
            id: item.contactId,
            label: item.contact.name,
            description: item.contact.phone,
          })),
          hasMore: contactLinks.length > 10,
        },
      ],
      consequences: [
        {
          id: "tag",
          text: "Ao excluir esta etiqueta, o vínculo com todos os contatos será removido. Os contatos não serão excluídos.",
          irreversible: true,
        },
      ],
      confirmation: { level: "standard", confirmLabel: "Excluir" },
    };
  }

  @Post("contacts/:id/tags/:tagId")
  @RequirePermissions("contacts.update")
  async assign(
    @Param("id") contactId: string,
    @Param("tagId") tagId: string,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    await this.findContactOrThrow(contactId, current.tenantId);
    await this.findTagOrThrow(tagId, current.tenantId, true);
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
  @RequirePermissions("contacts.update")
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

  private async findTagOrThrow(id: string, tenantId: string, requireActive = false) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, tenantId, archivedAt: null, ...(requireActive ? { active: true } : {}) },
    });
    if (!tag) throw new NotFoundException("Etiqueta não encontrada.");
    return tag;
  }

  private async assertTagNameAvailable(name: string, tenantId: string, ignoreId?: string) {
    const cleanName = clean(name);
    const duplicate = await this.prisma.tag.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        normalizedName: normalizeName(cleanName),
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "TAG_ALREADY_EXISTS",
        message: `Etiqueta "${cleanName}" já existente.`,
      });
    }
  }

  private async findContactOrThrow(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException("Contato não encontrado.");
    return contact;
  }

  private async contactWithTags(id: string, tenantId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: { tags: { include: { tag: true }, where: { tag: { archivedAt: null } } } },
    });
    if (!contact) throw new NotFoundException("Contato não encontrado.");
    return contact;
  }
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cleanOptional(value: string | undefined) {
  return value === undefined ? undefined : clean(value) || null;
}

function normalizeName(value: string) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) throw new BadRequestException("Nome de etiqueta inválido.");
  return normalized;
}

function serializeTag(tag: {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: tag.id,
    nome: tag.name,
    descricao: tag.description,
    cor: tag.color,
    active: tag.active,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

function handleUniqueTag(error: unknown, name?: string): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    const cleanName = name ? clean(name) : "informada";
    throw new ConflictException({
      code: "TAG_ALREADY_EXISTS",
      message: `Etiqueta "${cleanName}" já existente.`,
    });
  }
  throw error;
}
