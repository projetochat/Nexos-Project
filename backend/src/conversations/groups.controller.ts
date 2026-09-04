import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsOptional, IsString, IsUUID, Length } from "class-validator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import {
  ConversationStatus,
  ConversationType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
} from "../generated/prisma";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { PrismaService } from "../prisma/prisma.service";
import { GroupsSyncService } from "./groups-sync.service";

class ListGroupsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

class CreateGroupDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUUID()
  connectionId!: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  participantContactIds!: string[];
}

class SyncGroupsDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string;
}

const groupInclude = {
  contact: true,
  connection: true,
  participants: {
    orderBy: [{ isSuperAdmin: "desc" }, { isAdmin: "desc" }, { displayName: "asc" }],
  },
} satisfies Prisma.ConversationInclude;

type GroupConversation = Prisma.ConversationGetPayload<{ include: typeof groupInclude }>;
const EMPTY_GROUP_FILTER_VALUE = "__empty__";
const visibleGroupConnectionWhere: Prisma.ConversationWhereInput = {
  OR: [{ connectionId: null }, { connection: { archivedAt: null } }],
};

@Controller("groups")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GroupsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
    @Inject(GroupsSyncService) private readonly groupsSync: GroupsSyncService,
  ) {}

  @Get()
  @RequirePermissions("conversations.read")
  async list(@Query() query: ListGroupsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const { page, pageSize, skip } = pagination(query);
    const q = query.q?.trim();
    const qDigits = q?.replace(/\D/g, "") ?? "";
    const filterWithoutConnection = query.connectionId === EMPTY_GROUP_FILTER_VALUE;
    const filters: Prisma.ConversationWhereInput[] = [visibleGroupConnectionWhere];
    if (q) {
      filters.push({
        OR: [
          { groupName: { contains: q, mode: "insensitive" } },
          { externalChatId: { contains: q, mode: "insensitive" } },
          { contact: { name: { contains: q, mode: "insensitive" } } },
          { participants: { some: { displayName: { contains: q, mode: "insensitive" } } } },
          ...(qDigits ? [{ participants: { some: { phone: { contains: qDigits } } } }] : []),
        ],
      });
    }
    const where: Prisma.ConversationWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      conversationType: ConversationType.GROUP,
      AND: filters,
      ...(filterWithoutConnection
        ? { connectionId: null }
        : query.connectionId
          ? { connectionId: query.connectionId }
          : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ groupName: "asc" }, { createdAt: "desc" }],
        include: groupInclude,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return paginated(
      items.map((item) => serializeGroup(item)),
      total,
      page,
      pageSize,
    );
  }

  @Get(":id")
  @RequirePermissions("conversations.read")
  async detail(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const group = await this.prisma.conversation.findFirst({
      where: {
        id,
        tenantId: current.tenantId,
        archivedAt: null,
        conversationType: ConversationType.GROUP,
        ...visibleGroupConnectionWhere,
      },
      include: groupInclude,
    });
    if (!group) throw new NotFoundException("Grupo nao encontrado.");
    return serializeGroup(group);
  }

  @Post()
  @RequirePermissions("conversations.manage")
  async create(@Body() dto: CreateGroupDto, @CurrentUser() current: AuthenticatedUser) {
    if (dto.participantContactIds.length < 1) {
      throw new BadRequestException("Selecione ao menos um participante.");
    }
    const connection = await this.prisma.messagingConnection.findFirst({
      where: {
        id: dto.connectionId,
        tenantId: current.tenantId,
        archivedAt: null,
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
      },
    });
    if (!connection?.externalReference) {
      throw new BadRequestException("Selecione uma instancia WhatsApp conectada.");
    }

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId: current.tenantId,
        id: { in: dto.participantContactIds },
        archivedAt: null,
        NOT: { normalizedPhone: { startsWith: "group:" } },
      },
      select: { id: true, name: true, phone: true, normalizedPhone: true },
    });
    if (!contacts.length) throw new BadRequestException("Nenhum participante valido encontrado.");

    const result = await this.evolution.createGroup({
      instanceName: connection.externalReference,
      subject: dto.name.trim(),
      participants: contacts.map((contact) =>
        providerNumber(contact.normalizedPhone || contact.phone),
      ),
    });
    const groupJid = result.groupJid;
    if (!groupJid)
      throw new BadRequestException("Evolution nao retornou o identificador do grupo.");

    const group = await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.upsert({
        where: {
          tenantId_normalizedPhone: {
            tenantId: current.tenantId,
            normalizedPhone: `group:${groupJid}`,
          },
        },
        update: {
          name: dto.name.trim(),
          phone: groupJid,
          instance: connection.externalReference,
          archivedAt: null,
        },
        create: {
          tenantId: current.tenantId,
          name: dto.name.trim(),
          phone: groupJid,
          normalizedPhone: `group:${groupJid}`,
          instance: connection.externalReference,
        },
      });

      const existingConversation = await tx.conversation.findFirst({
        where: {
          tenantId: current.tenantId,
          connectionId: connection.id,
          externalChatId: groupJid,
          conversationType: ConversationType.GROUP,
        },
      });
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: { tenantId_id: { tenantId: current.tenantId, id: existingConversation.id } },
            data: {
              contactId: contact.id,
              groupName: dto.name.trim(),
              isGroup: true,
              conversationType: ConversationType.GROUP,
              archivedAt: null,
            },
            include: groupInclude,
          })
        : await tx.conversation.create({
            data: {
              tenantId: current.tenantId,
              contactId: contact.id,
              connectionId: connection.id,
              status: ConversationStatus.ABERTA,
              isGroup: true,
              conversationType: ConversationType.GROUP,
              externalChatId: groupJid,
              externalGroupId: groupJid,
              groupName: dto.name.trim(),
            },
            include: groupInclude,
          });

      for (const participant of contacts) {
        await tx.conversationParticipant.upsert({
          where: {
            tenantId_conversationId_externalParticipantId: {
              tenantId: current.tenantId,
              conversationId: conversation.id,
              externalParticipantId: providerNumber(
                participant.normalizedPhone || participant.phone,
              ),
            },
          },
          update: {
            phone: providerNumber(participant.normalizedPhone || participant.phone),
            displayName: participant.name,
            active: true,
            lastSeenAt: new Date(),
          },
          create: {
            tenantId: current.tenantId,
            conversationId: conversation.id,
            externalParticipantId: providerNumber(participant.normalizedPhone || participant.phone),
            phone: providerNumber(participant.normalizedPhone || participant.phone),
            displayName: participant.name,
          },
        });
      }

      return tx.conversation.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: current.tenantId, id: conversation.id } },
        include: groupInclude,
      });
    });

    return serializeGroup(group);
  }

  @Post("sync")
  @RequirePermissions("conversations.manage")
  async sync(@Body() dto: SyncGroupsDto | undefined, @CurrentUser() current: AuthenticatedUser) {
    return this.groupsSync.sync({ tenantId: current.tenantId, connectionId: dto?.connectionId });
  }
}

function serializeGroup(group: GroupConversation) {
  const name = group.groupName || group.contact.name || "Grupo WhatsApp";
  return {
    id: group.id,
    tenantId: group.tenantId,
    conversationId: group.id,
    name,
    externalChatId: group.externalChatId,
    imageUrl: group.groupImageUrl || group.contact.avatarUrl,
    createdAt: groupCreatedAt(group),
    participantsCount: group.participants.filter((participant) => participant.active).length,
    connection: group.connection
      ? {
          id: group.connection.id,
          name: group.connection.name,
          externalReference: group.connection.externalReference,
          status: group.connection.status,
        }
      : null,
    participants: group.participants.map((participant) => ({
      id: participant.id,
      name: participant.displayName || participant.phone || participant.externalParticipantId,
      phone: participant.phone,
      externalParticipantId: participant.externalParticipantId,
      isAdmin: participant.isAdmin,
      isSuperAdmin: participant.isSuperAdmin,
      active: participant.active,
      lastSeenAt: participant.lastSeenAt,
    })),
    lastMessagePreview: group.lastMessagePreview,
    lastMessageAt: group.lastMessageAt,
  };
}

function groupCreatedAt(group: GroupConversation) {
  const createdAt = metadataDate(group.groupMetadataJson, "createdAt");
  return createdAt ?? group.createdAt;
}

function metadataDate(value: Prisma.JsonValue | null, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value[key];
  if (typeof raw !== "string" || !raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pagination(query: { page?: string; pageSize?: string }) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function providerNumber(value: string) {
  return value.endsWith("@s.whatsapp.net") ? value : onlyDigits(value);
}
