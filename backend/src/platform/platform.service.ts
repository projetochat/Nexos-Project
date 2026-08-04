import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";
import { CampaignDispatchQueue } from "../campaigns/campaign-dispatch.queue";
import { readPositiveInteger } from "../campaigns/campaign-config";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { Prisma, SubscriptionStatus, TenantStatus } from "../generated/prisma";
import {
  evolutionConfigFromEnv,
  assertEvolutionConfigured,
} from "../messaging/evolution/evolution.config";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingOutboundQueue } from "../queue/messaging-outbound.queue";
import { RealtimeService } from "../realtime/realtime.service";
import { FileStorageProvider } from "../tickets/storage/file-storage.provider";
import { seedTenantRoles } from "./tenant-role-seed";
import { PlatformAuditService } from "./platform-audit.service";
import { coerceFeatures, coerceLimits, PlanEntitlementService } from "./plan-entitlement.service";
import type {
  CancelSubscriptionDto,
  CreateInvoiceDto,
  CreatePlanDto,
  CreateSubscriptionDto,
  CreateTenantDto,
  InvoiceStatusDto,
  PlatformListQueryDto,
  ReasonDto,
  StartImpersonationDto,
  TerminateTenantDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  UpdateTenantDto,
} from "./platform.dto";

const activeSubscriptionStatuses: SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
];

const tenantTransitions: Record<TenantStatus, TenantStatus[]> = {
  PROVISIONING: ["TRIAL", "ACTIVE", "SUSPENDED"],
  TRIAL: ["ACTIVE", "SUSPENDED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED"],
  PAST_DUE: ["ACTIVE", "SUSPENDED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

@Injectable()
export class PlatformService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MessagingOutboundQueue) private readonly outboundQueue: MessagingOutboundQueue,
    @Inject(CampaignDispatchQueue) private readonly campaignQueue: CampaignDispatchQueue,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(FileStorageProvider) private readonly storage: FileStorageProvider,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async dashboard() {
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [
      activeTenants,
      trialTenants,
      suspendedTenants,
      activeUsers,
      activeConnections,
      messagesThisPeriod,
      campaignsThisPeriod,
      openTickets,
      openInvoices,
      overdueInvoices,
      plans,
    ] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where: { status: "ACTIVE" } }),
      this.prisma.tenant.count({ where: { status: "TRIAL" } }),
      this.prisma.tenant.count({ where: { status: "SUSPENDED" } }),
      this.prisma.tenantMembership.count({
        where: { status: "ACTIVE", user: { status: "ACTIVE" } },
      }),
      this.prisma.messagingConnection.count({ where: { status: "CONNECTED" } }),
      this.prisma.message.count({ where: { createdAt: { gte: periodStart } } }),
      this.prisma.campaign.count({ where: { createdAt: { gte: periodStart } } }),
      this.prisma.ticket.count({
        where: { archivedAt: null, status: { notIn: ["FECHADO", "CANCELADO"] } },
      }),
      this.prisma.invoice.count({ where: { status: "OPEN" } }),
      this.prisma.invoice.count({ where: { status: "OVERDUE" } }),
      this.prisma.plan.findMany({
        where: { status: { not: "ARCHIVED" } },
        include: { _count: { select: { subscriptions: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      activeTenants,
      trialTenants,
      suspendedTenants,
      activeUsers,
      activeConnections,
      messagesThisPeriod,
      campaignsThisPeriod,
      openTickets,
      openInvoices,
      overdueInvoices,
      subscriptionsByPlan: plans.map((plan) => ({
        planId: plan.id,
        code: plan.code,
        name: plan.name,
        subscriptions: plan._count.subscriptions,
      })),
    };
  }

  async listTenants(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    const q = query.q?.trim();
    const where: Prisma.TenantWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
          _count: { select: { users: true, messagingConnections: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginated(
      items.map((tenant) => serializeTenant(tenant)),
      total,
      page,
      pageSize,
    );
  }

  async tenantDetail(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 3, include: { plan: true } },
        users: {
          include: { user: true, role: true, departments: { include: { department: true } } },
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        departments: { take: 20, orderBy: { name: "asc" } },
        messagingConnections: { take: 20, orderBy: { createdAt: "desc" } },
        invoices: { take: 10, orderBy: { createdAt: "desc" } },
        auditLogs: { take: 20, orderBy: { createdAt: "desc" } },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant nao encontrado.");
    return {
      ...serializeTenant(tenant),
      usage: await this.entitlements.getUsage(id),
      detail: tenant,
    };
  }

  async createTenant(dto: CreateTenantDto, current: AuthenticatedUser) {
    const slug = normalizeSlug(dto.slug);
    const plan = await this.activePlanOrThrow(dto.planId);
    const passwordHash = await hash(dto.admin.password, 12);
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          legalName: dto.name.trim(),
          displayName: dto.name.trim(),
          slug,
          status: "TRIAL",
          timezone: dto.timezone ?? "America/Sao_Paulo",
          locale: dto.locale ?? "pt-BR",
          activatedAt: new Date(),
        },
      });
      const roles = await seedTenantRoles(tx, tenant.id);
      const user = await tx.user.upsert({
        where: { email: dto.admin.email.toLowerCase().trim() },
        update: { name: dto.admin.name.trim(), passwordHash, status: "ACTIVE" },
        create: {
          email: dto.admin.email.toLowerCase().trim(),
          name: dto.admin.name.trim(),
          passwordHash,
          status: "ACTIVE",
        },
      });
      const membership = await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, roleId: roles.tenant_admin.id },
      });
      const subscription = await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "TRIALING",
          trialEndsAt: addDays(new Date(), plan.trialDays || 14),
          currentPeriodEnd: addDays(new Date(), 30),
          limitsSnapshot: coerceLimits(plan.limits),
          featuresSnapshot: coerceFeatures(plan.features),
          createdByUserId: current.userId,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          tenantId: tenant.id,
          nextPlanId: plan.id,
          nextStatus: subscription.status,
          reason: "tenant.created",
          actorUserId: current.userId,
        },
      });
      return { tenant, membership, subscription };
    });
    await this.audit.record({
      actor: current,
      action: "tenant.created",
      targetType: "tenant",
      targetId: created.tenant.id,
      tenantId: created.tenant.id,
      metadata: { slug, planId: plan.id, membershipId: created.membership.id },
    });
    return this.tenantDetail(created.tenant.id);
  }

  async updateTenant(id: string, dto: UpdateTenantDto, current: AuthenticatedUser) {
    await this.requireTenant(id);
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        legalName: nullable(dto.legalName),
        displayName: nullable(dto.displayName),
        billingEmail: nullable(dto.billingEmail),
        technicalEmail: nullable(dto.technicalEmail),
      },
    });
    await this.audit.record({
      actor: current,
      action: "tenant.updated",
      targetType: "tenant",
      targetId: id,
      tenantId: id,
    });
    return tenant;
  }

  suspendTenant(id: string, dto: ReasonDto, current: AuthenticatedUser) {
    return this.transitionTenant(id, "SUSPENDED", dto.reason, current, "tenant.suspended");
  }

  reactivateTenant(id: string, dto: ReasonDto, current: AuthenticatedUser) {
    return this.transitionTenant(id, "ACTIVE", dto.reason, current, "tenant.reactivated");
  }

  async terminateTenant(id: string, dto: TerminateTenantDto, current: AuthenticatedUser) {
    const tenant = await this.requireTenant(id);
    if (dto.confirmSlug !== tenant.slug)
      throw new BadRequestException({ code: "TENANT_CONFIRMATION_INVALID" });
    return this.transitionTenant(id, "TERMINATED", dto.reason, current, "tenant.terminated");
  }

  async usage(id: string) {
    await this.requireTenant(id);
    const [usage, entitlements] = await Promise.all([
      this.entitlements.getUsage(id),
      this.entitlements.getEntitlements(id),
    ]);
    return { tenantId: id, usage, entitlements };
  }

  listPlans(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    return this.prisma.plan
      .findMany({
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        include: { _count: { select: { subscriptions: true } } },
      })
      .then(async (items) => paginated(items, await this.prisma.plan.count(), page, pageSize));
  }

  async planDetail(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        subscriptions: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: { tenant: { select: { id: true, slug: true, name: true, status: true } } },
        },
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) throw new NotFoundException("Plano nao encontrado.");
    return plan;
  }

  async createPlan(dto: CreatePlanDto, current: AuthenticatedUser) {
    const data = validatePlanConfig(dto.features, dto.limits);
    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code.toLowerCase().trim(),
        name: dto.name.trim(),
        description: nullable(dto.description),
        status: dto.status ?? "DRAFT",
        billingPeriod: dto.billingPeriod ?? "MANUAL",
        priceCents: dto.priceCents,
        features: data.features,
        limits: data.limits,
      },
    });
    await this.audit.record({
      actor: current,
      action: "plan.created",
      targetType: "plan",
      targetId: plan.id,
      metadata: { code: plan.code },
    });
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto, current: AuthenticatedUser) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plano nao encontrado.");
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: nullable(dto.description),
        status: dto.status,
        ...(dto.features || dto.limits
          ? validatePlanConfig(dto.features ?? existing.features, dto.limits ?? existing.limits)
          : {}),
      },
    });
    await this.audit.record({
      actor: current,
      action: "plan.updated",
      targetType: "plan",
      targetId: id,
    });
    return plan;
  }

  async archivePlan(id: string, current: AuthenticatedUser) {
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await this.audit.record({
      actor: current,
      action: "plan.archived",
      targetType: "plan",
      targetId: id,
    });
    return plan;
  }

  async createSubscription(
    tenantId: string,
    dto: CreateSubscriptionDto,
    current: AuthenticatedUser,
  ) {
    await this.requireTenant(tenantId);
    const plan = await this.activePlanOrThrow(dto.planId);
    const subscription = await this.prisma.$transaction(async (tx) => {
      await tx.tenantSubscription.updateMany({
        where: { tenantId, status: { in: activeSubscriptionStatuses } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      const created = await tx.tenantSubscription.create({
        data: {
          tenantId,
          planId: plan.id,
          status: dto.status ?? "ACTIVE",
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : addDays(new Date(), 30),
          limitsSnapshot: coerceLimits(plan.limits),
          featuresSnapshot: coerceFeatures(plan.features),
          createdByUserId: current.userId,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: created.id,
          tenantId,
          nextPlanId: plan.id,
          nextStatus: created.status,
          reason: dto.reason ?? "subscription.created",
          actorUserId: current.userId,
        },
      });
      return created;
    });
    await this.audit.record({
      actor: current,
      action: "subscription.created",
      targetType: "subscription",
      targetId: subscription.id,
      tenantId,
    });
    return subscription;
  }

  listSubscriptions(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    return this.prisma.tenantSubscription
      .findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { tenant: true, plan: true },
      })
      .then(async (items) =>
        paginated(items, await this.prisma.tenantSubscription.count(), page, pageSize),
      );
  }

  async subscriptionDetail(id: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: {
        tenant: true,
        plan: true,
        history: { orderBy: { createdAt: "desc" }, take: 50 },
        invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!subscription) throw new NotFoundException("Assinatura nao encontrada.");
    return subscription;
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!existing) throw new NotFoundException("Assinatura nao encontrada.");
    let nextPlan = existing.plan;
    if (dto.planId && dto.planId !== existing.planId) {
      nextPlan = await this.activePlanOrThrow(dto.planId);
      await this.assertDowngradeAllowed(existing.tenantId, nextPlan.limits);
    }
    const updated = await this.prisma.tenantSubscription.update({
      where: { id },
      data: {
        planId: nextPlan.id,
        status: dto.status,
        limitsSnapshot: coerceLimits(nextPlan.limits),
        featuresSnapshot: coerceFeatures(nextPlan.features),
      },
    });
    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        tenantId: existing.tenantId,
        previousPlanId: existing.planId,
        nextPlanId: updated.planId,
        previousStatus: existing.status,
        nextStatus: updated.status,
        reason: dto.reason ?? "subscription.changed",
        actorUserId: current.userId,
      },
    });
    await this.audit.record({
      actor: current,
      action: "subscription.changed",
      targetType: "subscription",
      targetId: id,
      tenantId: existing.tenantId,
    });
    return updated;
  }

  async cancelSubscription(id: string, dto: CancelSubscriptionDto, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Assinatura nao encontrada.");
    const updated = await this.prisma.tenantSubscription.update({
      where: { id },
      data: dto.cancelAtPeriodEnd
        ? { cancelAtPeriodEnd: true }
        : { status: "CANCELLED", cancelledAt: new Date() },
    });
    await this.audit.record({
      actor: current,
      action: "subscription.cancelled",
      targetType: "subscription",
      targetId: id,
      tenantId: existing.tenantId,
      metadata: { cancelAtPeriodEnd: !!dto.cancelAtPeriodEnd },
    });
    return updated;
  }

  history(id: string) {
    return this.prisma.subscriptionHistory.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  listInvoices(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    return this.prisma.invoice
      .findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { tenant: true, subscription: { include: { plan: true } } },
      })
      .then(async (items) => paginated(items, await this.prisma.invoice.count(), page, pageSize));
  }

  async invoiceDetail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { tenant: true, subscription: { include: { plan: true } } },
    });
    if (!invoice) throw new NotFoundException("Fatura nao encontrada.");
    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto, current: AuthenticatedUser) {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: { id: dto.subscriptionId, tenantId: dto.tenantId },
    });
    if (!subscription) throw new BadRequestException("Assinatura invalida para o tenant.");
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: dto.tenantId,
        subscriptionId: dto.subscriptionId,
        number: await this.nextInvoiceNumber(),
        currency: dto.currency ?? "BRL",
        subtotalCents: dto.subtotalCents,
        discountCents: dto.discountCents ?? 0,
        totalCents: Math.max(0, dto.subtotalCents - (dto.discountCents ?? 0)),
        dueAt: new Date(dto.dueAt),
      },
    });
    await this.audit.record({
      actor: current,
      action: "invoice.created",
      targetType: "invoice",
      targetId: invoice.id,
      tenantId: invoice.tenantId,
    });
    return invoice;
  }

  async updateInvoiceStatus(id: string, dto: InvoiceStatusDto, current: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === "PAID" ? new Date() : undefined,
        cancelledAt: dto.status === "VOID" ? new Date() : undefined,
      },
    });
    await this.audit.record({
      actor: current,
      action: "invoice.status.changed",
      targetType: "invoice",
      targetId: id,
      tenantId: invoice.tenantId,
      metadata: { status: dto.status },
    });
    return invoice;
  }

  listAudit(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    return this.prisma.platformAuditLog
      .findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, email: true, name: true } },
          tenant: { select: { id: true, slug: true, name: true } },
        },
      })
      .then(async (items) =>
        paginated(items, await this.prisma.platformAuditLog.count(), page, pageSize),
      );
  }

  async auditDetail(id: string) {
    const log = await this.prisma.platformAuditLog.findUnique({
      where: { id },
      include: {
        actor: { select: { id: true, email: true, name: true } },
        tenant: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!log) throw new NotFoundException("Evento de auditoria nao encontrado.");
    return log;
  }

  async startImpersonation(dto: StartImpersonationDto, current: AuthenticatedUser) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: dto.membershipId,
        tenantId: dto.tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      include: { tenant: true },
    });
    if (!membership) throw new BadRequestException("Membership invalida para impersonacao.");
    const ttl = readPositiveInteger(this.config, "NEXOS_IMPERSONATION_TTL_MINUTES", 15);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.impersonationSession.updateMany({
        where: { actorUserId: current.userId, status: "ACTIVE" },
        data: { status: "STOPPED", stoppedAt: new Date() },
      });
      return tx.impersonationSession.create({
        data: {
          actorUserId: current.userId,
          tenantId: dto.tenantId,
          impersonatedMembershipId: dto.membershipId,
          reason: dto.reason.trim(),
          expiresAt: new Date(Date.now() + ttl * 60_000),
        },
      });
    });
    await this.audit.record({
      actor: current,
      action: "impersonation.started",
      targetType: "impersonation",
      targetId: session.id,
      tenantId: dto.tenantId,
      impersonationSessionId: session.id,
      metadata: { reason: dto.reason },
    });
    const tokens = await this.auth.issueImpersonationTokens({
      actorPlatformUserId: current.userId,
      impersonationSessionId: session.id,
      membershipId: dto.membershipId,
    });
    return { ...session, tenant: membership.tenant, membership, tokens };
  }

  async stopImpersonation(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.impersonationSession.findFirst({
      where: { id, actorUserId: current.userId },
    });
    if (!existing) throw new NotFoundException("Sessao de impersonacao nao encontrada.");
    const session = await this.prisma.impersonationSession.update({
      where: { id: existing.id },
      data: { status: "STOPPED", stoppedAt: new Date() },
    });
    await this.audit.record({
      actor: current,
      action: "impersonation.stopped",
      targetType: "impersonation",
      targetId: id,
      tenantId: session.tenantId,
      impersonationSessionId: id,
    });
    return session;
  }

  currentImpersonation(current: AuthenticatedUser) {
    return this.prisma.impersonationSession.findFirst({
      where: { actorUserId: current.userId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { tenant: true },
    });
  }

  async health() {
    const database = await this.prisma.$queryRaw`SELECT 1`
      .then(() => "up" as const)
      .catch(() => "down" as const);
    const outbound = await this.outboundQueue
      .health()
      .then((result) => ({ status: result.ok ? "up" : "down", configured: result.configured }))
      .catch(() => ({ status: "down", configured: true }));
    const campaign = await this.campaignQueue
      .health()
      .then((result) => ({ status: result.ok ? "up" : "down", configured: result.configured }))
      .catch(() => ({ status: "down", configured: true }));
    const realtime = this.realtime.health();
    const evolution = evolutionConfigFromEnv();
    return {
      ok: database === "up",
      database,
      redis: outbound.status,
      outboundQueue: outbound,
      campaignQueue: campaign,
      workers: {
        outbound:
          this.config.get<string>("NEXOS_QUEUE_WORKER_ENABLED") === "true"
            ? "configured"
            : "disabled",
        campaign: this.campaignQueue.enabled() ? "configured" : "disabled",
      },
      realtime: { status: realtime.status, adapter: realtime.adapter },
      evolution: { status: assertEvolutionConfigured(evolution) ? "configured" : "degraded" },
      storage: { status: "up", provider: this.storage.provider },
      campaignScheduler: this.campaignQueue.enabled() ? "configured" : "disabled",
      timestamp: new Date().toISOString(),
    };
  }

  private async transitionTenant(
    id: string,
    next: TenantStatus,
    reason: string,
    current: AuthenticatedUser,
    action: string,
  ) {
    const tenant = await this.requireTenant(id);
    if (tenant.status !== next && !tenantTransitions[tenant.status].includes(next)) {
      throw new ConflictException({ code: "TENANT_STATUS_TRANSITION_INVALID" });
    }
    const now = new Date();
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: next,
        authRevokedAt: now,
        suspensionReason: next === "SUSPENDED" ? reason : next === "ACTIVE" ? null : undefined,
        suspendedAt: next === "SUSPENDED" ? now : next === "ACTIVE" ? null : undefined,
        terminatedAt: next === "TERMINATED" ? now : undefined,
      },
    });
    await this.audit.record({
      actor: current,
      action,
      targetType: "tenant",
      targetId: id,
      tenantId: id,
      metadata: { reason },
    });
    return updated;
  }

  private async requireTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant nao encontrado.");
    return tenant;
  }

  private async activePlanOrThrow(id: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, status: "ACTIVE" } });
    if (!plan) throw new BadRequestException({ code: "PLAN_NOT_ACTIVE" });
    return plan;
  }

  private async assertDowngradeAllowed(tenantId: string, nextLimits: unknown) {
    const usage = await this.entitlements.getUsage(tenantId);
    const limits = coerceLimits(nextLimits);
    const exceeded = Object.entries({
      maxUsers: usage.activeUsers,
      maxDepartments: usage.departments,
      maxConnections: usage.connections,
      maxContacts: usage.contacts,
      maxCampaignRecipients: usage.campaignRecipientsThisPeriod,
      maxStorageBytes: usage.storageBytes,
    }).filter(([key, value]) => value > limits[key as keyof typeof limits]);
    if (exceeded.length) {
      throw new ConflictException({ code: "PLAN_DOWNGRADE_LIMIT_EXCEEDED", details: exceeded });
    }
  }

  private async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const counter = await this.prisma.invoiceCounter.upsert({
      where: { year },
      update: { lastNumber: { increment: 1 } },
      create: { year, lastNumber: 1 },
    });
    return `INV-${year}-${String(counter.lastNumber).padStart(6, "0")}`;
  }
}

function validatePlanConfig(features: unknown, limits: unknown) {
  return { features: coerceFeatures(features), limits: coerceLimits(limits) };
}

function pagination(query: PlatformListQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function nullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  subscriptions?: Array<{ status: string; plan: { id: string; code: string; name: string } }>;
  _count?: { users?: number; messagingConnections?: number };
}) {
  const subscription = tenant.subscriptions?.[0] ?? null;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: subscription?.plan ?? null,
    subscriptionStatus: subscription?.status ?? null,
    activeUsers: tenant._count?.users ?? 0,
    connections: tenant._count?.messagingConnections ?? 0,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}
