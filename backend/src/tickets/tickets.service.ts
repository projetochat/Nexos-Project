import { conversationVisibilityWhere } from "../conversations/conversation-visibility";
import {
  parseTicketImageReference,
  ticketImageSources,
  replaceTicketImageSources,
} from "./ticket-image-reference";
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
import { normalizeRegistrationText } from "../common/registration-case";
import {
  Prisma,
  AiExecutionStatus,
  ConversationStatus,
  CustomerAccessProfile,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  ProtocolModule,
  TicketAttachmentStatus,
  TicketApprovalKind,
  TicketApprovalStatus,
  TicketCategory,
  TicketDialogType,
  TicketPriority,
  TicketStatus,
} from "../generated/prisma";
import { nextProtocol } from "../common/protocol-numbering";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { TransactionalEmailService } from "../email/transactional-email.service";
import { MessagingMediaStorageService } from "../messaging/media/messaging-media-storage.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { OUTBOX_MESSAGING_OUTBOUND_REQUESTED } from "../queue/messaging-outbound.queue";
import { AttachmentSecurityScanner } from "./attachment-security-scanner";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketCommentDto } from "./dto/create-ticket-comment.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketCommentDto } from "./dto/update-ticket-comment.dto";
import {
  LinkCustomerPortalUserDto,
  UpdateCustomerPortalLoginDto,
} from "./dto/manage-customer-portal-user.dto";
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

type PreparedTicketAttachment = {
  id: string;
  sourceMessageId: string | null;
  originalReference?: string;
  ordinal: number;
  objectKey: string;
  fileName: string;
  mimeType: string;
  body: Buffer;
  checksum: string;
  scanStatus: "NOT_SCANNED";
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
    @Inject(MessagingMediaStorageService)
    private readonly messagingMediaStorage: MessagingMediaStorageService,
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

  async portalDashboard(query: ListTicketsQueryDto, current: AuthenticatedUser) {
    if (current.roleKey !== "customer_portal") {
      throw new ForbiddenException("Dashboard disponível somente no Portal do Cliente.");
    }
    const access = await this.portalAccess(current);
    if (!access?.active || access.accessProfile !== CustomerAccessProfile.FULL_ACCESS) {
      throw new ForbiddenException("Dashboard disponível somente para o perfil Acesso Full.");
    }
    const where = await this.visibleWhere(current, query);
    const [tickets, departments, branches] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          priority: true,
          category: true,
          createdAt: true,
          solvedAt: true,
          closedAt: true,
          validatedAt: true,
          customerDepartmentId: true,
          originBranchId: true,
          customerDepartment: { select: { id: true, name: true } },
          originBranch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.customerDepartment.findMany({
        where: {
          tenantId: current.tenantId,
          customerId: access.customerId,
          active: true,
          archivedAt: null,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      this.prisma.customerBranch.findMany({
        where: {
          tenantId: current.tenantId,
          customerId: access.customerId,
          status: "ACTIVE",
          archivedAt: null,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    const countStatuses = (statuses: TicketStatus[]) =>
      tickets.filter((ticket) => statuses.includes(ticket.status)).length;
    const finishedDurations = tickets
      .map((ticket) => {
        const finishedAt = ticket.validatedAt ?? ticket.closedAt ?? ticket.solvedAt;
        return finishedAt ? finishedAt.getTime() - ticket.createdAt.getTime() : null;
      })
      .filter((duration): duration is number => duration !== null && duration >= 0);
    const averageResolutionHours = finishedDurations.length
      ? Math.round(
          (finishedDurations.reduce((total, duration) => total + duration, 0) /
            finishedDurations.length /
            3_600_000) *
            10,
        ) / 10
      : null;
    return {
      filters: { departments, branches },
      metrics: {
        total: tickets.length,
        open: countStatuses([
          TicketStatus.ABERTO,
          TicketStatus.AGUARDANDO,
          TicketStatus.NOVO,
          TicketStatus.NA_FILA,
        ]),
        inProgress: countStatuses([TicketStatus.EM_ANDAMENTO, TicketStatus.EM_EXECUCAO]),
        awaitingApproval: countStatuses([TicketStatus.AGUARDANDO_APROVACAO]),
        awaitingValidation: countStatuses([TicketStatus.CONCLUIDA]),
        completed: countStatuses([
          TicketStatus.RESOLVIDO,
          TicketStatus.FECHADO,
          TicketStatus.VALIDADO,
        ]),
        rejected: countStatuses([TicketStatus.REPROVADO]),
        canceled: countStatuses([TicketStatus.CANCELADO]),
        averageResolutionHours,
      },
      byDepartment: aggregateDashboardDimension(
        tickets.map((ticket) => ({
          id: ticket.customerDepartmentId,
          label: ticket.customerDepartment?.name,
        })),
        "Sem departamento",
      ),
      byBranch: aggregateDashboardDimension(
        tickets.map((ticket) => ({ id: ticket.originBranchId, label: ticket.originBranch?.name })),
        "Sem filial",
      ),
      byCategory: aggregateDashboardDimension(
        tickets.map((ticket) => ({
          id: ticket.category,
          label: ticketCategoryLabel(ticket.category),
        })),
        "Sem tipo",
      ),
      byPriority: aggregateDashboardDimension(
        tickets.map((ticket) => ({
          id: ticket.priority,
          label: ticketPriorityLabel(ticket.priority),
        })),
        "Sem prioridade",
      ),
    };
  }

  async listCustomerPortalUsers(customerId: string, current: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: current.tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Cliente não encontrado.");

    const accesses = await this.prisma.customerPortalAccess.findMany({
      where: {
        tenantId: current.tenantId,
        customerId,
        revokedAt: null,
        contact: {
          archivedAt: null,
          NOT: { normalizedPhone: { startsWith: "group:" } },
        },
      },
      orderBy: [{ contact: { name: "asc" } }],
      include: {
        contact: true,
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        membership: { include: { role: true } },
        invitations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, expiresAt: true },
        },
        _count: {
          select: { invitations: { where: { status: "ACCEPTED" } } },
        },
      },
    });
    const now = Date.now();
    return accesses.map((access) => {
      const invitation = access.invitations[0] ?? null;
      const pending = Boolean(invitation && invitation.expiresAt.getTime() > now);
      const expired = Boolean(invitation && invitation.expiresAt.getTime() <= now);
      const active =
        !invitation &&
        access.active &&
        access.contact.active &&
        access.membership?.status === "ACTIVE" &&
        (access._count?.invitations ?? 0) > 0;
      return {
        contact: {
          id: access.contact.id,
          name: access.contact.name,
          email: access.contact.email,
          phone: access.contact.phone,
          active: access.contact.active,
        },
        login: access.login,
        accessProfile: access.accessProfile,
        branch: access.branch,
        department: access.department,
        accessStatus: active
          ? ("ACTIVE" as const)
          : pending
            ? ("PENDING" as const)
            : expired
              ? ("EXPIRED" as const)
              : ("DISABLED" as const),
        invitation,
      };
    });
  }

  async linkCustomerPortalUser(
    customerId: string,
    dto: LinkCustomerPortalUserDto,
    current: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: current.tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Cliente não encontrado.");
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: dto.contactId,
        tenantId: current.tenantId,
        archivedAt: null,
        active: true,
        NOT: { normalizedPhone: { startsWith: "group:" } },
      },
      select: { id: true, customerId: true, email: true },
    });
    if (!contact) throw new NotFoundException("Contato não encontrado ou inativo.");
    const normalizedLogin = dto.login.trim().toLowerCase();
    const email = customerPortalIdentityEmail(current.tenantId, contact.id, contact.email);
    if (normalizedLogin.includes("@") && !contact.email) {
      throw new BadRequestException(
        "Cadastre o e-mail do contato somente para utilizá-lo como login.",
      );
    }
    if (normalizedLogin.includes("@") && normalizedLogin !== email) {
      throw new BadRequestException(
        "Para usar outro e-mail, atualize primeiro o cadastro do contato.",
      );
    }
    const existingAccess = await this.prisma.customerPortalAccess.findFirst({
      where: { tenantId: current.tenantId, customerId, contactId: contact.id },
      select: {
        id: true,
        active: true,
        revokedAt: true,
        userId: true,
        membershipId: true,
        user: { select: { email: true } },
        membership: { select: { user: { select: { email: true } } } },
        invitations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { expiresAt: true },
        },
      },
    });
    const associationMatchesEmail = this.portalAssociationMatchesEmail(existingAccess, email);
    await this.assertPortalLoginIdentity(
      normalizedLogin,
      email,
      current.tenantId,
      existingAccess?.id,
      associationMatchesEmail ? existingAccess?.userId : undefined,
    );
    const pendingInvitation = existingAccess?.invitations[0];
    if (
      (!existingAccess?.revokedAt && existingAccess?.active) ||
      (!existingAccess?.revokedAt &&
        pendingInvitation &&
        pendingInvitation.expiresAt.getTime() > Date.now())
    ) {
      throw new ConflictException({
        code: "CUSTOMER_PORTAL_ACCESS_ALREADY_EXISTS",
        message: "Este contato já possui acesso ao portal deste cliente.",
      });
    }

    const assignment = await this.resolvePortalAccessAssignment(
      customerId,
      dto.accessProfile,
      dto.customerDepartmentId,
      dto.customerBranchId,
      current,
    );

    const accessData = {
      login: normalizedLogin,
      accessProfile: assignment.accessProfile,
      departmentId: assignment.customerDepartmentId,
      branchId: assignment.customerBranchId,
      active: false,
      revokedAt: null,
      userId: null,
      membershipId: null,
    };
    const access = existingAccess
      ? await this.prisma.customerPortalAccess.update({
          where: { id: existingAccess.id },
          data: accessData,
        })
      : await this.prisma.customerPortalAccess.create({
          data: {
            tenantId: current.tenantId,
            customerId,
            contactId: contact.id,
            ...accessData,
          },
        });
    return this.inviteCustomerPortalAccess(access.id, current);
  }

  async revokeCustomerPortalUser(
    customerId: string,
    contactId: string,
    current: AuthenticatedUser,
  ) {
    const access = await this.prisma.customerPortalAccess.findFirst({
      where: { tenantId: current.tenantId, customerId, contactId, revokedAt: null },
      include: {
        customer: { select: { name: true } },
        department: { select: { name: true } },
        branch: { select: { name: true } },
        contact: {
          include: {
            customerDepartment: { select: { name: true } },
            customerBranch: { select: { name: true } },
          },
        },
      },
    });
    if (!access) throw new NotFoundException("Acesso do contato não encontrado.");
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.userInvitation.updateMany({
        where: { tenantId: current.tenantId, portalAccessId: access.id, status: "PENDING" },
        data: { status: "REVOKED", revokedAt },
      });
      await tx.authSession.updateMany({
        where: { tenantId: current.tenantId, portalAccessId: access.id, revokedAt: null },
        data: { revokedAt },
      });
      await tx.customerPortalAccess.update({
        where: { id: access.id },
        data: {
          active: false,
          revokedAt,
          userId: null,
          membershipId: null,
        },
      });
    });
    const removalContent = customerPortalWhatsAppRemoval({
      contactName: access.contact.name,
      customerName: access.customer.name,
      login: access.login,
      profileName: customerPortalAccessProfileLabel(access.accessProfile),
      departmentName:
        access.department?.name ?? access.contact.customerDepartment?.name ?? "Não definido",
      branchName: access.branch?.name ?? access.contact.customerBranch?.name ?? "Não definida",
    });
    const delivery = await this.queueCustomerPortalMessageByWhatsApp({
      contact: access.contact,
      content: removalContent,
      clientMessageId: `portal-access-removal:${access.id}:${revokedAt.getTime()}`,
      current,
    }).catch((error: unknown) => ({
      delivered: false as const,
      queued: false as const,
      provider: "whatsapp" as const,
      error: portalDeliveryErrorMessage(error),
    }));
    return { revoked: true as const, contactId, delivery };
  }

  async updateCustomerPortalUser(
    customerId: string,
    contactId: string,
    dto: UpdateCustomerPortalLoginDto,
    current: AuthenticatedUser,
  ) {
    const access = await this.prisma.customerPortalAccess.findFirst({
      where: {
        tenantId: current.tenantId,
        customerId,
        contactId,
        revokedAt: null,
        contact: { archivedAt: null },
      },
      include: {
        contact: { select: { id: true, email: true } },
        user: { select: { email: true } },
        membership: { select: { user: { select: { email: true } } } },
      },
    });
    if (!access) throw new NotFoundException("Acesso do contato não encontrado.");
    const normalizedLogin = dto.login.trim().toLowerCase();
    const email = customerPortalIdentityEmail(
      current.tenantId,
      access.contact.id,
      access.contact.email,
    );
    if (normalizedLogin.includes("@") && !access.contact.email) {
      throw new BadRequestException(
        "Cadastre o e-mail do contato somente para utilizá-lo como login.",
      );
    }
    if (!this.portalAssociationMatchesEmail(access, email)) {
      throw new ConflictException({
        code: "PORTAL_ACCESS_IDENTITY_MISMATCH",
        message:
          "O e-mail do contato não corresponde à identidade vinculada. Revogue o acesso antes de criar um novo vínculo.",
      });
    }
    if (normalizedLogin.includes("@") && normalizedLogin !== email) {
      throw new BadRequestException(
        "Para usar outro e-mail, atualize primeiro o cadastro do contato.",
      );
    }
    await this.assertPortalLoginIdentity(
      normalizedLogin,
      email,
      current.tenantId,
      access.id,
      access.userId,
    );

    const assignment = await this.resolvePortalAccessAssignment(
      customerId,
      dto.accessProfile,
      dto.customerDepartmentId,
      dto.customerBranchId,
      current,
    );

    const accessData = {
      login: normalizedLogin,
      accessProfile: assignment.accessProfile,
      departmentId: assignment.customerDepartmentId,
      branchId: assignment.customerBranchId,
    };

    if (dto.active === false) {
      const revokedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.customerPortalAccess.update({
          where: { id: access.id },
          data: { ...accessData, active: false },
        });
        await tx.userInvitation.updateMany({
          where: {
            tenantId: current.tenantId,
            portalAccessId: access.id,
            status: "PENDING",
          },
          data: { status: "REVOKED", revokedAt },
        });
        await tx.authSession.updateMany({
          where: { tenantId: current.tenantId, portalAccessId: access.id, revokedAt: null },
          data: { revokedAt },
        });
      });
      return {
        contactId: access.contact.id,
        login: normalizedLogin,
        active: false,
        status: "disabled" as const,
        ...assignment,
      };
    }

    await this.prisma.customerPortalAccess.update({
      where: { id: access.id },
      data: accessData,
    });

    if (dto.active === true && !access.active) {
      return this.inviteCustomerPortalAccess(access.id, current, { forceDelivery: true });
    }
    return {
      contactId: access.contact.id,
      login: normalizedLogin,
      ...(dto.active === true ? { active: true, status: "active" as const } : {}),
      ...assignment,
    };
  }

  private async resolvePortalAccessAssignment(
    customerId: string,
    accessProfile: CustomerAccessProfile,
    customerDepartmentId: string | null | undefined,
    customerBranchId: string | null | undefined,
    current: AuthenticatedUser,
  ) {
    if (!customerBranchId) {
      throw new BadRequestException("Filial de lotação é obrigatória para o acesso ao portal.");
    }
    if (accessProfile !== CustomerAccessProfile.FULL_ACCESS && !customerDepartmentId) {
      throw new BadRequestException(
        "Departamento de lotação é obrigatório para Gerente e Colaborador.",
      );
    }
    const [department, branch] = await Promise.all([
      customerDepartmentId
        ? this.prisma.customerDepartment.findFirst({
            where: {
              id: customerDepartmentId,
              tenantId: current.tenantId,
              customerId,
              active: true,
              archivedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.customerBranch.findFirst({
        where: {
          id: customerBranchId,
          tenantId: current.tenantId,
          customerId,
          status: "ACTIVE",
          archivedAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (accessProfile !== CustomerAccessProfile.FULL_ACCESS && !department) {
      throw new BadRequestException("Departamento de lotação inválido ou inativo.");
    }
    if (!branch) throw new BadRequestException("Filial de lotação inválida ou inativa.");
    return {
      accessProfile,
      customerDepartmentId:
        accessProfile === CustomerAccessProfile.FULL_ACCESS ? null : department!.id,
      customerBranchId: branch.id,
    };
  }

  async inviteCustomerContact(contactId: string, current: AuthenticatedUser, customerId?: string) {
    const accesses = await this.prisma.customerPortalAccess.findMany({
      where: {
        tenantId: current.tenantId,
        contactId,
        customerId,
        revokedAt: null,
        contact: { archivedAt: null, active: true },
      },
      select: { id: true },
    });
    if (!accesses.length) {
      throw new BadRequestException(
        "Contato ativo com acesso ao portal é obrigatório para reenviar o convite.",
      );
    }
    if (accesses.length > 1) {
      throw new ConflictException({
        code: "CUSTOMER_PORTAL_ACCESS_SELECTION_REQUIRED",
        message: "Selecione o cliente para reenviar o convite deste contato.",
      });
    }
    return this.inviteCustomerPortalAccess(accesses[0].id, current);
  }

  private async inviteCustomerPortalAccess(
    accessId: string,
    current: AuthenticatedUser,
    options: { forceDelivery?: boolean } = {},
  ) {
    const access = await this.prisma.customerPortalAccess.findFirst({
      where: { id: accessId, tenantId: current.tenantId, revokedAt: null },
      include: {
        customer: { select: { id: true, name: true } },
        department: { select: { name: true } },
        branch: { select: { name: true } },
        membership: { include: { user: { select: { email: true } } } },
        user: { select: { email: true } },
        contact: {
          include: {
            customerDepartment: { select: { name: true } },
            customerBranch: { select: { name: true } },
          },
        },
        invitations: {
          where: { status: "ACCEPTED" },
          orderBy: { acceptedAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!access || !access.contact.active || access.contact.archivedAt) {
      throw new BadRequestException(
        "Contato ativo com acesso ao portal é obrigatório para liberar o acesso.",
      );
    }
    const email = customerPortalIdentityEmail(
      current.tenantId,
      access.contact.id,
      access.contact.email,
    );
    if (!this.portalAssociationMatchesEmail(access, email)) {
      throw new ConflictException({
        code: "PORTAL_ACCESS_IDENTITY_MISMATCH",
        message:
          "O e-mail do contato não corresponde à identidade vinculada. Revogue o acesso antes de criar um novo vínculo.",
      });
    }
    if (
      access.active &&
      access.membership?.status === "ACTIVE" &&
      (access.invitations?.length ?? 0) > 0 &&
      !options.forceDelivery
    ) {
      return { status: "active" as const, contactId: access.contact.id };
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const role = await this.ensureCustomerPortalRole(tx, current.tenantId);
      const revokedAt = new Date();
      await tx.customerPortalAccess.update({
        where: { id: access.id },
        data: { active: false },
      });
      await tx.authSession.updateMany({
        where: { tenantId: current.tenantId, portalAccessId: access.id, revokedAt: null },
        data: { revokedAt },
      });
      return tx.userInvitation.create({
        data: {
          tenantId: current.tenantId,
          contactId: access.contact.id,
          portalAccessId: access.id,
          email,
          roleId: role.id,
          tokenHash: hashPortalToken(token),
          expiresAt,
          invitedByMembershipId: current.membershipId,
        },
      });
    });
    const acceptUrl = `${tenantAppUrl()}/login/portal-cliente?invite=${encodeURIComponent(token)}`;
    const contact = {
      id: access.contact.id,
      name: access.contact.name,
      phone: access.contact.phone,
      normalizedPhone: access.contact.normalizedPhone,
      instance: access.contact.instance,
      instanceIds: access.contact.instanceIds,
      customer: access.customer,
    };
    const usesEmailLogin = access.login.includes("@");
    const invitationDetails = {
      login: access.login,
      profileName: customerPortalAccessProfileLabel(access.accessProfile),
      departmentName:
        access.department?.name ?? access.contact.customerDepartment?.name ?? "Não definido",
      branchName: access.branch?.name ?? access.contact.customerBranch?.name ?? "Não definida",
    };
    const emailAttempt = usesEmailLogin
      ? Promise.resolve().then(async () => {
          if (!this.email) return { delivered: false, provider: "local-preview" as const };
          this.email.assertInvitationDeliveryReady();
          return this.email.sendCustomerPortalInvitation({
            to: email,
            contactName: access.contact.name,
            customerName: access.customer.name,
            ...invitationDetails,
            acceptUrl,
            expiresAt,
          });
        })
      : Promise.resolve(null);
    const whatsappAttempt = this.queueCustomerPortalInvitationByWhatsApp({
      invitationId: invitation.id,
      contact,
      ...invitationDetails,
      acceptUrl,
      expiresAt,
      current,
    });
    const [emailResult, whatsappResult] = await Promise.allSettled([emailAttempt, whatsappAttempt]);
    const emailDelivery =
      emailResult.status === "fulfilled"
        ? emailResult.value
        : {
            delivered: false,
            provider: "email" as const,
            error: portalDeliveryErrorMessage(emailResult.reason),
          };
    const whatsappDelivery =
      whatsappResult.status === "fulfilled"
        ? whatsappResult.value
        : {
            delivered: false,
            provider: "whatsapp" as const,
            error: portalDeliveryErrorMessage(whatsappResult.reason),
          };
    const emailSucceeded = Boolean(emailDelivery?.delivered);
    const whatsappSucceeded = Boolean(
      whatsappDelivery.delivered || ("queued" in whatsappDelivery && whatsappDelivery.queued),
    );
    if (!emailSucceeded && !whatsappSucceeded) {
      await this.prisma.userInvitation.updateMany({
        where: { id: invitation.id, tenantId: current.tenantId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      if (!usesEmailLogin && whatsappResult.status === "rejected") throw whatsappResult.reason;
      throw new BadRequestException(
        "Não foi possível enviar o acesso por e-mail nem por WhatsApp. Verifique os canais e tente novamente.",
      );
    }
    const delivery = whatsappSucceeded ? whatsappDelivery : emailDelivery!;
    return {
      id: invitation.id,
      contactId: access.contact.id,
      email,
      status: "pending" as const,
      expiresAt,
      delivery,
      deliveries: { email: emailDelivery, whatsapp: whatsappDelivery },
      ...(exposeLocalTokens() ? { acceptUrl } : {}),
    };
  }

  private async ensureCustomerPortalRole(tx: Prisma.TransactionClient, tenantId: string) {
    const role = await tx.role.upsert({
      where: { tenantId_key: { tenantId, key: "customer_portal" } },
      create: {
        tenantId,
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
      data: portalPermissions.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    return role;
  }

  private async assertPortalLoginIdentity(
    login: string,
    email: string,
    tenantId: string,
    excludeAccessId?: string,
    knownUserId?: string | null,
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    const emailUser = knownUserId
      ? { id: knownUserId }
      : await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
    const sameLoginAccesses = await this.prisma.customerPortalAccess.findMany({
      where: {
        tenantId,
        login,
        id: excludeAccessId ? { not: excludeAccessId } : undefined,
      },
      select: {
        userId: true,
        user: { select: { email: true } },
        contact: { select: { email: true } },
      },
    });
    const differentIdentity = sameLoginAccesses.some((candidate) => {
      if (candidate.userId && emailUser?.id && candidate.userId === emailUser.id) return false;
      if (candidate.user?.email?.toLowerCase().trim() === normalizedEmail) return false;
      return candidate.contact.email?.toLowerCase().trim() !== normalizedEmail;
    });
    if (differentIdentity) {
      throw new ConflictException({
        code: "PORTAL_LOGIN_IDENTITY_CONFLICT",
        message: "Este login já pertence a outra pessoa. Informe outro login.",
      });
    }
  }

  private portalAssociationMatchesEmail(
    access:
      | {
          userId?: string | null;
          membershipId?: string | null;
          user?: { email: string } | null;
          membership?: { user?: { email: string } | null } | null;
        }
      | null
      | undefined,
    email: string,
  ) {
    if (!access) return true;
    const associatedEmails = [access.user?.email, access.membership?.user?.email]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase().trim());
    if (!associatedEmails.length) return !access.userId && !access.membershipId;
    return associatedEmails.every((value) => value === email.toLowerCase().trim());
  }

  private async customerPortalMembershipForEmail(email: string, current: AuthenticatedUser) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { tenantId: current.tenantId }, include: { role: true } } },
    });
    return existingUser?.memberships[0];
  }

  private async queueCustomerPortalInvitationByWhatsApp(input: {
    invitationId: string;
    contact: {
      id: string;
      name: string;
      phone: string;
      normalizedPhone: string;
      instance: string | null;
      instanceIds: string[];
      customer: { id: string; name: string };
    };
    login: string;
    profileName: string;
    departmentName: string;
    branchName: string;
    acceptUrl: string;
    expiresAt: Date;
    current: AuthenticatedUser;
  }) {
    const content = customerPortalWhatsAppInvitation({
      contactName: input.contact.name,
      customerName: input.contact.customer.name,
      login: input.login,
      profileName: input.profileName,
      departmentName: input.departmentName,
      branchName: input.branchName,
      acceptUrl: input.acceptUrl,
      expiresAt: input.expiresAt,
    });
    return this.queueCustomerPortalMessageByWhatsApp({
      contact: input.contact,
      content,
      clientMessageId: `portal-invitation:${input.invitationId}`,
      current: input.current,
    });
  }

  private async queueCustomerPortalMessageByWhatsApp(input: {
    contact: {
      id: string;
      instance: string | null;
      instanceIds: string[];
    };
    content: string;
    clientMessageId: string;
    current: AuthenticatedUser;
  }) {
    const instanceKeys = [
      ...new Set([...input.contact.instanceIds, input.contact.instance]),
    ].filter((value): value is string => Boolean(value?.trim()));
    if (!instanceKeys.length) {
      throw new BadRequestException(
        "Vincule uma instância de WhatsApp ao contato antes de enviar o acesso.",
      );
    }
    const connections = await this.prisma.messagingConnection.findMany({
      where: {
        tenantId: input.current.tenantId,
        archivedAt: null,
        serviceEnabled: true,
        status: MessagingConnectionStatus.CONNECTED,
        providerType: {
          in: [MessagingProviderType.EVOLUTION, MessagingProviderType.META_CLOUD],
        },
        externalReference: { not: null },
        OR: [
          { id: { in: instanceKeys } },
          { name: { in: instanceKeys } },
          { externalReference: { in: instanceKeys } },
        ],
      },
      select: { id: true, name: true, externalReference: true },
    });
    const connection = instanceKeys
      .map((key) =>
        connections.find(
          (item) => item.id === key || item.name === key || item.externalReference === key,
        ),
      )
      .find((item) => item !== undefined);
    if (!connection) {
      throw new BadRequestException(
        "Nenhuma instância de WhatsApp vinculada ao contato está conectada.",
      );
    }

    const queued = await this.prisma.$transaction(async (tx) => {
      const startedAt = new Date();
      const outboundAt = new Date(startedAt.getTime() + 1);
      const closedAt = new Date(startedAt.getTime() + 2);
      const { protocol } = await nextProtocol(
        tx,
        input.current.tenantId,
        ProtocolModule.CHAT,
        startedAt,
      );
      const startNote = `Conversa iniciada - protocolo ${protocol}.`;
      const endNote = `Conversa encerrada - protocolo ${protocol}.`;
      const conversation = await tx.conversation.create({
        data: {
          tenantId: input.current.tenantId,
          contactId: input.contact.id,
          connectionId: connection.id,
          assignedMembershipId: input.current.membershipId,
          status: ConversationStatus.FECHADA,
          protocol,
          createdAt: startedAt,
          closedAt,
          lastMessagePreview: endNote,
          lastMessageAt: closedAt,
        },
        select: { id: true },
      });
      await tx.message.createMany({
        data: [
          {
            tenantId: input.current.tenantId,
            conversationId: conversation.id,
            direction: MessageDirection.SYSTEM,
            type: MessageType.SYSTEM,
            authorMembershipId: input.current.membershipId,
            content: startNote,
            createdAt: startedAt,
          },
          {
            tenantId: input.current.tenantId,
            conversationId: conversation.id,
            direction: MessageDirection.SYSTEM,
            type: MessageType.SYSTEM,
            authorMembershipId: input.current.membershipId,
            content: endNote,
            createdAt: closedAt,
          },
        ],
      });
      const message = await tx.message.create({
        data: {
          tenantId: input.current.tenantId,
          conversationId: conversation.id,
          connectionId: connection.id,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          authorMembershipId: input.current.membershipId,
          content: input.content,
          clientMessageId: input.clientMessageId,
          queuedAt: outboundAt,
          createdAt: outboundAt,
        },
        select: { id: true },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: input.current.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: message.id,
          payload: { tenantId: input.current.tenantId, messageId: message.id },
        },
      });
      return { conversationId: conversation.id, messageId: message.id, protocol };
    });
    return {
      delivered: false,
      queued: true as const,
      provider: "whatsapp" as const,
      ...queued,
    };
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
          requesterContactId: portalContext.contactId,
          customerId: portalContext.customerId,
          customerDepartmentId: portalContext.customerDepartmentId,
          originBranchId: portalContext.customerBranchId,
          assignedMembershipId: null,
          conversationId: undefined,
          aiExecutionId: undefined,
        }
      : dto;
    const departmentId = await this.resolveDepartment(input.departmentId, current);
    const assignedMembershipId = input.assignedMembershipId
      ? await this.resolveAssignee(input.assignedMembershipId, departmentId, current)
      : null;
    const relations = await this.resolveRelations(input, current);
    const aiExecution = input.aiExecutionId
      ? await this.prisma.aiExecution.findFirst({
          where: {
            tenantId: current.tenantId,
            id: input.aiExecutionId,
            status: AiExecutionStatus.COMPLETED,
            conversationId: relations.conversationId ?? "",
          },
          select: {
            id: true,
            agentId: true,
            functionality: true,
            conversationId: true,
            resultJson: true,
          },
        })
      : null;
    if (input.aiExecutionId && !aiExecution) {
      throw new BadRequestException(
        "A análise de IA não é válida para a conversa informada ou ainda não foi concluída.",
      );
    }
    const approvalPlan = await this.initialApprovalPlan(
      input.category ?? TicketCategory.SUPORTE,
      relations.requesterContactId ?? null,
      relations.customerId ?? null,
      relations.customerDepartmentId ?? null,
      current,
    );
    const title = await normalizeRegistrationText(
      this.prisma,
      current.tenantId,
      "ticketTitles",
      sanitizePlainText(input.title, 180),
    );
    let html = sanitizeTicketHtml(input.descriptionHtml);
    const imageSources = ticketImageSources(html);
    const referencedMessageIds: string[] = [];
    for (const source of imageSources) {
      const reference = parseTicketImageReference(source)!;
      if (reference.kind === "message") {
        if (
          !relations.conversationId ||
          reference.conversationId !== relations.conversationId ||
          portalContext
        ) {
          throw new BadRequestException("A imagem não pertence à conversa informada.");
        }
        referencedMessageIds.push(reference.messageId);
      }
    }
    const descriptionText = htmlToText(html);
    if (!descriptionText) throw new BadRequestException("Descrição do chamado obrigatoria.");
    if (referencedMessageIds.length) {
      if (!current.permissions?.includes("conversations.read")) {
        throw new ForbiddenException("Sem permissão para importar imagens da conversa.");
      }
      const visible = await this.prisma.conversation.findFirst({
        where: {
          AND: [
            { id: relations.conversationId!, tenantId: current.tenantId, archivedAt: null },
            conversationVisibilityWhere(current),
          ],
        },
      });
      if (!visible) throw new NotFoundException("Conversa não encontrada.");
    }
    const ticketId = randomUUID();
    const aiAttachments = aiExecution
      ? await this.prepareAiEvidenceAttachments(
          ticketId,
          aiExecution.conversationId,
          aiExecution.resultJson,
          current,
          referencedMessageIds,
        )
      : relations.conversationId
        ? await this.prepareManualConversationAttachments(
            ticketId,
            relations.conversationId,
            current,
            referencedMessageIds,
          )
        : [];
    const copiedImageCount = imageSources.filter(
      (source) => parseTicketImageReference(source)?.kind === "attachment",
    ).length;
    if (aiAttachments.length + copiedImageCount > 10) {
      throw new BadRequestException("A importação permite no máximo 10 anexos por chamado.");
    }
    const copiedImages = await this.prepareReferencedTicketImages(ticketId, imageSources, current);
    aiAttachments.push(...copiedImages);
    if (aiAttachments.length > 10) {
      throw new BadRequestException("A importação permite no máximo 10 anexos por chamado.");
    }
    if (aiAttachments.length) {
      const usage = await this.entitlements.getUsage(current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxStorageBytes",
        usage.storageBytes,
        aiAttachments.reduce((sum, attachment) => sum + attachment.body.byteLength, 0),
      );
    }
    const imageReplacements = new Map<string, string>();
    for (const source of imageSources) {
      const reference = parseTicketImageReference(source)!;
      const attachment = aiAttachments.find((item) =>
        reference.kind === "message"
          ? item.sourceMessageId === reference.messageId
          : item.originalReference === source,
      );
      if (!attachment || !/^image\/(?:png|jpeg|gif|webp)$/i.test(attachment.mimeType)) {
        throw new BadRequestException(
          "Uma imagem da descrição não está disponível para importação.",
        );
      }
      imageReplacements.set(
        source,
        `/ticket-images/tickets/${ticketId}/attachments/${attachment.id}`,
      );
    }
    html = replaceTicketImageSources(html, imageReplacements);
    const storedAiObjectKeys: string[] = [];
    try {
      for (const attachment of aiAttachments) {
        storedAiObjectKeys.push(attachment.objectKey);
        await this.storage.completeUpload({
          objectKey: attachment.objectKey,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.body.byteLength,
          body: attachment.body,
        });
      }
    } catch (error) {
      await Promise.all(
        storedAiObjectKeys.map((key) => this.storage.deleteObject(key).catch(() => undefined)),
      );
      throw error;
    }
    let ticket: TicketWithRelations;
    try {
      ticket = await this.prisma.$transaction(async (tx) => {
        const highestTicket = await tx.ticket.aggregate({
          where: { tenantId: current.tenantId },
          _max: { number: true },
        });
        const highestNumber = highestTicket._max.number ?? 0;
        await tx.ticketProtocolCounter.upsert({
          where: { tenantId: current.tenantId },
          create: { tenantId: current.tenantId, lastNumber: highestNumber },
          update: { lastNumber: { increment: 0 } },
        });
        await tx.ticketProtocolCounter.updateMany({
          where: { tenantId: current.tenantId, lastNumber: { lt: highestNumber } },
          data: { lastNumber: highestNumber },
        });
        const counter = await tx.ticketProtocolCounter.update({
          where: { tenantId: current.tenantId },
          data: { lastNumber: { increment: 1 } },
        });
        const protocol = (
          await nextProtocol(
            tx,
            current.tenantId,
            ProtocolModule.TICKET,
            new Date(),
            counter.lastNumber,
          )
        ).protocol;
        const created = await tx.ticket.create({
          data: {
            id: ticketId,
            tenantId: current.tenantId,
            number: counter.lastNumber,
            protocol,
            title,
            descriptionHtmlSanitized: html,
            descriptionText,
            status: approvalPlan ? TicketStatus.AGUARDANDO_APROVACAO : TicketStatus.NOVO,
            priority: input.priority ?? TicketPriority.NORMAL,
            category: input.category ?? TicketCategory.SUPORTE,
            departmentId,
            assignedMembershipId,
            createdByMembershipId: current.membershipId,
            aiExecutionId: aiExecution?.id ?? null,
            aiAssisted: !!aiExecution,
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
            metadata: aiExecution
              ? {
                  origin: "CHAT_WHATSAPP",
                  aiAssisted: true,
                  aiAgentId: aiExecution.agentId,
                  aiExecutionId: aiExecution.id,
                  aiFunctionality: aiExecution.functionality,
                  conversationId: aiExecution.conversationId,
                }
              : undefined,
          },
        });
        for (const attachment of aiAttachments) {
          await tx.ticketAttachment.create({
            data: {
              id: attachment.id,
              tenantId: current.tenantId,
              ticketId: created.id,
              uploadedByMembershipId: current.membershipId,
              storageProvider: this.storage.provider,
              objectKey: attachment.objectKey,
              originalNameSanitized: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.body.byteLength,
              checksum: attachment.checksum,
              sourceMessageId: attachment.sourceMessageId,
              status: TicketAttachmentStatus.READY,
              scanStatus: attachment.scanStatus,
            },
          });
          await this.recordHistory(
            created.id,
            current,
            "attachment.created.from_chat",
            attachment.sourceMessageId,
            attachment.id,
            tx,
            { aiExecutionId: aiExecution?.id, evidenceOrdinal: attachment.ordinal },
          );
        }
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
        return aiAttachments.length
          ? tx.ticket.findUniqueOrThrow({
              where: { tenantId_id: { tenantId: current.tenantId, id: created.id } },
              include: ticketInclude,
            })
          : created;
      });
    } catch (error) {
      await Promise.all(
        storedAiObjectKeys.map((key) => this.storage.deleteObject(key).catch(() => undefined)),
      );
      throw error;
    }
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
    if (dto.title !== undefined) {
      data.title = await normalizeRegistrationText(
        this.prisma,
        current.tenantId,
        "ticketTitles",
        sanitizePlainText(dto.title, 180),
      );
    }
    if (dto.descriptionHtml !== undefined) {
      const html = sanitizeTicketHtml(dto.descriptionHtml);
      await this.validatePersistedTicketImages(html, existing.id, current);
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
    await this.validatePersistedTicketImages(html, ticket.id, current);
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
    await this.validatePersistedTicketImages(html, ticket.id, current);
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
    await this.validatePersistedTicketImages(html, ticket.id, current);
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
    if (html) await this.validatePersistedTicketImages(html, ticket.id, current);
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
    if (html) await this.validatePersistedTicketImages(html, ticket.id, current);
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
    const requestedCommentId = decodeHeader(req.headers["x-comment-id"]);
    const commentId = requestedCommentId
      ? await this.prisma.ticketComment
          .findFirst({
            where: {
              id: requestedCommentId,
              tenantId: current.tenantId,
              ticketId: ticket.id,
              archivedAt: null,
            },
            select: { id: true },
          })
          .then((comment) => comment?.id ?? null)
      : null;
    if (requestedCommentId && !commentId) {
      throw new BadRequestException("Diálogo do anexo não encontrado neste chamado.");
    }
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
        commentId,
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
          include: {
            uploadedByMembership: {
              select: {
                id: true,
                presentationName: true,
                user: { select: { name: true } },
              },
            },
          },
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
      include: {
        uploadedByMembership: {
          select: {
            id: true,
            presentationName: true,
            user: { select: { name: true } },
          },
        },
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
      customerDepartmentId: query.customerDepartmentId,
      conversationId: query.conversationId,
      originBranchId: query.originBranchId,
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
    // D-008 remains tenant-wide for internal attendants. D-012 defines the
    // customer-portal scope by the access profile stored on the linked contact.
    if (current.roleKey !== "customer_portal") return where;
    const access = await this.portalAccess(current);
    if (
      !access?.active ||
      access.contact.active === false ||
      !access.customerId ||
      !access.accessProfile
    ) {
      return { AND: [where, { id: "__customer_portal_without_active_contact__" }] };
    }
    let scope: Prisma.TicketWhereInput;
    if (!access.branchId || access.branch?.status !== "ACTIVE" || access.branch.archivedAt) {
      return { AND: [where, { id: "__customer_portal_without_active_branch__" }] };
    }
    if (access.accessProfile === CustomerAccessProfile.FULL_ACCESS) {
      scope = { customerId: access.customerId };
    } else {
      if (!access.departmentId || !access.department?.active || access.department.archivedAt) {
        return { AND: [where, { id: "__customer_portal_without_active_assignment__" }] };
      }
      scope =
        access.accessProfile === CustomerAccessProfile.MANAGER
          ? {
              customerId: access.customerId,
              customerDepartmentId: access.departmentId,
            }
          : {
              customerId: access.customerId,
              requesterContactId: access.contactId,
            };
    }
    return { AND: [where, scope] };
  }

  async portalTicketCreateContext(current: AuthenticatedUser) {
    if (current.roleKey !== "customer_portal") {
      throw new ForbiddenException("Contexto disponível somente para o Portal do Cliente.");
    }
    const context = await this.portalCreateContext(current);
    if (!context) throw new ForbiddenException("O acesso do cliente não está configurado.");
    return {
      customer: { id: context.customerId, name: context.customerName },
      department: {
        id: context.customerDepartmentId,
        name: context.customerDepartmentName,
      },
      contact: { id: context.contactId, name: context.contactName },
      branch: { id: context.customerBranchId, name: context.customerBranchName },
      serviceDepartment: {
        id: context.serviceDepartmentId,
        name: context.serviceDepartmentName,
      },
    };
  }

  private async portalCreateContext(current: AuthenticatedUser) {
    if (current.roleKey !== "customer_portal") return null;
    const access = await this.portalAccess(current);
    if (
      !access?.active ||
      access.contact.active === false ||
      !access.customerId ||
      !access.accessProfile
    ) {
      throw new ForbiddenException("O acesso do cliente não está ativo ou configurado.");
    }
    const customerDepartmentId =
      access.departmentId ?? access.contact.customerDepartment?.id ?? null;
    const customerBranchId = access.branchId;
    if (!customerBranchId)
      throw new ForbiddenException(
        "O acesso do cliente precisa estar vinculado a uma filial ativa.",
      );
    if (!customerDepartmentId)
      throw new ForbiddenException(
        "O contato precisa estar vinculado a um departamento ativo para abrir chamados.",
      );
    const [customerDepartment, customerBranch] = await Promise.all([
      this.prisma.customerDepartment.findFirst({
        where: {
          id: customerDepartmentId,
          tenantId: current.tenantId,
          customerId: access.customerId,
          active: true,
          archivedAt: null,
        },
        select: { id: true, name: true },
      }),
      this.prisma.customerBranch.findFirst({
        where: {
          id: customerBranchId,
          tenantId: current.tenantId,
          customerId: access.customerId,
          status: "ACTIVE",
          archivedAt: null,
        },
        select: { id: true, name: true },
      }),
    ]);
    if (!customerDepartment || !customerBranch) {
      throw new ForbiddenException("A filial ou o departamento selecionado não está ativo.");
    }
    const matchedServiceDepartment = await this.prisma.department.findFirst({
      where: {
        tenantId: current.tenantId,
        active: true,
        name: { equals: customerDepartment.name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    const serviceDepartment =
      matchedServiceDepartment ??
      (await this.prisma.department.findFirst({
        where: {
          tenantId: current.tenantId,
          active: true,
          name: { equals: "Atendimento", mode: "insensitive" },
        },
        select: { id: true, name: true },
      }));
    if (!serviceDepartment) {
      throw new ConflictException({ code: "TICKET_SERVICE_DEPARTMENT_MAPPING_REQUIRED" });
    }
    return {
      contactId: access.contactId,
      contactName: access.contact.name,
      customerId: access.customerId,
      customerName: access.customer.name,
      customerDepartmentId,
      customerDepartmentName: customerDepartment.name,
      customerBranchId,
      customerBranchName: customerBranch.name,
      serviceDepartmentId: serviceDepartment.id,
      serviceDepartmentName: serviceDepartment.name,
    };
  }

  private portalAccess(current: AuthenticatedUser) {
    if (!current.portalAccessId) return Promise.resolve(null);
    return this.prisma.customerPortalAccess.findFirst({
      where: {
        id: current.portalAccessId,
        tenantId: current.tenantId,
        membershipId: current.membershipId,
        active: true,
        revokedAt: null,
        contact: { active: true, archivedAt: null },
        customer: { status: "ACTIVE", archivedAt: null },
        branch: { status: "ACTIVE", archivedAt: null },
        OR: [
          { accessProfile: CustomerAccessProfile.FULL_ACCESS },
          { department: { active: true, archivedAt: null } },
        ],
      },
      include: {
        customer: { select: { id: true, name: true } },
        contact: {
          select: {
            id: true,
            name: true,
            active: true,
            archivedAt: true,
            customerDepartment: { select: { id: true, name: true } },
          },
        },
        department: { select: { id: true, name: true, active: true, archivedAt: true } },
        branch: { select: { id: true, name: true, status: true, archivedAt: true } },
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
        },
      });
      if (!contact) throw new BadRequestException("Contact inválido.");
      if (dto.customerId && contact.customerId && dto.customerId !== contact.customerId) {
        throw new BadRequestException("Solicitante não pertence ao cliente informado.");
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
    await this.validatePersistedTicketImages(html, ticket.id, current);
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
      const contractManager = await this.prisma.customerPortalAccess.findFirst({
        where: {
          tenantId: current.tenantId,
          customerId,
          accessProfile: CustomerAccessProfile.FULL_ACCESS,
          active: true,
          revokedAt: null,
          contact: { active: true, archivedAt: null },
        },
        select: { contactId: true },
      });
      if (!contractManager) {
        throw new ConflictException({ code: "TICKET_CONTRACT_MANAGER_REQUIRED" });
      }
      return {
        kind: TicketApprovalKind.DEVELOPMENT,
        approverContactId: contractManager.contactId,
      };
    }
    if (!requesterContactId) return null;
    const requester = await this.prisma.customerPortalAccess.findFirst({
      where: {
        tenantId: current.tenantId,
        contactId: requesterContactId,
        customerId: customerId ?? undefined,
        active: true,
        revokedAt: null,
      },
      select: { accessProfile: true },
    });
    if (requester?.accessProfile !== CustomerAccessProfile.COLLABORATOR) return null;
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
      select: { id: true },
    });
    if (!department) {
      throw new ConflictException({ code: "TICKET_CUSTOMER_DEPARTMENT_REQUIRED" });
    }
    const manager = await this.prisma.customerPortalAccess.findFirst({
      where: {
        tenantId: current.tenantId,
        customerId: customerId ?? undefined,
        departmentId: department.id,
        accessProfile: CustomerAccessProfile.MANAGER,
        active: true,
        revokedAt: null,
        contact: { active: true, archivedAt: null },
      },
      select: { contactId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!manager) {
      throw new ConflictException({ code: "TICKET_DEPARTMENT_MANAGER_REQUIRED" });
    }
    return { kind: TicketApprovalKind.SUPPORT, approverContactId: manager.contactId };
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
          archivedAt: null,
          customerPortalAccesses: {
            some: {
              customerId: ticket.customerId ?? undefined,
              active: true,
            },
          },
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
    if (actor.customerAccessProfile === CustomerAccessProfile.FULL_ACCESS) return;
    if (
      actor.customerAccessProfile === CustomerAccessProfile.MANAGER &&
      actor.customerDepartmentId &&
      actor.customerDepartmentId === ticket.customerDepartmentId
    )
      return;
    if (
      actor.customerAccessProfile === CustomerAccessProfile.COLLABORATOR &&
      actor.id === ticket.requesterContactId
    )
      return;
    throw new ForbiddenException("Usuário não autorizado a validar esta solução.");
  }

  private async actorCustomerContact(current: AuthenticatedUser) {
    if (current.roleKey !== "customer_portal" || !current.portalAccessId) return null;
    const access = await this.portalAccess(current);
    if (!access?.active || !access.contact.active || access.contact.archivedAt) return null;
    return {
      id: access.contactId,
      customerId: access.customerId,
      customerDepartmentId: access.departmentId,
      customerAccessProfile: access.accessProfile,
    };
  }

  private isCustomerActor(current: AuthenticatedUser) {
    return current.roleKey.startsWith("customer_");
  }

  private async prepareAiEvidenceAttachments(
    ticketId: string,
    conversationId: string,
    resultJson: Prisma.JsonValue,
    current: AuthenticatedUser,
    referencedImageIds: string[] = [],
  ): Promise<PreparedTicketAttachment[]> {
    const result = jsonRecord(resultJson);
    const evidence = Array.isArray(result.evidence) ? result.evidence : [];
    const ordinalByMessageId = new Map<string, number>();
    for (const item of evidence) {
      const record = jsonRecord(item);
      const messageId = typeof record.messageId === "string" ? record.messageId : "";
      const ordinal = Number(record.ordinal);
      if (messageId && !ordinalByMessageId.has(messageId)) {
        ordinalByMessageId.set(
          messageId,
          Number.isFinite(ordinal) ? ordinal : ordinalByMessageId.size + 1,
        );
      }
    }
    const messageIds = [
      ...new Set([...ordinalByMessageId.keys()].slice(0, 10).concat(referencedImageIds)),
    ];
    if (messageIds.length > 10) {
      throw new BadRequestException("A importação permite no máximo 10 anexos por chamado.");
    }
    if (!messageIds.length) return [];
    await this.entitlements.assertFeature(current.tenantId, "storage");
    const messages = await this.prisma.message.findMany({
      where: {
        tenantId: current.tenantId,
        conversationId,
        id: { in: messageIds },
        mediaStorageKey: { not: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        mediaStorageKey: true,
        mediaMimeType: true,
        mediaFileName: true,
        mediaChecksum: true,
      },
    });
    if (
      referencedImageIds.some(
        (id) =>
          !messages.some(
            (message) =>
              message.id === id &&
              /^image\/(?:png|jpeg|gif|webp)$/i.test(message.mediaMimeType ?? ""),
          ),
      )
    ) {
      throw new BadRequestException("Uma imagem da descrição não está disponível para importação.");
    }
    const prepared: PreparedTicketAttachment[] = [];
    let totalSize = 0;
    for (const message of messages) {
      const mimeType = (message.mediaMimeType ?? "application/octet-stream").toLowerCase();
      const body = await this.messagingMediaStorage.readObject(message.mediaStorageKey!);
      this.validateAttachment(mimeType, body.byteLength);
      const detectedMimeType = detectMimeType(body, mimeType);
      if (detectedMimeType !== mimeType) {
        throw canonicalException(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          "ATTACHMENT_MIME_MISMATCH",
          "Uma evidência da conversa possui tipo de arquivo inválido.",
        );
      }
      totalSize += body.byteLength;
      const id = randomUUID();
      const fileName = sanitizeFileName(
        message.mediaFileName ?? `evidencia-${prepared.length + 1}`,
      );
      prepared.push({
        id,
        sourceMessageId: message.id,
        ordinal: ordinalByMessageId.get(message.id) ?? prepared.length + 1,
        objectKey: `tenants/${current.tenantId}/tickets/${ticketId}/${id}/${fileName}`,
        fileName,
        mimeType,
        body,
        checksum: message.mediaChecksum ?? createHash("sha256").update(body).digest("hex"),
        scanStatus: await this.scanner.scan(),
      });
    }
    const usage = await this.entitlements.getUsage(current.tenantId);
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxStorageBytes",
      usage.storageBytes,
      totalSize,
    );
    return prepared;
  }

  private async prepareManualConversationAttachments(
    ticketId: string,
    conversationId: string,
    current: AuthenticatedUser,
    referencedImageIds: string[] = [],
  ): Promise<PreparedTicketAttachment[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        tenantId: current.tenantId,
        conversationId,
        mediaStorageKey: { not: null },
        mediaMimeType: { not: null },
        NOT: { mediaMimeType: { startsWith: "image/", mode: "insensitive" } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
      select: { id: true },
    });
    if (!messages.length && !referencedImageIds.length) return [];
    return this.prepareAiEvidenceAttachments(
      ticketId,
      conversationId,
      {
        evidence: messages.map((message, index) => ({
          messageId: message.id,
          ordinal: index + 1,
        })),
      },
      current,
      referencedImageIds,
    );
  }

  private async validatePersistedTicketImages(
    html: string,
    ticketId: string,
    current: AuthenticatedUser,
  ) {
    for (const source of ticketImageSources(html)) {
      const reference = parseTicketImageReference(source)!;
      if (reference.kind !== "attachment" || reference.ticketId !== ticketId) {
        throw new BadRequestException("A imagem não pertence a este chamado.");
      }
      const attachment = await this.findAttachment(ticketId, reference.attachmentId, current);
      if (
        attachment.status !== TicketAttachmentStatus.READY ||
        attachment.deletedAt ||
        !/^image\/(?:png|jpeg|gif|webp)$/i.test(attachment.mimeType)
      ) {
        throw new BadRequestException("Imagem do chamado indisponível.");
      }
    }
  }

  private async prepareReferencedTicketImages(
    ticketId: string,
    sources: string[],
    current: AuthenticatedUser,
  ): Promise<PreparedTicketAttachment[]> {
    const references = sources
      .map((source) => ({ source, reference: parseTicketImageReference(source)! }))
      .filter((item) => item.reference.kind === "attachment");
    if (references.length > 10)
      throw new BadRequestException("A importação permite no máximo 10 anexos por chamado.");
    if (references.length && !current.permissions?.includes("tickets.read")) {
      throw new ForbiddenException("Sem permissão para copiar imagens de chamados.");
    }
    if (references.length) await this.entitlements.assertFeature(current.tenantId, "storage");
    const prepared: PreparedTicketAttachment[] = [];
    for (const { source, reference } of references) {
      if (reference.kind !== "attachment") continue;
      // Cloning copies an authorized image into storage owned by the new ticket.
      await this.findVisibleTicket(reference.ticketId, current);
      const attachment = await this.findAttachment(
        reference.ticketId,
        reference.attachmentId,
        current,
      );
      if (
        attachment.status !== TicketAttachmentStatus.READY ||
        attachment.deletedAt ||
        !/^image\/(?:png|jpeg|gif|webp)$/i.test(attachment.mimeType)
      ) {
        throw new BadRequestException("Imagem do chamado indisponível.");
      }
      const body = (await this.storage.getDownloadObject(attachment.objectKey)).body;
      this.validateAttachment(attachment.mimeType, body.byteLength);
      if (detectMimeType(body, attachment.mimeType) !== attachment.mimeType) {
        throw new BadRequestException("Uma imagem do chamado possui tipo de arquivo inválido.");
      }
      const id = randomUUID();
      const fileName = sanitizeFileName(attachment.originalNameSanitized);
      prepared.push({
        id,
        originalReference: source,
        sourceMessageId: attachment.sourceMessageId,
        ordinal: prepared.length + 1,
        fileName,
        mimeType: attachment.mimeType,
        body,
        checksum: createHash("sha256").update(body).digest("hex"),
        scanStatus: await this.scanner.scan(),
        objectKey: `tenants/${current.tenantId}/tickets/${ticketId}/${id}/${fileName}`,
      });
    }
    return prepared;
  }

  private assertInternalActor(current: AuthenticatedUser) {
    if (this.isCustomerActor(current)) {
      throw new ForbiddenException("Ação disponível apenas para a equipe de atendimento.");
    }
  }

  private validateAttachment(mimeType: string, sizeBytes: number) {
    if (!ticketAttachmentMimeTypes.has(mimeType)) {
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

const ticketAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/vcard",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "video/mp4",
  "video/3gpp",
  "video/webm",
]);

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
    createdByMembership: serializeHistoricalMembership(
      ticket.createdByMembership,
      ticket.createdByNameSnapshot,
    ),
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

function serializeHistoricalMembership(
  membership: { id: string; user: { id: string; name: string; email: string } } | null,
  nameSnapshot: string | null,
) {
  if (membership) return serializeMembership(membership);
  return {
    id: "deleted",
    user: {
      id: "deleted",
      name: nameSnapshot?.trim() || "Atendente removido",
      email: "",
    },
  };
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
  authorMembership: { id: string; user: { id: string; name: string; email: string } } | null;
  authorNameSnapshot: string | null;
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
    authorMembership: serializeHistoricalMembership(
      comment.authorMembership,
      comment.authorNameSnapshot,
    ),
  };
}

function serializeAttachment(attachment: {
  id: string;
  commentId?: string | null;
  uploadedByMembershipId?: string | null;
  uploadedByNameSnapshot?: string | null;
  uploadedByMembership?: {
    id: string;
    presentationName: string | null;
    user: { name: string };
  } | null;
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
    commentId: attachment.commentId ?? null,
    uploadedBy: {
      id: attachment.uploadedByMembership?.id ?? attachment.uploadedByMembershipId ?? "deleted",
      name:
        attachment.uploadedByMembership?.presentationName?.trim() ||
        attachment.uploadedByMembership?.user.name ||
        attachment.uploadedByNameSnapshot?.trim() ||
        "Usuário removido",
    },
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

function customerPortalIdentityEmail(tenantId: string, contactId: string, email?: string | null) {
  const registeredEmail = email?.trim().toLowerCase();
  if (registeredEmail) return registeredEmail;
  const identityHash = createHash("sha256")
    .update(`${tenantId}:${contactId}`)
    .digest("hex")
    .slice(0, 40);
  return `portal-${identityHash}@identity.trixus.invalid`;
}

function portalDeliveryErrorMessage(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = response.message;
      if (typeof message === "string") return message;
      if (Array.isArray(message)) return message.join(" ");
    }
  }
  return error instanceof Error ? error.message : "Falha ao enviar o acesso.";
}

function customerPortalWhatsAppInvitation(input: {
  contactName: string;
  customerName: string;
  login: string;
  profileName: string;
  departmentName: string;
  branchName: string;
  acceptUrl: string;
  expiresAt: Date;
}) {
  const expiresAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(input.expiresAt);
  return [
    `Olá, ${input.contactName}!`,
    "",
    `Seu acesso ao Portal do Cliente da ${input.customerName} foi criado.`,
    "",
    "Dados do acesso:",
    `Nome: ${input.contactName}`,
    `Login: ${input.login}`,
    `Perfil: ${input.profileName}`,
    `Departamento: ${input.departmentName}`,
    `Filial: ${input.branchName}`,
    "",
    `Crie sua senha e acesse: ${input.acceptUrl}`,
    "",
    `Este link é válido até ${expiresAt}.`,
  ].join("\n");
}

function customerPortalWhatsAppRemoval(input: {
  contactName: string;
  customerName: string;
  login: string;
  profileName: string;
  departmentName: string;
  branchName: string;
}) {
  return [
    `Olá, ${input.contactName}!`,
    "",
    `Informamos que seu acesso ao Portal do Cliente da ${input.customerName} foi removido.`,
    "",
    "Dados do acesso removido:",
    `Nome: ${input.contactName}`,
    `Login: ${input.login}`,
    `Perfil: ${input.profileName}`,
    `Departamento: ${input.departmentName}`,
    `Filial: ${input.branchName}`,
    "",
    "A partir de agora, este login não poderá mais acessar o portal dessa empresa.",
    "Em caso de dúvida, entre em contato com a empresa responsável pelo seu acesso.",
  ].join("\n");
}

function customerPortalAccessProfileLabel(value: CustomerAccessProfile) {
  if (value === CustomerAccessProfile.FULL_ACCESS) return "Acesso Full";
  if (value === CustomerAccessProfile.MANAGER) return "Gerente";
  return "Colaborador";
}

function aggregateDashboardDimension(
  values: Array<{ id: string | null; label: string | null | undefined }>,
  fallbackLabel: string,
) {
  const counts = new Map<string, { id: string | null; label: string; count: number }>();
  for (const value of values) {
    const key = value.id ?? "__none__";
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        id: value.id,
        label: value.label?.trim() || fallbackLabel,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, "pt-BR"),
  );
}

function ticketCategoryLabel(value: TicketCategory) {
  if (value === TicketCategory.DEV) return "Desenvolvimento";
  if (value === TicketCategory.FINANCEIRO) return "Financeiro";
  if (value === TicketCategory.OPERACIONAL) return "Operacional";
  return "Suporte";
}

function ticketPriorityLabel(value: TicketPriority) {
  if (value === TicketPriority.BAIXA) return "Baixa";
  if (value === TicketPriority.ALTA || value === TicketPriority.URGENTE) return "Alta";
  if (value === TicketPriority.ALTISSIMA) return "Altíssima";
  return "Média";
}

function exposeLocalTokens() {
  return process.env.NODE_ENV !== "production" && process.env.EXPOSE_LOCAL_AUTH_TOKENS === "true";
}

function tenantAppUrl() {
  return (
    process.env.TRIXUS_TENANT_APP_URL ??
    process.env.TRIXUS_PUBLIC_APP_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
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
