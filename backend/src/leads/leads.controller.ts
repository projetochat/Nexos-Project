import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ConversationStatus, LeadStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";

class ListLeadsQueryDto {
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
  @IsIn(["NEW", "QUEUED", "ASSIGNED", "CONVERTED", "DISCARDED"])
  status?: LeadStatus;
}

class AssignLeadDto {
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @IsOptional()
  @IsBoolean()
  self?: boolean;
}

const leadInclude = {
  contact: { include: { customer: true } },
  department: true,
  conversation: true,
  assignedMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.LeadInclude;

@Controller("leads")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  @Get()
  @RequirePermissions("chat.leads.read")
  async list(@Query() query: ListLeadsQueryDto, @CurrentUser() current: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.LeadWhereInput = {
      tenantId: current.tenantId,
      ...(query.status ? { status: query.status } : { status: { not: LeadStatus.DISCARDED } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items: items.map(serializeLead),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  @Patch(":id/assign")
  @RequirePermissions("leads.manage")
  async assign(
    @Param("id") id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    const membershipId = dto.self ? current.membershipId : dto.membershipId;
    if (!membershipId) throw new BadRequestException("Informe o atendente do lead.");

    const updated = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, tenantId: current.tenantId, status: { not: LeadStatus.DISCARDED } },
        include: { conversation: true },
      });
      if (!lead) throw new BadRequestException("Lead inexistente para este tenant.");

      const target = await tx.tenantMembership.findFirst({
        where: {
          id: membershipId,
          tenantId: current.tenantId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      });
      if (!target) throw new BadRequestException("Atendente inexistente ou inativo.");

      const protocol =
        lead.conversation.protocol ?? (await nextConversationProtocol(tx, current.tenantId));
      await tx.conversation.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: lead.conversationId } },
        data: {
          assignedMembershipId: membershipId,
          status: ConversationStatus.EM_ANDAMENTO,
          protocol,
        },
      });
      return tx.lead.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: lead.id } },
        data: {
          assignedMembershipId: membershipId,
          status: LeadStatus.ASSIGNED,
        },
        include: leadInclude,
      });
    });
    this.realtime.publishLeadUpdated({
      tenantId: current.tenantId,
      leadId: updated.id,
      conversationId: updated.conversationId,
    });
    this.realtime.publishAssignmentUpdated({
      tenantId: current.tenantId,
      conversationId: updated.conversationId,
      previousMembershipId: null,
      membershipId: updated.assignedMembershipId,
      departmentId: updated.departmentId,
      updatedAt: updated.updatedAt,
    });
    return serializeLead(updated);
  }
}

async function nextConversationProtocol(tx: Prisma.TransactionClient, tenantId: string) {
  const counter = await tx.conversationProtocolCounter.upsert({
    where: { tenantId },
    update: { lastNumber: { increment: 1 } },
    create: { tenantId, lastNumber: 1 },
  });
  return String(counter.lastNumber).padStart(6, "0");
}

function serializeLead(lead: Prisma.LeadGetPayload<{ include: typeof leadInclude }>) {
  return {
    id: lead.id,
    tenantId: lead.tenantId,
    status: lead.status.toLowerCase(),
    source: lead.source.toLowerCase(),
    firstMessagePreview: lead.firstMessagePreview,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    contact: {
      id: lead.contact.id,
      nome: lead.contact.name,
      telefone: lead.contact.phone,
      customer: lead.contact.customer
        ? { id: lead.contact.customer.id, nome: lead.contact.customer.name }
        : null,
    },
    conversation: {
      id: lead.conversation.id,
      protocolo: lead.conversation.protocol,
      status: lead.conversation.status.toLowerCase(),
    },
    department: lead.department
      ? { id: lead.department.id, nome: lead.department.name, cor: lead.department.color }
      : null,
    assignee: lead.assignedMembership
      ? {
          membershipId: lead.assignedMembership.id,
          id: lead.assignedMembership.user.id,
          nome: lead.assignedMembership.user.name,
          email: lead.assignedMembership.user.email,
        }
      : null,
  };
}
