import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  Prisma,
  TicketAttachmentStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AttachmentSecurityScanner } from "./attachment-security-scanner";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { FileStorageProvider } from "./storage/file-storage.provider";
import {
  htmlToText,
  sanitizeFileName,
  sanitizePlainText,
  sanitizeTicketHtml,
} from "./ticket-sanitizer";

const allowedMimeTypes = new Set(
  (
    process.env.NEXOS_STORAGE_ALLOWED_MIME_TYPES ??
    "image/jpeg,image/png,image/webp,application/pdf,text/plain"
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const transitions: Record<TicketStatus, TicketStatus[]> = {
  ABERTO: ["EM_ANDAMENTO", "CANCELADO"],
  EM_ANDAMENTO: ["AGUARDANDO", "RESOLVIDO", "CANCELADO"],
  AGUARDANDO: ["EM_ANDAMENTO", "RESOLVIDO", "CANCELADO"],
  RESOLVIDO: ["FECHADO", "ABERTO"],
  FECHADO: ["ABERTO"],
  CANCELADO: ["ABERTO"],
};

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileStorageProvider) private readonly storage: FileStorageProvider,
    @Inject(AttachmentSecurityScanner) private readonly scanner: AttachmentSecurityScanner,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
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

  async detail(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    return serializeTicket(ticket);
  }

  async create(dto: CreateTicketDto, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "tickets");
    const departmentId = await this.resolveDepartment(dto.departmentId, current);
    const assignedMembershipId = dto.assignedMembershipId
      ? await this.resolveAssignee(dto.assignedMembershipId, departmentId, current)
      : null;
    const relations = await this.resolveRelations(dto, current);
    const html = sanitizeTicketHtml(dto.descriptionHtml);
    const descriptionText = htmlToText(html);
    if (!descriptionText) throw new BadRequestException("Descricao do chamado obrigatoria.");
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
          title: sanitizePlainText(dto.title, 180),
          descriptionHtmlSanitized: html,
          descriptionText,
          status: TicketStatus.ABERTO,
          priority: dto.priority ?? TicketPriority.NORMAL,
          category: dto.category ?? TicketCategory.SUPORTE,
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
    const data: Prisma.TicketUpdateInput = {};
    if (dto.title !== undefined) data.title = sanitizePlainText(dto.title, 180);
    if (dto.descriptionHtml !== undefined) {
      const html = sanitizeTicketHtml(dto.descriptionHtml);
      data.descriptionHtmlSanitized = html;
      data.descriptionText = htmlToText(html);
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.category !== undefined) data.category = dto.category;
    if (
      dto.requesterContactId !== undefined ||
      dto.customerId !== undefined ||
      dto.conversationId !== undefined
    ) {
      Object.assign(data, await this.resolveRelations(dto, current));
    }
    const updated = await this.prisma.ticket.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
      data,
      include: ticketInclude,
    });
    await this.recordHistory(updated.id, current, "ticket.updated");
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      reason: "ticket.updated",
    });
    return serializeTicket(updated);
  }

  async updateStatus(id: string, status: TicketStatus, current: AuthenticatedUser) {
    const existing = await this.findVisibleTicket(id, current);
    if (existing.status !== status && !transitions[existing.status].includes(status)) {
      throw new ConflictException({ code: "TICKET_STATUS_TRANSITION_INVALID" });
    }
    const closing = status === TicketStatus.FECHADO;
    const reopening = existing.closedAt && status === TicketStatus.ABERTO;
    const updated = await this.prisma.ticket.update({
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
    );
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
    const existing = await this.findVisibleTicket(id, current);
    const next = assignedMembershipId
      ? await this.resolveAssignee(assignedMembershipId, existing.departmentId, current)
      : null;
    const updated = await this.prisma.ticket.update({
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
    );
    this.realtime.publishTicketAssignmentUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      assignedMembershipId: next,
      updatedAt: updated.updatedAt,
    });
    return serializeTicket(updated);
  }

  async updateDepartment(id: string, departmentId: string, current: AuthenticatedUser) {
    const existing = await this.findVisibleTicket(id, current);
    const next = await this.resolveDepartment(departmentId, current);
    const updated = await this.prisma.ticket.update({
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
    );
    this.realtime.publishTicketUpdated({
      tenantId: current.tenantId,
      ticketId: updated.id,
      reason: "ticket.department.changed",
    });
    return serializeTicket(updated);
  }

  async archive(id: string, current: AuthenticatedUser) {
    const existing = await this.findVisibleTicket(id, current);
    const updated = await this.prisma.ticket.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: existing.id } },
      data: { archivedAt: new Date() },
      include: ticketInclude,
    });
    await this.recordHistory(updated.id, current, "ticket.archived");
    return serializeTicket(updated);
  }

  async comments(id: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const comments = await this.prisma.ticketComment.findMany({
      where: { tenantId: current.tenantId, ticketId: ticket.id, archivedAt: null },
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
    if (!bodyText) throw new BadRequestException("Comentario obrigatorio.");
    const comment = await this.prisma.ticketComment.create({
      data: {
        tenantId: current.tenantId,
        ticketId: ticket.id,
        authorMembershipId: current.membershipId,
        bodyText,
        bodyHtmlSanitized: html,
        internal: dto.internal ?? true,
      },
      include: {
        authorMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    await this.recordHistory(ticket.id, current, "comment.created", null, comment.id);
    this.realtime.publishTicketCommentCreated({
      tenantId: current.tenantId,
      ticketId: ticket.id,
      comment: serializeComment(comment),
    });
    return serializeComment(comment);
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
    if (detectedMimeType && detectedMimeType !== declaredMimeType) {
      throw canonicalException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "ATTACHMENT_MIME_MISMATCH",
        "Tipo de arquivo nao permitido.",
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
      const updated = await this.prisma.ticketAttachment.update({
        where: { tenantId_id: { tenantId: current.tenantId, id: created.id } },
        data: { status: TicketAttachmentStatus.READY, scanStatus },
      });
      await this.recordHistory(ticket.id, current, "attachment.created", null, updated.id);
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
        "Nao foi possivel armazenar o arquivo.",
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
      throw new NotFoundException("Anexo nao encontrado.");
    const object = await this.storage.headObject(attachment.objectKey);
    if (!object.exists) {
      throw canonicalException(
        HttpStatus.CONFLICT,
        "ATTACHMENT_OBJECT_MISSING",
        "Arquivo do anexo nao encontrado no storage.",
      );
    }
    const stored = await this.storage.getDownloadObject(attachment.objectKey);
    return { attachment, body: stored.body };
  }

  async deleteAttachment(id: string, attachmentId: string, current: AuthenticatedUser) {
    const ticket = await this.findVisibleTicket(id, current);
    const attachment = await this.findAttachment(ticket.id, attachmentId, current);
    await this.storage.deleteObject(attachment.objectKey).catch(() => undefined);
    const updated = await this.prisma.ticketAttachment.update({
      where: { tenantId_id: { tenantId: current.tenantId, id: attachment.id } },
      data: { status: TicketAttachmentStatus.DELETED, deletedAt: new Date() },
    });
    await this.recordHistory(ticket.id, current, "attachment.removed", attachment.id, null);
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
    if (!ticket) throw new NotFoundException("Chamado nao encontrado.");
    return ticket;
  }

  private async applyVisibility(where: Prisma.TicketWhereInput, current: AuthenticatedUser) {
    if (current.roleKey === "tenant_admin") return where;
    const allowed = await this.allowedDepartmentIds(current);
    return {
      ...where,
      OR: [{ departmentId: { in: allowed } }, { assignedMembershipId: current.membershipId }],
    };
  }

  private async resolveDepartment(
    departmentId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (!departmentId) throw new BadRequestException("Departamento invalido.");
    const department = await this.prisma.department.findFirst({
      where: { tenantId: current.tenantId, id: departmentId, active: true },
    });
    if (!department) throw new BadRequestException("Departamento invalido.");
    if (
      current.roleKey !== "tenant_admin" &&
      !(await this.allowedDepartmentIds(current)).includes(departmentId)
    ) {
      throw new ForbiddenException("Departamento fora do escopo do usuario.");
    }
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
    if (!membership) throw new BadRequestException("Responsavel invalido para o departamento.");
    if (
      current.roleKey !== "tenant_admin" &&
      current.membershipId !== membershipId &&
      !(current.permissions ?? []).includes("tickets.assign")
    ) {
      throw new ForbiddenException("Usuario sem permissao para atribuir este chamado.");
    }
    return membershipId;
  }

  private async resolveRelations(
    dto: {
      requesterUserId?: string | null;
      requesterContactId?: string | null;
      customerId?: string | null;
      conversationId?: string | null;
    },
    current: AuthenticatedUser,
  ) {
    const data: Pick<
      Prisma.TicketUncheckedCreateInput,
      "requesterUserId" | "requesterContactId" | "customerId" | "conversationId"
    > = {};
    if (dto.requesterUserId) data.requesterUserId = dto.requesterUserId;
    if (dto.requesterContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { tenantId: current.tenantId, id: dto.requesterContactId },
        select: { id: true, customerId: true },
      });
      if (!contact) throw new BadRequestException("Contact invalido.");
      data.requesterContactId = contact.id;
      data.customerId = dto.customerId ?? contact.customerId ?? undefined;
    } else if (dto.requesterContactId === null) data.requesterContactId = null;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { tenantId: current.tenantId, id: dto.customerId },
      });
      if (!customer) throw new BadRequestException("Customer invalido.");
      data.customerId = customer.id;
    } else if (dto.customerId === null) data.customerId = null;
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { tenantId: current.tenantId, id: dto.conversationId },
        include: { contact: { select: { id: true, customerId: true } } },
      });
      if (!conversation) throw new BadRequestException("Conversation invalida.");
      if (current.roleKey !== "tenant_admin") {
        const allowed = await this.allowedDepartmentIds(current);
        if (
          !(
            (conversation.departmentId && allowed.includes(conversation.departmentId)) ||
            conversation.assignedMembershipId === current.membershipId
          )
        ) {
          throw new ForbiddenException("Conversation fora do escopo do usuario.");
        }
      }
      if (data.requesterContactId && data.requesterContactId !== conversation.contactId) {
        throw new BadRequestException("Contact nao pertence a Conversation.");
      }
      if (!data.requesterContactId) data.requesterContactId = conversation.contactId;
      if (!data.customerId && conversation.contact?.customerId) {
        data.customerId = conversation.contact.customerId;
      }
      data.conversationId = conversation.id;
    } else if (dto.conversationId === null) data.conversationId = null;
    return data;
  }

  private async allowedDepartmentIds(current: AuthenticatedUser) {
    const rows = await this.prisma.departmentMembership.findMany({
      where: { tenantId: current.tenantId, membershipId: current.membershipId },
      select: { departmentId: true },
    });
    return rows.map((row) => row.departmentId);
  }

  private async recordHistory(
    ticketId: string,
    current: AuthenticatedUser,
    event: string,
    fromValue?: unknown,
    toValue?: unknown,
  ) {
    await this.prisma.ticketHistory.create({
      data: {
        tenantId: current.tenantId,
        ticketId,
        actorMembershipId: current.membershipId,
        event,
        fromValue: fromValue == null ? null : String(fromValue),
        toValue: toValue == null ? null : String(toValue),
      },
    });
  }

  private validateAttachment(mimeType: string, sizeBytes: number) {
    const limit = this.maxAttachmentSizeBytes();
    if (!allowedMimeTypes.has(mimeType))
      throw canonicalException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "ATTACHMENT_MIME_NOT_ALLOWED",
        "Tipo de arquivo nao permitido.",
      );
    if (sizeBytes > limit) {
      throw canonicalException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "ATTACHMENT_TOO_LARGE",
        `O arquivo excede o limite permitido de ${Number(process.env.NEXOS_STORAGE_MAX_FILE_SIZE_MB ?? 10)} MB.`,
      );
    }
  }

  private maxAttachmentSizeBytes() {
    return Number(process.env.NEXOS_STORAGE_MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
  }

  private async findAttachment(ticketId: string, attachmentId: string, current: AuthenticatedUser) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: { tenantId: current.tenantId, ticketId, id: attachmentId },
    });
    if (!attachment) throw new NotFoundException("Anexo nao encontrado.");
    return attachment;
  }
}

const ticketInclude = {
  department: { select: { id: true, name: true, color: true } },
  requesterContact: { select: { id: true, name: true, email: true, phone: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  assignedMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
  createdByMembership: { include: { user: { select: { id: true, name: true, email: true } } } },
  conversation: { select: { id: true, protocol: true, status: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function serializeTicketList(ticket: TicketWithRelations) {
  return {
    id: ticket.id,
    protocol: ticket.protocol,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    department: ticket.department,
    requesterContact: ticket.requesterContact,
    customer: ticket.customer,
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
  createdAt: Date;
  updatedAt: Date;
  authorMembership: { id: string; user: { id: string; name: string; email: string } };
}) {
  return {
    id: comment.id,
    bodyText: comment.bodyText,
    bodyHtmlSanitized: comment.bodyHtmlSanitized,
    internal: comment.internal,
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
        `O arquivo excede o limite permitido de ${Number(process.env.NEXOS_STORAGE_MAX_FILE_SIZE_MB ?? 10)} MB.`,
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
