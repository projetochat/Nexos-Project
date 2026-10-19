import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  changedDeletion,
  deletionSnapshot,
  type DeletionImpactPreview,
} from "../common/deletion-impact";
import {
  Prisma,
  TicketAttachmentStatus,
  TicketApprovalKind,
  TicketApprovalStatus,
  TicketCategory,
  TicketDialogType,
  TicketPriority,
  TicketStatus,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { TransactionalEmailService } from "../email/transactional-email.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AttachmentSecurityScanner } from "./attachment-security-scanner";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketCommentDto } from "./dto/update-ticket-comment.dto";
import {
  DecideTicketApprovalDto,
  RequestTicketApprovalDto,
  TicketResponseDto,
  TransferTicketDto,
  ValidateTicketSolutionDto,
} from "./dto/ticket-workflow.dto";
import { FileStorageProvider } from "./storage/file-storage.provider";
import {
  TICKET_ATTACHMENT_CLEANUP_REQUESTED,
  TicketAttachmentCleanupService,
} from "./ticket-attachment-cleanup.service";
import {
  htmlToText,
  sanitizeFileName,
  sanitizePlainText,
  sanitizeTicketHtml,
} from "./ticket-sanitizer";

const transitions: Record<TicketStatus, TicketStatus[]> = {
  ABERTO: ["EM_ANDAMENTO", "CANCELADO"],
  EM_ANDAMENTO: ["AGUARDANDO", "RESOLVIDO", "CANCELADO"],
  AGUARDANDO: ["EM_ANDAMENTO", "RESOLVIDO", "CANCELADO"],
  RESOLVIDO: ["FECHADO", "ABERTO"],
  FECHADO: ["ABERTO"],
  CANCELADO: ["ABERTO"],
  NOVO: ["AGUARDANDO_APROVACAO", "NA_FILA", "EM_EXECUCAO", "CANCELADO"],
  AGUARDANDO_APROVACAO: ["NOVO", "NA_FILA", "EM_EXECUCAO", "REPROVADO", "CANCELADO"],
  NA_FILA: ["EM_EXECUCAO", "AGUARDANDO_APROVACAO", "CANCELADO"],
  EM_EXECUCAO: ["AGUARDANDO_APROVACAO", "CONCLUIDA", "CANCELADO"],
  CONCLUIDA: ["VALIDADO", "REPROVADO", "EM_EXECUCAO"],
  VALIDADO: ["EM_EXECUCAO"],
  REPROVADO: ["EM_EXECUCAO", "AGUARDANDO_APROVACAO", "CANCELADO"],
};

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileStorageProvider) private readonly storage: FileStorageProvider,
    @Inject(AttachmentSecurityScanner) private readonly scanner: AttachmentSecurityScanner,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
    @Inject(TicketAttachmentCleanupService)
    private readonly attachmentCleanup: TicketAttachmentCleanupService,
    @Optional()
    @Inject(TransactionalEmailService)
    private readonly email?: TransactionalEmailService,
  ) {}

  async list(query: ListTicketsQueryDto, current: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const where = await this.visibleWhere(current, query);
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: orderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: ticketInclude,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      items: items.map(serializeTicketList),
      page,
      pageSize,
      total,
      hasNext: page * pageSize < total,
    };
  }

  async summary(query: ListTicketsQueryDto, current: AuthenticatedUser) {
    const where = await this.visibleWhere(current, query);
    const grouped = await this.prisma.ticket.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    const counts = Object.fromEntries(Object.values(TicketStatus).map((status) => [status, 0]));
    for (const item of grouped) counts[item.status] = item._count._all;
    return { total: grouped.reduce((total, item) => total + item._count._all, 0), counts };
  }

  async inviteCustomerContact(contactId: string, current: AuthenticatedUser) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId: current.tenantId,
        archivedAt: null,
        customerId: { not: null },
        email: { not: null },
        customerAccessProfile: { not: null },
      },
      include: { customer: { select: { id: true, name: true } }, portalMembership: true },
    });
    if (!contact?.email || !contact.customer) {
      throw new BadRequestException("Contato elegível com cliente, perfil e e-mail é obrigatório.");
    }
    if (contact.portalMembership?.status === "ACTIVE") {
      return { status: "active" as const, contactId: contact.id };
    }
    const email = contact.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { tenantId: current.tenantId }, include: { role: true } } },
    });
    const existingMembership = existingUser?.memberships[0];
    if (existingMembership && existingMembership.role.key !== "customer_portal") {
      throw new ConflictException({ code: "CONTACT_EMAIL_ALREADY_TENANT_MEMBER" });
    }
    if (existingMembership?.status === "ACTIVE") {
      await this.prisma.contact.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: contact.id } },
        data: { portalMembershipId: existingMembership.id, portalAccessActive: true },
      });
      return { status: "active" as const, contactId: contact.id };
    }

    this.email?.assertInvitationDeliveryReady();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { tenantId_key: { tenantId: current.tenantId, key: "customer_portal" } },
        create: {
          tenantId: current.tenantId,
          key: "customer_portal",
          name: "Portal do cliente",
          description: "Acesso restrito do cliente aos próprios chamados.",
          system: true,
          active: true,
        },
        update: { active: true },
      });
      const portalPermissions = ["tickets.read", "tickets.create", "tickets.update"];
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: portalPermissions } },
      });
      await tx.rolePermission.createMany({
        data: portalPermissions.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
      await tx.userInvitation.updateMany({
        where: {
          tenantId: current.tenantId,
          email,
          status: "PENDING",
        },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      return tx.userInvitation.create({
        data: {
          tenantId: current.tenantId,
          contactId: contact.id,
          email,
          roleId: role.id,
          tokenHash: hashPortalToken(token),
          expiresAt,
          invitedByMembershipId: current.membershipId,
        },
      });
    });
    const acceptUrl = `${tenantAppUrl()}/login?invite=${encodeURIComponent(token)}`;
    try {
      const delivery = this.email
        ? await this.email.sendCustomerPortalInvitation({
            to: email,
            contactName: contact.name,
            customerName: contact.customer.name,
            acceptUrl,
            expiresAt,
          })
        : { delivered: false, provider: "local-preview" as const };
      return {
        id: invitation.id,
        contactId: contact.id,
        email,
        status: "pending" as const,
        expiresAt,
        delivery,
        ...(exposeLocalTokens() ? { acceptUrl } : {}),
      };
    } catch (error) {
      await this.prisma.userInvitation.updateMany({
        where: { id: invitation.id, tenantId: current.tenantId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      throw error;
    }
  }

  async detail(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    return serializeTicket(ticket);
  }

  async create(dto: CreateTicketDto, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "tickets");
    const portalContext = await this.portalCreateContext(current);
    const input: CreateTicketDto = portalContext
      ? {
          ...dto,
          departmentId: portalContext.serviceDepartmentId,
          requesterUserId: current.userId,
          requesterContactId: portalContext.contact.id,
          customerId: portalContext.contact.customerId!,
          customerDepartmentId: portalContext.contact.customerDepartmentId!,
          originBranchId: portalContext.contact.customerBranchId!,
          assignedMembershipId: null,
          conversationId: undefined,
        }
      : dto;
    const departmentId = await this.resolveDepartment(input.departmentId, current);
    const assignedMembershipId = input.assignedMembershipId
      ? await this.resolveAssignee(input.assignedMembershipId, departmentId, current)
      : null;
    const relations = await this.resolveRelations(input, current);
    const approvalPlan = await this.initialApprovalPlan(
      input.category ?? TicketCategory.SUPORTE,
      relations.requesterContactId ?? null,
      relations.customerId ?? null,
      relations.customerDepartmentId ?? null,
      current,
    );
    const html = sanitizeTicketHtml(input.descriptionHtml);
    const descriptionText = htmlToText(html);
    if (!descriptionText) throw new BadRequestException("Descrição do chamado obrigatoria.");
    const ticket = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.ticketProtocolCounter.upsert({
        where: { tenantId: current.tenantId },
        create: { tenantId: current.tenantId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const protocol = `TKT-${String(counter.lastNumber).padStart(6, "0")}`;
      const created = await tx.ticket.create({
        data: {
          tenantId: current.tenantId,
          number: counter.lastNumber,
          protocol,
          title: sanitizePlainText(input.title, 180),
          descriptionHtmlSanitized: html,
          descriptionText,
          status: approvalPlan ? TicketStatus.AGUARDANDO_APROVACAO : TicketStatus.NOVO,
          priority: input.priority ?? TicketPriority.NORMAL,
          category: input.category ?? TicketCategory.SUPORTE,
          departmentId,
          assignedMembershipId,
          createdByMembershipId: current.membershipId,
          ...relations,
        },
        include: ticketInclude,
      });
      await tx.ticketHistory.create({
        data: {
          tenantId: current.tenantId,
          ticketId: created.id,
          actorMembershipId: current.membershipId,
          event: "ticket.created",
          toValue: protocol,
        },
      });
      if (approvalPlan) {
        await tx.ticketApproval.create({
          data: {
            tenantId: current.tenantId,
            ticketId: created.id,
            requestedByMembershipId: current.membershipId,
            ...approvalPlan,
          },
        });
        await this.recordHistory(
          created.id,
          current,
          "ticket.approval.requested",
          null,
          approvalPlan.kind,
          tx,
          { automatic: true },
        );
      }
      return created;
    });
    this.realtime.publishTicketCreated({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      ticket: serializeTicketList(ticket),
    });
    return serializeTicket(ticket);
  }

  async update(id: string, dto: UpdateTicketDto, current: AuthenticatedUser) {
    const existing = await this.findVisibleTicket(id, current);
    if (
      current.roleKey === "customer_portal" &&
      Object.keys(dto).some((key) => key !== "priority")
    ) {
      throw new ForbiddenException("No portal do cliente, somente a prioridade pode ser alterada.");
    }
    if (!existing.departmentId) {
      throw new BadRequestException("Selecione um departamento antes de editar este chamado.");
    }
    const data: Prisma.TicketUpdateInput = {};
    if (dto.title !== undefined) data.title = sanitizePlainText(dto.title, 180);
    if (dto.descriptionHtml !== undefined) {
      const html = sanitizeTicketHtml(dto.descriptionHtml);
      data.descriptionHtmlSanitized = html;
      data.descriptionText = htmlToText(html);
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.substatus !== undefined) data.substatus = dto.substatus;
    const changingToDevelopment =
      dto.category === TicketCategory.DEV && existing.category !== TicketCategory.DEV;
    const developmentApproval = changingToDevelopment
      ? await this.initialApprovalPlan(
          TicketCategory.DEV,
          existing.requesterContactId,
          existing.customerId,
          existing.customerDepartmentId,
          current,
        )
      : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: {
          ...data,
          ...(developmentApproval ? { status: TicketStatus.AGUARDANDO_APROVACAO } : {}),
        },
        include: ticketInclude,
      });
      await this.recordHistory(updated.id, current, "ticket.updated", undefined, undefined, tx);
      if (developmentApproval) {
        await tx.ticketApproval.updateMany({
          where: {
            tenantId: current.tenantId,
            ticketId: updated.id,
            status: TicketApprovalStatus.PENDING,
          },
          data: { status: TicketApprovalStatus.CANCELLED, decidedAt: new Date() },
        });
        await tx.ticketApproval.create({
          data: {
            tenantId: current.tenantId,
            ticketId: updated.id,
            requestedByMembershipId: current.membershipId,
            ...developmentApproval,
          },
        });
        await this.recordHistory(
          updated.id,
          current,
          "ticket.approval.requested",
          null,
          TicketApprovalKind.DEVELOPMENT,
          tx,
          { automatic: true, reason: "category.changed_to_development" },
        );
      }
      return updated;
    });
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      reason: "ticket.updated",
    });
    return serializeTicket(updated);
  }

  async updateStatus(id: string, status: TicketStatus, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    const existing = await this.findVisibleTicket(id, current);
    if (existing.status !== status && !transitions[existing.status].includes(status)) {
      throw new ConflictException({ code: "TICKET_STATUS_TRANSITION_INVALID" });
    }
    const closing = status === TicketStatus.FECHADO;
    const reopening = existing.closedAt && status === TicketStatus.ABERTO;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: {
          status,
          closedAt: closing ? new Date() : reopening ? null : undefined,
          closedByMembershipId: closing ? current.membershipId : reopening ? null : undefined,
        },
        include: ticketInclude,
      });
      await this.recordHistory(
        updated.id,
        current,
        closing ? "ticket.closed" : reopening ? "ticket.reopened" : "ticket.status.changed",
        existing.status,
        status,
        tx,
      );
      return updated;
    });
    this.realtime.publishTicketStatusUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      status,
      updatedAt: updated.updatedAt,
    });
    return serializeTicket(updated);
  }

  async updateAssignee(
    id: string,
    assignedMembershipId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    this.assertInternalActor(current);
    const existing = await this.findVisibleTicket(id, current);
    if (!existing.departmentId) {
      throw new BadRequestException("Selecione um departamento antes de atribuir este chamado.");
    }
    const next = assignedMembershipId
      ? await this.resolveAssignee(assignedMembershipId, existing.departmentId, current)
      : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: { assignedMembershipId: next },
        include: ticketInclude,
      });
      await this.recordHistory(
        updated.id,
        current,
        "ticket.assigned",
        existing.assignedMembershipId,
        next,
        tx,
      );
      return updated;
    });
    this.realtime.publishTicketAssignmentUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      assignedMembershipId: next,
      updatedAt: updated.updatedAt,
    });
    return serializeTicket(updated);
  }

  async updateDepartment(id: string, departmentId: string, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    const existing = await this.findVisibleTicket(id, current);
    const next = await this.resolveDepartment(departmentId, current);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: { departmentId: next, assignedMembershipId: null },
        include: ticketInclude,
      });
      await this.recordHistory(
        updated.id,
        current,
        "ticket.department.changed",
        existing.departmentId,
        next,
        tx,
      );
      return updated;
    });
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      reason: "ticket.department.changed",
    });
    return serializeTicket(updated);
  }

  async deletionPreview(id: string, current: AuthenticatedUser) {
    return this.ticketDeletionImpact(await this.ticketDeletionState(this.prisma, id, current));
  }

  async remove(id: string, snapshotToken: string, current: AuthenticatedUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const state = await this.ticketDeletionState(tx, id, current);
      const impact = this.ticketDeletionImpact(state);
      if (impact.snapshotToken !== snapshotToken) {
        return changedDeletion(impact);
      }
      const cleanupEvent = await tx.outboxEvent.create({
        data: {
          tenantId: current.tenantId,
          type: TICKET_ATTACHMENT_CLEANUP_REQUESTED,
          aggregateId: state.ticket.id,
          payload: {
            ticketId: state.ticket.id,
            protocol: state.ticket.protocol,
            title: state.ticket.title,
            deletedByMembershipId: current.membershipId,
            snapshotToken,
            counts: {
              comments: state.comments.length,
              history: state.history.length,
              attachments: state.attachments.length,
              approvals: state.approvals.length,
            },
            objectKeys: state.attachments.map((attachment) => attachment.objectKey),
          },
        },
      });
      await tx.ticketAttachment.deleteMany({
        where: { tenantId: current.tenantId, ticketId: state.ticket.id },
      });
      await tx.ticketApproval.deleteMany({
        where: { tenantId: current.tenantId, ticketId: state.ticket.id },
      });
      await tx.ticketComment.deleteMany({
        where: { tenantId: current.tenantId, ticketId: state.ticket.id },
      });
      await tx.ticketHistory.deleteMany({
        where: { tenantId: current.tenantId, ticketId: state.ticket.id },
      });
      await tx.ticket.delete({
        where: { tenantId_id: { tenantId: current.tenantId, id: state.ticket.id } },
      });
      return { status: "deleted" as const, cleanupEventId: cleanupEvent.id };
    });
    if (result.status === "changed") return result;

    const cleanupCompleted = await this.attachmentCleanup.process(result.cleanupEventId);
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: id,
      reason: "ticket.deleted",
    });
    return {
      status: "deleted" as const,
      cleanup: cleanupCompleted ? "completed" : "pending",
    };
  }

  private async ticketDeletionState(
    db: PrismaService | Prisma.TransactionClient,
    id: string,
    current: AuthenticatedUser,
  ) {
    const ticket = await db.ticket.findFirst({
      where: { id, tenantId: current.tenantId },
      select: {
        id: true,
        protocol: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });
    if (!ticket) throw new NotFoundException("Chamado não encontrado.");
    const [comments, history, attachments, approvals] = await Promise.all([
      db.ticketComment.findMany({
        where: { tenantId: current.tenantId, ticketId: ticket.id },
        select: { id: true, bodyText: true, updatedAt: true, archivedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      db.ticketHistory.findMany({
        where: { tenantId: current.tenantId, ticketId: ticket.id },
        select: { id: true, event: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      db.ticketAttachment.findMany({
        where: { tenantId: current.tenantId, ticketId: ticket.id },
        select: {
          id: true,
          originalNameSanitized: true,
          objectKey: true,
          status: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.ticketApproval.findMany({
        where: { tenantId: current.tenantId, ticketId: ticket.id },
        select: {
          id: true,
          kind: true,
          status: true,
          requestedAt: true,
          decidedAt: true,
        },
        orderBy: { requestedAt: "asc" },
      }),
    ]);
    return { ticket, comments, history, attachments, approvals };
  }

  private ticketDeletionImpact(
    state: Awaited<ReturnType<TicketsService["ticketDeletionState"]>>,
  ): DeletionImpactPreview {
    const snapshotToken = deletionSnapshot({
      ticket: {
        id: state.ticket.id,
        updatedAt: state.ticket.updatedAt,
        status: state.ticket.status,
      },
      comments: state.comments.map((item) => [item.id, item.updatedAt, item.archivedAt]),
      history: state.history.map((item) => [item.id, item.createdAt]),
      attachments: state.attachments.map((item) => [
        item.id,
        item.status,
        item.deletedAt,
        item.createdAt,
        item.objectKey,
      ]),
      approvals: state.approvals.map((item) => [
        item.id,
        item.kind,
        item.status,
        item.requestedAt,
        item.decidedAt,
      ]),
    });
    return {
      snapshotToken,
      title: "Excluir chamado",
      prompt:
        "Esta exclusão é permanente. O chamado e todos os registros dependentes abaixo serão removidos.",
      record: {
        name: state.ticket.title,
        identifiers: [
          { label: "Protocolo", value: state.ticket.protocol },
          { label: "Status", value: state.ticket.status },
        ],
      },
      dependencies: [
        {
          id: "comments",
          label: "Comentários",
          count: state.comments.length,
          operation: "delete" as const,
          operationLabel: "Serão excluídos permanentemente.",
          items: state.comments.slice(0, 5).map((item) => ({
            id: item.id,
            label: item.bodyText.slice(0, 90) || "Comentário sem texto",
          })),
          hasMore: state.comments.length > 5,
        },
        {
          id: "history",
          label: "Eventos do histórico",
          count: state.history.length,
          operation: "delete" as const,
          operationLabel: "Serão excluídos; a auditoria da exclusão será preservada separadamente.",
          items: state.history.slice(0, 5).map((item) => ({ id: item.id, label: item.event })),
          hasMore: state.history.length > 5,
        },
        {
          id: "attachments",
          label: "Anexos",
          count: state.attachments.length,
          operation: "delete" as const,
          operationLabel: "Os registros serão excluídos e os arquivos removidos após o commit.",
          items: state.attachments.slice(0, 5).map((item) => ({
            id: item.id,
            label: item.originalNameSanitized,
          })),
          hasMore: state.attachments.length > 5,
        },
        {
          id: "approvals",
          label: "Aprovações",
          count: state.approvals.length,
          operation: "delete" as const,
          operationLabel: "Serão excluídas permanentemente.",
          items: state.approvals.slice(0, 5).map((item) => ({
            id: item.id,
            label: `${item.kind} — ${item.status}`,
          })),
          hasMore: state.approvals.length > 5,
        },
      ],
      consequences: [
        {
          id: "ticket",
          text: "Não será possível recuperar o chamado pela aplicação.",
          irreversible: true,
        },
        {
          id: "storage",
          text: "Falhas temporárias ao remover arquivos serão retomadas de forma idempotente.",
          irreversible: true,
        },
      ],
      confirmation: {
        level: "standard" as const,
        confirmLabel: "Confirmar",
      },
    };
  }

  async comments(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const comments = await this.prisma.ticketComment.findMany({
      where: {
        tenantId: current.tenantId,
        ticketId: ticket.id,
        archivedAt: null,
        ...(this.isCustomerActor(current) ? { internal: false } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        authorMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return comments.map(serializeComment);
  }

  async createComment(id: string, dto: CreateTicketCommentDto, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const html = sanitizeTicketHtml(dto.bodyHtml);
    const bodyText = htmlToText(html);
    if (!bodyText) throw new BadRequestException("Comentário obrigatório.");
    const comment = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          authorMembershipId: current.membershipId,
          bodyText,
          bodyHtmlSanitized: html,
          internal: this.isCustomerActor(current) ? false : (dto.internal ?? true),
          dialogType: TicketDialogType.RESPONSE,
        },
        include: {
          authorMembership: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
      await this.recordHistory(ticket.id, current, "comment.created", null, comment.id, tx);
      if (!ticket.startedAt && !this.isCustomerActor(current)) {
        await tx.ticket.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
          data: {
            startedAt: new Date(),
            ...(ticket.status === TicketStatus.NOVO || ticket.status === TicketStatus.NA_FILA
              ? { status: TicketStatus.EM_EXECUCAO }
              : {}),
          },
        });
      }
      return comment;
    });
    this.realtime.publishTicketCommentCreated({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      comment: serializeComment(comment),
    });
    return serializeComment(comment);
  }

  async updateComment(
    id: string,
    commentId: string,
    dto: UpdateTicketCommentDto,
    current: AuthenticatedUser,
  ) {
    const ticket = await this.findVisibleTicket(id, current);
    const existing = await this.prisma.ticketComment.findFirst({
      where: { tenantId: current.tenantId, ticketId: ticket.id, id: commentId, archivedAt: null },
    });
    if (!existing) throw new NotFoundException("Diálogo não encontrado.");
    if (existing.authorMembershipId !== current.membershipId) {
      throw new ForbiddenException("Somente o autor pode editar este diálogo.");
    }
    const html = sanitizeTicketHtml(dto.bodyHtml);
    const bodyText = htmlToText(html);
    if (!bodyText) throw new BadRequestException("Diálogo obrigatório.");
    const editedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
        data: { bodyText, bodyHtmlSanitized: html, editedAt },
        include: commentInclude,
      });
      await this.recordHistory(ticket.id, current, "comment.edited", existing.id, existing.id, tx, {
        createdAt: existing.createdAt,
        editedAt,
      });
      return comment;
    });
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      reason: "comment.edited",
    });
    return serializeComment(updated);
  }

  async respond(id: string, dto: TicketResponseDto, current: AuthenticatedUser) {
    return this.addWorkflowDialog(
      id,
      dto.bodyHtml,
      TicketDialogType.RESPONSE,
      current,
      async (tx, ticket) => {
        if (!ticket.startedAt && !this.isCustomerActor(current)) {
          await tx.ticket.update({
            where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
            data: {
              startedAt: new Date(),
              ...(ticket.status === TicketStatus.NOVO || ticket.status === TicketStatus.NA_FILA
                ? { status: TicketStatus.EM_EXECUCAO }
                : {}),
            },
          });
        }
      },
    );
  }

  async transfer(id: string, dto: TransferTicketDto, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    const departmentId = await this.resolveDepartment(dto.departmentId, current);
    const assignedMembershipId = dto.assignedMembershipId
      ? await this.resolveAssignee(dto.assignedMembershipId, departmentId, current)
      : null;
    return this.addWorkflowDialog(
      id,
      dto.bodyHtml,
      TicketDialogType.TRANSFER,
      current,
      async (tx, ticket) => {
        await tx.ticket.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
          data: { departmentId, assignedMembershipId, status: TicketStatus.NA_FILA },
        });
        await this.recordHistory(
          ticket.id,
          current,
          "ticket.transferred",
          ticket.departmentId,
          departmentId,
          tx,
          { assignedMembershipId },
        );
      },
    );
  }

  async requestApproval(id: string, dto: RequestTicketApprovalDto, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    const ticket = await this.findVisibleTicket(id, current);
    const target = await this.resolveApprovalTarget(ticket, dto, current);
    const html = sanitizeTicketHtml(dto.bodyHtml);
    const bodyText = htmlToText(html);
    if (!bodyText) throw new BadRequestException("Resposta obrigatória.");
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.ticketApproval.updateMany({
        where: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          status: TicketApprovalStatus.PENDING,
        },
        data: { status: TicketApprovalStatus.CANCELLED, decidedAt: new Date() },
      });
      const comment = await tx.ticketComment.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          authorMembershipId: current.membershipId,
          bodyText,
          bodyHtmlSanitized: html,
          internal: false,
          dialogType: TicketDialogType.APPROVAL_REQUEST,
        },
        include: commentInclude,
      });
      const approval = await tx.ticketApproval.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          requestedByMembershipId: current.membershipId,
          requestCommentId: comment.id,
          ...target,
        },
      });
      await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
        data: { status: TicketStatus.AGUARDANDO_APROVACAO },
      });
      await this.recordHistory(
        ticket.id,
        current,
        "ticket.approval.requested",
        null,
        approval.id,
        tx,
        { kind: approval.kind },
      );
      return { approval, comment: serializeComment(comment) };
    });
    this.publishWorkflowUpdate(ticket.id, current, "ticket.approval.requested");
    return result;
  }

  async decideApproval(
    id: string,
    approvalId: string,
    dto: DecideTicketApprovalDto,
    current: AuthenticatedUser,
  ) {
    const ticket = await this.findVisibleTicket(id, current);
    const approval = await this.prisma.ticketApproval.findFirst({
      where: {
        id: approvalId,
        tenantId: current.tenantId,
        ticketId: ticket.id,
        status: TicketApprovalStatus.PENDING,
      },
    });
    if (!approval) throw new NotFoundException("Aprovação pendente não encontrada.");
    await this.assertApprovalActor(approval, current);
    const approved = dto.decision === "APPROVED";
    const html = dto.bodyHtml ? sanitizeTicketHtml(dto.bodyHtml) : null;
    const bodyText = html ? htmlToText(html) : approved ? "Aprovação concedida." : "";
    if (!approved && !bodyText) throw new BadRequestException("Comentário da recusa obrigatório.");
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          authorMembershipId: current.membershipId,
          bodyText,
          bodyHtmlSanitized: html,
          internal: false,
          dialogType: TicketDialogType.APPROVAL_DECISION,
        },
        include: commentInclude,
      });
      const updatedApproval = await tx.ticketApproval.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: approval.id } },
        data: {
          status: approved ? TicketApprovalStatus.APPROVED : TicketApprovalStatus.REJECTED,
          decisionCommentId: comment.id,
          decidedByMembershipId: current.membershipId,
          decidedAt: now,
        },
      });
      await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
        data: {
          status: approved ? TicketStatus.NA_FILA : TicketStatus.REPROVADO,
          approvedAt: approved ? now : ticket.approvedAt,
        },
      });
      await this.recordHistory(
        ticket.id,
        current,
        approved ? "ticket.approval.approved" : "ticket.approval.rejected",
        approval.id,
        updatedApproval.status,
        tx,
      );
      return { approval: updatedApproval, comment: serializeComment(comment) };
    });
    this.publishWorkflowUpdate(ticket.id, current, "ticket.approval.decided");
    return result;
  }

  async solve(id: string, dto: TicketResponseDto, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    return this.addWorkflowDialog(
      id,
      dto.bodyHtml,
      TicketDialogType.SOLUTION,
      current,
      async (tx, ticket) => {
        const now = new Date();
        await tx.ticket.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
          data: { status: TicketStatus.CONCLUIDA, solvedAt: now },
        });
        await this.recordHistory(ticket.id, current, "ticket.solved", null, now, tx);
      },
    );
  }

  async cancel(id: string, dto: TicketResponseDto, current: AuthenticatedUser) {
    this.assertInternalActor(current);
    return this.addWorkflowDialog(
      id,
      dto.bodyHtml,
      TicketDialogType.CANCELLATION,
      current,
      async (tx, ticket) => {
        await tx.ticketApproval.updateMany({
          where: {
            tenantId: current.tenantId,
            ticketId: ticket.id,
            status: TicketApprovalStatus.PENDING,
          },
          data: { status: TicketApprovalStatus.CANCELLED, decidedAt: new Date() },
        });
        await tx.ticket.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
          data: { status: TicketStatus.CANCELADO },
        });
        await this.recordHistory(
          ticket.id,
          current,
          "ticket.cancelled",
          ticket.status,
          "CANCELADO",
          tx,
        );
      },
    );
  }

  async validateSolution(id: string, dto: ValidateTicketSolutionDto, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    if (ticket.status !== TicketStatus.CONCLUIDA) {
      throw new ConflictException({ code: "TICKET_NOT_AWAITING_SOLUTION_VALIDATION" });
    }
    await this.assertSolutionValidator(ticket, current);
    const approved = dto.decision === "APPROVED";
    const html = dto.bodyHtml ? sanitizeTicketHtml(dto.bodyHtml) : null;
    const bodyText = html ? htmlToText(html) : approved ? "Solução aprovada." : "";
    if (!approved && !bodyText) throw new BadRequestException("Comentário da recusa obrigatório.");
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          authorMembershipId: current.membershipId,
          bodyText,
          bodyHtmlSanitized: html,
          internal: false,
          dialogType: TicketDialogType.SOLUTION_VALIDATION,
        },
        include: commentInclude,
      });
      await tx.ticket.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: ticket.id } },
        data: {
          status: approved ? TicketStatus.VALIDADO : TicketStatus.REPROVADO,
          validatedAt: approved ? now : null,
          ...(approved ? { closedAt: now, closedByMembershipId: current.membershipId } : {}),
        },
      });
      await this.recordHistory(
        ticket.id,
        current,
        approved ? "ticket.solution.approved" : "ticket.solution.rejected",
        TicketStatus.CONCLUIDA,
        approved ? TicketStatus.VALIDADO : TicketStatus.REPROVADO,
        tx,
      );
      return serializeComment(comment);
    });
    this.publishWorkflowUpdate(ticket.id, current, "ticket.solution.validated");
    return result;
  }

  async approvals(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    return this.prisma.ticketApproval.findMany({
      where: { tenantId: current.tenantId, ticketId: ticket.id },
      orderBy: { requestedAt: "asc" },
    });
  }

  async uploadAttachment(id: string, req: Request, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "storage");
    const ticket = await this.findVisibleTicket(id, current);
    const originalName = decodeHeader(req.headers["x-file-name"]) ?? "arquivo";
    const declaredMimeType = String(req.headers["content-type"] ?? "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const declaredSize = Number(req.headers["x-file-size"] ?? req.headers["content-length"] ?? 0);
    this.validateAttachment(declaredMimeType, Number.isFinite(declaredSize) ? declaredSize : 0);
    const usage = await this.entitlements.getUsage(current.tenantId);
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxStorageBytes",
      usage.storageBytes,
      Number.isFinite(declaredSize) ? declaredSize : 0,
    );
    const body = await readLimitedRequest(req, this.maxAttachmentSizeBytes());
    this.validateAttachment(declaredMimeType, body.byteLength);
    const detectedMimeType = detectMimeType(body, declaredMimeType);
    if (detectedMimeType !== declaredMimeType) {
      throw canonicalException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "ATTACHMENT_MIME_MISMATCH",
        "Tipo de arquivo não permitido.",
      );
    }

    const attachmentId = randomUUID();
    const safeName = sanitizeFileName(originalName);
    const objectKey = `tenants/${current.tenantId}/tickets/${ticket.id}/${attachmentId}/${safeName}`;
    const created = await this.prisma.ticketAttachment.create({
      data: {
        id: attachmentId,
        tenantId: current.tenantId,
        ticketId: ticket.id,
        uploadedByMembershipId: current.membershipId,
        storageProvider: this.storage.provider,
        objectKey,
        originalNameSanitized: safeName,
        mimeType: declaredMimeType,
        sizeBytes: body.byteLength,
      },
    });

    try {
      await this.storage.completeUpload({
        objectKey,
        mimeType: declaredMimeType,
        sizeBytes: body.byteLength,
        body,
      });
      const stored = await this.storage.headObject(objectKey);
      if (!stored.exists || stored.sizeBytes !== body.byteLength) {
        throw new Error("ATTACHMENT_OBJECT_MISSING");
      }
      const scanStatus = await this.scanner.scan();
      const updated = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ticketAttachment.update({
          where: { tenantId_id: { tenantId: current.tenantId, id: created.id } },
          data: { status: TicketAttachmentStatus.READY, scanStatus },
        });
        await this.recordHistory(ticket.id, current, "attachment.created", null, updated.id, tx);
        return updated;
      });
      this.realtime.publishTicketAttachmentCreated({
        tenantId: current.tenantId,
        ticketId: ticket.id,
        attachment: serializeAttachment(updated),
      });
      return serializeAttachment(updated);
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      await this.prisma.ticketAttachment
        .update({
          where: { tenantId_id: { tenantId: current.tenantId, id: created.id } },
          data: { status: TicketAttachmentStatus.REJECTED, deletedAt: new Date() },
        })
        .catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw canonicalException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ATTACHMENT_STORAGE_FAILED",
        "Não foi possível armazenar o arquivo.",
      );
    }
  }

  async attachments(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const items = await this.prisma.ticketAttachment.findMany({
      where: {
        tenantId: current.tenantId,
        ticketId: ticket.id,
        deletedAt: null,
        status: TicketAttachmentStatus.READY,
      },
      orderBy: { createdAt: "desc" },
    });
    return items.map(serializeAttachment);
  }

  async downloadAttachment(id: string, attachmentId: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const attachment = await this.findAttachment(ticket.id, attachmentId, current);
    if (attachment.status !== TicketAttachmentStatus.READY || attachment.deletedAt)
      throw new NotFoundException("Atrixus não encontrado.");
    const object = await this.storage.headObject(attachment.objectKey);
    if (!object.exists) {
      throw canonicalException(
        HttpStatus.CONFLICT,
        "ATTACHMENT_OBJECT_MISSING",
        "Arquivo do atrixus não encontrado no storage.",
      );
    }
    const stored = await this.storage.getDownloadObject(attachment.objectKey);
    return { attachment, body: stored.body };
  }

  async deleteAttachment(id: string, attachmentId: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const attachment = await this.findAttachment(ticket.id, attachmentId, current);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticketAttachment.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: attachment.id } },
        data: { status: TicketAttachmentStatus.DELETED, deletedAt: new Date() },
      });
      await this.recordHistory(ticket.id, current, "attachment.removed", attachment.id, null, tx);
      return updated;
    });
    await this.storage.deleteObject(attachment.objectKey).catch(() => undefined);
    this.realtime.publishTicketAttachmentRemoved({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      attachmentId: attachment.id,
    });
    return serializeAttachment(updated);
  }

  private async visibleWhere(
    current: AuthenticatedUser,
    query: ListTicketsQueryDto,
  ): Promise<Prisma.TicketWhereInput> {
    const where: Prisma.TicketWhereInput = {
      tenantId: current.tenantId,
      archivedAt: query.includeArchived ? undefined : null,
      status: query.status,
      priority: query.priority,
      category: query.category,
      departmentId: query.departmentId,
      assignedMembershipId: query.assignedMembershipId,
      requesterContactId: query.requesterContactId,
      customerId: query.customerId,
      conversationId: query.conversationId,
      createdAt:
        query.createdFrom || query.createdTo
          ? {
              gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
              lte: query.createdTo ? new Date(query.createdTo) : undefined,
            }
          : undefined,
      ...(query.search
        ? {
            OR: [
              { protocol: { contains: query.search, mode: "insensitive" } },
              { title: { contains: query.search, mode: "insensitive" } },
              { requesterContact: { name: { contains: query.search, mode: "insensitive" } } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    return this.applyVisibility(where, current);
  }

  private async findVisibleTicket(id: string, current: AuthenticatedUser) {
    const where = await this.applyVisibility({ id, tenantId: current.tenantId }, current);
    const ticket = await this.prisma.ticket.findFirst({ where, include: ticketInclude });
    if (!ticket) throw new NotFoundException("Chamado não encontrado.");
    return ticket;
  }

  private async applyVisibility(where: Prisma.TicketWhereInput, current: AuthenticatedUser) {
    // Temporary approved policy: ticket permissions grant tenant-wide visibility.
    // The controller/guard remains responsible for requiring the appropriate ticket permission.
    if (current.roleKey !== "customer_portal") return where;
    const contact = await this.portalContact(current);
    if (!contact?.portalAccessActive || !contact.customerId) {
      return { AND: [where, { id: "__customer_portal_without_active_contact__" }] };
    }
    const scope: Prisma.TicketWhereInput =
      contact.customerAccessProfile === "FULL_ACCESS"
        ? { customerId: contact.customerId }
        : contact.customerAccessProfile === "MANAGER"
          ? {
              customerId: contact.customerId,
              customerDepartmentId: contact.customerDepartmentId ?? "__none__",
              originBranchId: contact.customerBranchId ?? "__none__",
            }
          : { customerId: contact.customerId, requesterContactId: contact.id };
    return { AND: [where, scope] };
  }

  private async portalCreateContext(current: AuthenticatedUser) {
    if (current.roleKey !== "customer_portal") return null;
    const contact = await this.portalContact(current);
    if (
      !contact?.portalAccessActive ||
      !contact.customerId ||
      !contact.customerDepartmentId ||
      !contact.customerBranchId ||
      !contact.customerDepartment ||
      !contact.customerDepartment.active ||
      contact.customerDepartment.archivedAt ||
      contact.customerBranch?.status !== "ACTIVE" ||
      contact.customerBranch.archivedAt
    ) {
      throw new ForbiddenException(
        "O acesso do cliente precisa estar vinculado a cliente, departamento e filial ativos.",
      );
    }
    const serviceDepartment = await this.prisma.department.findFirst({
      where: {
        tenantId: current.tenantId,
        active: true,
        name: { equals: contact.customerDepartment.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!serviceDepartment) {
      throw new ConflictException({ code: "TICKET_SERVICE_DEPARTMENT_MAPPING_REQUIRED" });
    }
    return { contact, serviceDepartmentId: serviceDepartment.id };
  }

  private portalContact(current: AuthenticatedUser) {
    return this.prisma.contact.findFirst({
      where: {
        tenantId: current.tenantId,
        portalMembershipId: current.membershipId,
        archivedAt: null,
      },
      include: {
        customerDepartment: { select: { id: true, name: true, active: true, archivedAt: true } },
        customerBranch: { select: { id: true, status: true, archivedAt: true } },
      },
    });
  }

  private async resolveDepartment(
    departmentId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (!departmentId) throw new BadRequestException("Departamento inválido.");
    const department = await this.prisma.department.findFirst({
      where: { tenantId: current.tenantId, id: departmentId, active: true },
    });
    if (!department) throw new BadRequestException("Departamento inválido.");
    return departmentId;
  }

  private async resolveAssignee(
    membershipId: string,
    departmentId: string,
    current: AuthenticatedUser,
  ) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId: current.tenantId,
        id: membershipId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        departments: { some: { departmentId } },
      },
    });
    if (!membership) throw new BadRequestException("Responsável inválido para o departamento.");
    if (
      current.roleKey !== "tenant_admin" &&
      current.membershipId !== membershipId &&
      !current.permissions?.includes("tickets.update")
    ) {
      throw new ForbiddenException("Usuário sem permissão para atribuir este chamado.");
    }
    return membershipId;
  }

  private async resolveRelations(
    dto: {
      requesterUserId?: string | null;
      requesterContactId?: string | null;
      customerId?: string | null;
      customerDepartmentId?: string | null;
      originBranchId?: string | null;
      conversationId?: string | null;
    },
    current: AuthenticatedUser,
  ) {
    const data: Pick<
      Prisma.TicketUncheckedCreateInput,
      | "requesterUserId"
      | "requesterContactId"
      | "customerId"
      | "customerDepartmentId"
      | "originBranchId"
      | "conversationId"
    > = {};
    if (dto.requesterUserId) data.requesterUserId = dto.requesterUserId;
    if (dto.requesterContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { tenantId: current.tenantId, id: dto.requesterContactId },
        select: {
          id: true,
          customerId: true,
          customerBranchId: true,
          customerDepartmentId: true,
        },
      });
      if (!contact) throw new BadRequestException("Contact inválido.");
      if (dto.customerId && contact.customerId && dto.customerId !== contact.customerId) {
        throw new BadRequestException("Solicitante não pertence ao cliente informado.");
      }
      if (
        dto.originBranchId &&
        contact.customerBranchId &&
        dto.originBranchId !== contact.customerBranchId
      ) {
        throw new BadRequestException("Filial deve corresponder ao vínculo do solicitante.");
      }
      if (
        dto.customerDepartmentId &&
        contact.customerDepartmentId &&
        dto.customerDepartmentId !== contact.customerDepartmentId
      ) {
        throw new BadRequestException("Departamento deve corresponder ao vínculo do solicitante.");
      }
      data.requesterContactId = contact.id;
      data.customerId = dto.customerId ?? contact.customerId ?? undefined;
    } else if (dto.requesterContactId === null) data.requesterContactId = null;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { tenantId: current.tenantId, id: dto.customerId },
      });
      if (!customer) throw new BadRequestException("Customer inválido.");
      data.customerId = customer.id;
    } else if (dto.customerId === null) data.customerId = null;
    const customerId = data.customerId ?? dto.customerId ?? undefined;
    if ((dto.customerDepartmentId || dto.originBranchId) && !customerId) {
      throw new BadRequestException("Cliente obrigatório para departamento e filial de origem.");
    }
    if (dto.customerDepartmentId) {
      const department = await this.prisma.customerDepartment.findFirst({
        where: {
          tenantId: current.tenantId,
          id: dto.customerDepartmentId,
          customerId,
          active: true,
          archivedAt: null,
        },
      });
      if (!department) throw new BadRequestException("Departamento do cliente inválido.");
      data.customerDepartmentId = department.id;
    }
    if (dto.originBranchId) {
      const branch = await this.prisma.customerBranch.findFirst({
        where: {
          tenantId: current.tenantId,
          id: dto.originBranchId,
          customerId,
          status: "ACTIVE",
          archivedAt: null,
        },
      });
      if (!branch) throw new BadRequestException("Filial de origem inválida.");
      data.originBranchId = branch.id;
    }
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { tenantId: current.tenantId, id: dto.conversationId },
        include: { contact: { select: { id: true, customerId: true } } },
      });
      if (!conversation) throw new BadRequestException("Conversation invalida.");
      if (data.requesterContactId && data.requesterContactId !== conversation.contactId) {
        throw new BadRequestException("Contact não pertence a Conversation.");
      }
      if (!data.requesterContactId) data.requesterContactId = conversation.contactId;
      if (!data.customerId && conversation.contact?.customerId) {
        data.customerId = conversation.contact.customerId;
      }
      data.conversationId = conversation.id;
    } else if (dto.conversationId === null) data.conversationId = null;
    return data;
  }

  private async recordHistory(
    ticketId: string,
    current: AuthenticatedUser,
    event: string,
    fromValue?: unknown,
    toValue?: unknown,
    tx: Prisma.TransactionClient = this.prisma,
    metadata?: Prisma.InputJsonValue,
  ) {
    await tx.ticketHistory.create({
      data: {
        tenantId: current.tenantId,
        ticketId,
        actorMembershipId: current.membershipId,
        event,
        fromValue: fromValue == null ? null : String(fromValue),
        toValue: toValue == null ? null : String(toValue),
        metadata,
      },
    });
  }

  private async addWorkflowDialog(
    id: string,
    bodyHtml: string,
    dialogType: TicketDialogType,
    current: AuthenticatedUser,
    mutation: (
      tx: Prisma.TransactionClient,
      ticket: TicketWithRelations,
      commentId: string,
    ) => Promise<void>,
  ) {
    const ticket = await this.findVisibleTicket(id, current);
    const html = sanitizeTicketHtml(bodyHtml);
    const bodyText = htmlToText(html);
    if (!bodyText) throw new BadRequestException("Resposta obrigatória.");
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          tenantId: current.tenantId,
          ticketId: ticket.id,
          authorMembershipId: current.membershipId,
          bodyText,
          bodyHtmlSanitized: html,
          internal: false,
          dialogType,
        },
        include: commentInclude,
      });
      await mutation(tx, ticket, created.id);
      await this.recordHistory(
        ticket.id,
        current,
        `ticket.dialog.${dialogType.toLowerCase()}`,
        null,
        created.id,
        tx,
      );
      return created;
    });
    this.realtime.publishTicketCommentCreated({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      comment: serializeComment(comment),
    });
    this.publishWorkflowUpdate(ticket.id, current, `ticket.dialog.${dialogType.toLowerCase()}`);
    return serializeComment(comment);
  }

  private publishWorkflowUpdate(ticketId: string, current: AuthenticatedUser, reason: string) {
    this.realtime.publishTicketUpdated({ tenantId: current.tenantId, ticketId, reason });
  }

  private async initialApprovalPlan(
    category: TicketCategory,
    requesterContactId: string | null,
    customerId: string | null,
    customerDepartmentId: string | null,
    current: AuthenticatedUser,
  ): Promise<{
    kind: TicketApprovalKind;
    approverMembershipId?: string;
    approverContactId?: string;
  } | null> {
    if (category === TicketCategory.DEV) {
      if (!customerId) throw new BadRequestException("Cliente obrigatório para chamado DEV.");
      const contractManager = await this.prisma.contact.findFirst({
        where: {
          tenantId: current.tenantId,
          customerId,
          customerAccessProfile: "FULL_ACCESS",
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!contractManager) {
        throw new ConflictException({ code: "TICKET_CONTRACT_MANAGER_REQUIRED" });
      }
      return {
        kind: TicketApprovalKind.DEVELOPMENT,
        approverContactId: contractManager.id,
      };
    }
    if (!requesterContactId) return null;
    const requester = await this.prisma.contact.findFirst({
      where: { tenantId: current.tenantId, id: requesterContactId, archivedAt: null },
      select: { customerAccessProfile: true },
    });
    if (requester?.customerAccessProfile !== "COLLABORATOR") return null;
    if (!customerDepartmentId) {
      throw new ConflictException({ code: "TICKET_CUSTOMER_DEPARTMENT_REQUIRED" });
    }
    const department = await this.prisma.customerDepartment.findFirst({
      where: {
        tenantId: current.tenantId,
        id: customerDepartmentId,
        customerId: customerId ?? undefined,
        archivedAt: null,
      },
      select: { managerContactId: true },
    });
    if (!department?.managerContactId) {
      throw new ConflictException({ code: "TICKET_DEPARTMENT_MANAGER_REQUIRED" });
    }
    return { kind: TicketApprovalKind.SUPPORT, approverContactId: department.managerContactId };
  }

  private async resolveApprovalTarget(
    ticket: TicketWithRelations,
    dto: RequestTicketApprovalDto,
    current: AuthenticatedUser,
  ) {
    if (ticket.category === TicketCategory.DEV) {
      const plan = await this.initialApprovalPlan(
        TicketCategory.DEV,
        ticket.requesterContactId,
        ticket.customerId,
        ticket.customerDepartmentId,
        current,
      );
      if (!plan) throw new ConflictException({ code: "TICKET_APPROVER_REQUIRED" });
      return plan;
    }
    if (dto.approverMembershipId) {
      const membershipId = await this.resolveAssignee(
        dto.approverMembershipId,
        ticket.departmentId ?? "",
        current,
      );
      return { kind: TicketApprovalKind.SUPPORT, approverMembershipId: membershipId };
    }
    if (dto.approverContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: current.tenantId,
          id: dto.approverContactId,
          customerId: ticket.customerId ?? undefined,
          archivedAt: null,
        },
      });
      if (!contact) throw new BadRequestException("Aprovador inválido.");
      return { kind: TicketApprovalKind.SUPPORT, approverContactId: contact.id };
    }
    const plan = await this.initialApprovalPlan(
      TicketCategory.SUPORTE,
      ticket.requesterContactId,
      ticket.customerId,
      ticket.customerDepartmentId,
      current,
    );
    if (!plan) throw new ConflictException({ code: "TICKET_APPROVER_REQUIRED" });
    return plan;
  }

  private async assertApprovalActor(
    approval: { approverMembershipId: string | null; approverContactId: string | null },
    current: AuthenticatedUser,
  ) {
    if (approval.approverMembershipId === current.membershipId) return;
    if (approval.approverContactId) {
      const actor = await this.actorCustomerContact(current);
      if (actor?.id === approval.approverContactId) return;
    }
    throw new ForbiddenException("Somente o aprovador selecionado pode concluir esta aprovação.");
  }

  private async assertSolutionValidator(ticket: TicketWithRelations, current: AuthenticatedUser) {
    const actor = await this.actorCustomerContact(current);
    if (!actor || actor.customerId !== ticket.customerId) {
      throw new ForbiddenException("Usuário não autorizado a validar esta solução.");
    }
    const requester = ticket.requesterContact;
    const requesterProfile = requester?.customerAccessProfile;
    if (requesterProfile === "FULL_ACCESS") {
      if (actor.id === requester?.id) return;
    } else if (requesterProfile === "MANAGER") {
      if (actor.customerAccessProfile === "FULL_ACCESS" || actor.id === requester?.id) return;
    } else if (requesterProfile === "COLLABORATOR") {
      if (actor.customerAccessProfile === "FULL_ACCESS" || actor.id === requester?.id) return;
      if (ticket.customerDepartment?.managerContactId === actor.id) return;
    }
    throw new ForbiddenException("Usuário não autorizado a validar esta solução.");
  }

  private async actorCustomerContact(current: AuthenticatedUser) {
    const linked = await this.prisma.contact.findFirst({
      where: {
        tenantId: current.tenantId,
        portalMembershipId: current.membershipId,
        portalAccessActive: true,
        archivedAt: null,
      },
      select: { id: true, customerId: true, customerAccessProfile: true },
    });
    if (linked) return linked;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId: current.tenantId, id: current.membershipId, status: "ACTIVE" },
      select: { user: { select: { email: true } } },
    });
    if (!membership?.user.email) return null;
    return this.prisma.contact.findFirst({
      where: {
        tenantId: current.tenantId,
        email: { equals: membership.user.email, mode: "insensitive" },
        archivedAt: null,
      },
      select: { id: true, customerId: true, customerAccessProfile: true },
    });
  }

  private isCustomerActor(current: AuthenticatedUser) {
    return current.roleKey.startsWith("customer_");
  }

  private assertInternalActor(current: AuthenticatedUser) {
    if (this.isCustomerActor(current)) {
      throw new ForbiddenException("Ação disponível apenas para a equipe de atendimento.");
    }
  }

  private validateAttachment(mimeType: string, sizeBytes: number) {
    if (
      !["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"].includes(mimeType)
    ) {
      throw canonicalException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "ATTACHMENT_MIME_NOT_ALLOWED",
        "Tipo de arquivo não permitido.",
      );
    }
    const limit = this.maxAttachmentSizeBytes();
    if (sizeBytes > limit) {
      throw canonicalException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "ATTACHMENT_TOO_LARGE",
        `O arquivo excede o limite permitido de ${Number(process.env.TRIXUS_STORAGE_MAX_FILE_SIZE_MB ?? 10)} MB.`,
      );
    }
  }

  private maxAttachmentSizeBytes() {
    return Number(process.env.TRIXUS_STORAGE_MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
  }

  private async findAttachment(ticketId: string, attachmentId: string, current: AuthenticatedUser) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: { tenantId: current.tenantId, ticketId, id: attachmentId },
    });
    if (!attachment) throw new NotFoundException("Atrixus não encontrado.");
    return attachment;
  }
}

const ticketInclude = {
  department: { select: { id: true, name: true, color: true } },
  requesterContact: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      customerAccessProfile: true,
      customerBranchId: true,
      customerDepartmentId: true,
    },
  },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  customerDepartment: { select: { id: true, name: true, managerContactId: true } },
  originBranch: { select: { id: true, name: true, city: true, state: true } },
  assignedMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
  createdByMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
  conversation: { select: { id: true, protocol: true, status: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TicketInclude;

const commentInclude = {
  authorMembership: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.TicketCommentInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function serializeTicketList(ticket: TicketWithRelations) {
  return {
    id: ticket.id,
    protocol: ticket.protocol,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    substatus: ticket.substatus,
    department: ticket.department,
    requesterContact: ticket.requesterContact,
    customer: ticket.customer,
    customerDepartment: ticket.customerDepartment,
    originBranch: ticket.originBranch,
    conversation: ticket.conversation,
    assignedMembership: ticket.assignedMembership
      ? serializeMembership(ticket.assignedMembership)
      : null,
    createdByMembership: serializeMembership(ticket.createdByMembership),
    commentsCount: ticket._count.comments,
    attachmentsCount: ticket._count.attachments,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
    startedAt: ticket.startedAt,
    approvedAt: ticket.approvedAt,
    solvedAt: ticket.solvedAt,
    validatedAt: ticket.validatedAt,
  };
}

function serializeTicket(ticket: TicketWithRelations) {
  return {
    ...serializeTicketList(ticket),
    descriptionText: ticket.descriptionText,
    descriptionHtmlSanitized: ticket.descriptionHtmlSanitized,
    archivedAt: ticket.archivedAt,
  };
}

function serializeMembership(membership: {
  id: string;
  user: { id: string; name: string; email: string };
}) {
  return { id: membership.id, user: membership.user };
}

function serializeComment(comment: {
  id: string;
  bodyText: string;
  bodyHtmlSanitized: string | null;
  internal: boolean;
  dialogType: TicketDialogType;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorMembership: { id: string; user: { id: string; name: string; email: string } };
}) {
  return {
    id: comment.id,
    bodyText: comment.bodyText,
    bodyHtmlSanitized: comment.bodyHtmlSanitized,
    internal: comment.internal,
    dialogType: comment.dialogType,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    authorMembership: serializeMembership(comment.authorMembership),
  };
}

function serializeAttachment(attachment: {
  id: string;
  originalNameSanitized: string;
  mimeType: string;
  sizeBytes: number;
  status: TicketAttachmentStatus;
  scanStatus: string;
  createdAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: attachment.id,
    originalName: attachment.originalNameSanitized,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    status: attachment.status,
    scanStatus: attachment.scanStatus,
    createdAt: attachment.createdAt,
    deletedAt: attachment.deletedAt,
  };
}

function hashPortalToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function exposeLocalTokens() {
  return process.env.NODE_ENV !== "production" && process.env.EXPOSE_LOCAL_AUTH_TOKENS === "true";
}

function tenantAppUrl() {
  return (process.env.TENANT_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function readLimitedRequest(req: Request, limitBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > limitBytes) {
      throw canonicalException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "ATTACHMENT_TOO_LARGE",
        `O arquivo excede o limite permitido de ${Number(process.env.TRIXUS_STORAGE_MAX_FILE_SIZE_MB ?? 10)} MB.`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function decodeHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function detectMimeType(body: Buffer, declaredMimeType: string) {
  if (body.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (declaredMimeType === "text/plain") return "text/plain";
  return null;
}

function canonicalException(status: HttpStatus, code: string, message: string) {
  return new HttpException({ code, message }, status);
}

function orderBy(sort?: string): Prisma.TicketOrderByWithRelationInput[] {
  if (sort === "priority") return [{ priority: "desc" }, { createdAt: "desc" }];
  if (sort === "updatedAt") return [{ updatedAt: "desc" }];
  return [{ createdAt: "desc" }];
}
