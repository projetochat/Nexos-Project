import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { CampaignDispatchQueue } from "../campaigns/campaign-dispatch.queue";
import { readPositiveInteger } from "../campaigns/campaign-config";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { TransactionalEmailService } from "../email/transactional-email.service";
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
import {
  coerceFeatures,
  coerceLimitOverrides,
  coerceLimits,
  PlanEntitlementService,
} from "./plan-entitlement.service";
import {
  optionalPlanStatus,
  optionalIdentifier,
  optionalSubscriptionStatus,
  optionalTenantStatus,
  optionalUuidLike,
  platformPagination,
  trimmedSearch,
} from "./platform-query";
import type {
  CancelSubscriptionDto,
  CreateInvoiceDto,
  CreatePlanDto,
  CreatePlatformClientDto,
  CreateSubscriptionDto,
  CreateTenantDto,
  ExchangeImpersonationHandoffDto,
  InvoiceStatusDto,
  PlatformListQueryDto,
  ReasonDto,
  StartImpersonationHandoffDto,
  StartImpersonationDto,
  TerminateTenantDto,
  UpdatePlanDto,
  UpdateInvoiceDto,
  UpdatePlatformClientDto,
  UpdatePlatformSettingsDto,
  UpdateSubscriptionDto,
  UpdateTenantAdministratorCredentialsDto,
  UpdateTenantConfigurationDto,
  UpdateTenantDto,
} from "./platform.dto";

const activeSubscriptionStatuses: SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
];

const PLATFORM_SETTINGS_KEY = "defaults";
const DEFAULT_TENANT_ADMIN_PASSWORD = "Trixus@2026";
const DEFAULT_PLATFORM_SETTINGS = {
  defaultTrialDays: 14,
  defaultSubscriptionPeriodDays: 30,
  defaultCurrency: "BRL",
} as const;

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
  private static readonly MAX_TRACKED_HANDOFF_CODES = 1_000;
  private readonly failedHandoffAttempts = new Map<string, { count: number; resetAt: number }>();

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
    @Optional()
    @Inject(TransactionalEmailService)
    private readonly email?: TransactionalEmailService,
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

  async listClients(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = platformPagination(query);
    const q = trimmedSearch(query);
    const status = ["ACTIVE", "SUSPENDED", "CANCELLED", "PROSPECTING"].includes(query.status ?? "")
      ? (query.status as "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PROSPECTING")
      : undefined;
    const city = query.city?.trim();
    const state = query.state?.trim().toUpperCase();
    const where: Prisma.PlatformClientWhereInput = {
      ...(status ? { status } : {}),
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      ...(state ? { state } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { document: { contains: q.replace(/\D/g, "") } },
              { responsibleName: { contains: q, mode: "insensitive" } },
              { responsibleEmail: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.platformClient.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { registeredAt: "desc" },
        include: {
          tenant: { select: { id: true, name: true, slug: true, status: true } },
          _count: { select: { subscriptions: true } },
        },
      }),
      this.prisma.platformClient.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  async createClient(dto: CreatePlatformClientDto, current: AuthenticatedUser) {
    const documentDigits =
      typeof dto.document === "string" ? dto.document.replace(/\D/g, "") : undefined;
    const document = documentDigits ? documentDigits : null;
    if (dto.status !== "PROSPECTING" && document?.length !== 14) {
      throw new BadRequestException("Informe um CNPJ válido para o cliente.");
    }
    if (document) {
      const existing = await this.prisma.platformClient.findUnique({ where: { document } });
      if (existing) throw new ConflictException("Já existe um cliente cadastrado com este CNPJ.");
    }
    const client = await this.prisma.platformClient.create({
      data: {
        name: dto.name.trim(),
        document,
        responsibleName: dto.responsibleName.trim(),
        responsibleEmail: dto.responsibleEmail.toLowerCase().trim(),
        city: dto.city.trim(),
        state: dto.state.toUpperCase(),
        registeredAt: dto.registeredAt ? new Date(dto.registeredAt) : new Date(),
        status: dto.status ?? "ACTIVE",
        notes: nullable(dto.notes),
      },
    });
    await this.audit.record({
      actor: current,
      action: "platform_client.created",
      targetType: "platform_client",
      targetId: client.id,
      metadata: { document: client.document },
    });
    return client;
  }

  async updateClient(id: string, dto: UpdatePlatformClientDto, current: AuthenticatedUser) {
    const existing = await this.prisma.platformClient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Cliente não encontrado.");
    const document =
      dto.document === undefined
        ? existing.document
        : typeof dto.document === "string"
          ? nullable(dto.document.replace(/\D/g, ""))
          : null;
    const nextStatus = dto.status ?? existing.status;
    if (nextStatus !== "PROSPECTING" && document?.length !== 14) {
      throw new BadRequestException("Informe um CNPJ válido para o cliente.");
    }
    if (document && document !== existing.document) {
      const duplicate = await this.prisma.platformClient.findUnique({ where: { document } });
      if (duplicate) throw new ConflictException("Já existe um cliente cadastrado com este CNPJ.");
    }
    const client = await this.prisma.platformClient.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        document: dto.document === undefined ? undefined : document,
        responsibleName: dto.responsibleName?.trim(),
        responsibleEmail: dto.responsibleEmail?.toLowerCase().trim(),
        city: dto.city?.trim(),
        state: dto.state?.toUpperCase(),
        registeredAt: dto.registeredAt ? new Date(dto.registeredAt) : undefined,
        status: dto.status,
        notes: nullable(dto.notes),
      },
    });
    await this.audit.record({
      actor: current,
      action: "platform_client.updated",
      targetType: "platform_client",
      targetId: id,
      tenantId: client.tenantId ?? undefined,
    });
    return client;
  }

  async cancelClient(id: string, current: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformClient.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Cliente não encontrado.");
      const client = await tx.platformClient.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: current.userId,
          actorPlatformRole: current.platformRole,
          action: "platform_client.cancelled",
          targetType: "platform_client",
          targetId: id,
          tenantId: client.tenantId,
          metadataJson: { previousStatus: existing.status },
        },
      });
      return client;
    });
  }

  async deleteClient(id: string, current: AuthenticatedUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const existing = await tx.platformClient.findUnique({
          where: { id },
          include: { _count: { select: { subscriptions: true } } },
        });
        if (!existing) throw new NotFoundException("Cliente não encontrado.");
        if (existing._count.subscriptions > 0) {
          throw new ConflictException(
            "O cliente possui assinaturas vinculadas e não pode ser excluído. Cancele-o para preservar o histórico.",
          );
        }

        await tx.platformClient.delete({ where: { id } });
        await tx.platformAuditLog.create({
          data: {
            actorUserId: current.userId,
            actorPlatformRole: current.platformRole,
            action: "platform_client.deleted",
            targetType: "platform_client",
            targetId: id,
            tenantId: existing.tenantId,
            metadataJson: {
              name: existing.name,
              document: existing.document,
              previousStatus: existing.status,
            },
          },
        });
        return { id, deleted: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException(
          "O cliente passou a possuir uma assinatura e não pode mais ser excluído.",
        );
      }
      throw error;
    }
  }

  async listTenants(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = platformPagination(query);
    const q = trimmedSearch(query);
    const status = optionalTenantStatus(query.status);
    const planId = optionalIdentifier(query.planId, "planId");
    const createdAt =
      query.dateFrom || query.dateTo ? dateRange(query.dateFrom, query.dateTo) : null;
    const legacyCreatedAt = query.createdAt ? new Date(query.createdAt) : undefined;
    const legacyCreatedBefore = legacyCreatedAt
      ? new Date(
          legacyCreatedAt.getFullYear(),
          legacyCreatedAt.getMonth(),
          legacyCreatedAt.getDate() + 1,
        )
      : undefined;
    const where: Prisma.TenantWhereInput = {
      ...(status ? { status } : {}),
      ...(planId ? { subscriptions: { some: { planId } } } : {}),
      ...(createdAt
        ? { createdAt }
        : legacyCreatedAt
          ? { createdAt: { gte: legacyCreatedAt, lt: legacyCreatedBefore } }
          : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { responsibleName: { contains: q, mode: "insensitive" } },
              { responsibleEmail: { contains: q, mode: "insensitive" } },
              {
                subscriptions: {
                  some: { client: { name: { contains: q, mode: "insensitive" } } },
                },
              },
              {
                subscriptions: {
                  some: {
                    client: { responsibleName: { contains: q, mode: "insensitive" } },
                  },
                },
              },
              { platformClient: { name: { contains: q, mode: "insensitive" } } },
              { platformClient: { responsibleName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              plan: true,
              client: {
                select: { id: true, name: true, responsibleName: true, responsibleEmail: true },
              },
            },
          },
          platformClient: {
            select: { id: true, name: true, responsibleName: true, responsibleEmail: true },
          },
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
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: {
            plan: true,
            client: {
              select: { id: true, name: true, responsibleName: true, responsibleEmail: true },
            },
          },
        },
        users: {
          select: {
            id: true,
            status: true,
            presentationName: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                keepSidebarCollapsed: true,
                status: true,
                platformRole: true,
              },
            },
            role: { select: { id: true, key: true, name: true } },
            departments: { include: { department: true } },
          },
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        departments: { take: 20, orderBy: { name: "asc" } },
        messagingConnections: { take: 20, orderBy: { createdAt: "desc" } },
        invoices: { take: 10, orderBy: { createdAt: "desc" } },
        auditLogs: { take: 20, orderBy: { createdAt: "desc" } },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    return {
      ...serializeTenant(tenant),
      usage: await this.entitlements.getUsage(id),
      detail: tenant,
    };
  }

  async updateTenantAdministratorCredentials(
    id: string,
    dto: UpdateTenantAdministratorCredentialsDto,
    current: AuthenticatedUser,
  ) {
    if (dto.newPassword !== undefined) assertBcryptPasswordLength(dto.newPassword);
    const responsibleName = dto.responsibleName.trim();
    const responsibleEmail = dto.responsibleEmail.toLowerCase().trim();
    const passwordHash = dto.newPassword ? await hash(dto.newPassword, 12) : undefined;
    const credentialsUpdatedAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const tenant = await tx.tenant.findUnique({
          where: { id },
          include: {
            users: {
              where: { status: "ACTIVE", role: { key: "tenant_admin" } },
              include: {
                user: {
                  include: {
                    memberships: { select: { tenantId: true, status: true } },
                  },
                },
              },
            },
          },
        });
        if (!tenant) throw new NotFoundException("Tenant não encontrado.");
        if (tenant.status !== "ACTIVE") {
          throw new BadRequestException(
            "As credenciais do administrador só podem ser gerenciadas em uma Tenant ativa.",
          );
        }
        if (tenant.users.length > 1) {
          throw new ConflictException(
            "A Tenant possui mais de um administrador ativo. Revise os vínculos antes de alterar as credenciais.",
          );
        }

        if (tenant.users.length === 0) {
          if (!passwordHash && this.tenantAdministratorInvitationEmailEnabled()) {
            throw new BadRequestException(
              "Informe uma senha inicial ou utilize o fluxo de convite do administrador.",
            );
          }
          const emailOwner = await tx.user.findUnique({
            where: { email: responsibleEmail },
            select: { id: true },
          });
          if (emailOwner) {
            throw new ConflictException(
              "O e-mail informado já pertence a outro usuário e não pode ser assumido por esta Tenant.",
            );
          }
          const administratorRole = await tx.role.findFirst({
            where: { tenantId: id, key: "tenant_admin" },
            select: { id: true },
          });
          if (!administratorRole) {
            throw new ConflictException("O perfil de administrador da Tenant não foi encontrado.");
          }
          const initialPasswordHash =
            passwordHash ?? (await hash(DEFAULT_TENANT_ADMIN_PASSWORD, 12));
          const administratorUser = await tx.user.create({
            data: {
              name: responsibleName,
              email: responsibleEmail,
              passwordHash: initialPasswordHash,
              status: "ACTIVE",
            },
          });
          const membership = await tx.tenantMembership.create({
            data: {
              tenantId: id,
              userId: administratorUser.id,
              roleId: administratorRole.id,
              presentationName: responsibleName,
              status: "ACTIVE",
            },
          });
          const revokedInvitations = await tx.userInvitation.updateMany({
            where: { tenantId: id, status: "PENDING" },
            data: { status: "REVOKED", revokedAt: credentialsUpdatedAt },
          });
          await tx.userInvitation.create({
            data: {
              tenantId: id,
              email: responsibleEmail,
              roleId: administratorRole.id,
              tokenHash: hashPlatformToken(randomBytes(32).toString("base64url")),
              expiresAt: new Date("9999-12-31T23:59:59.999Z"),
            },
          });
          const updatedTenant = await tx.tenant.update({
            where: { id },
            data: {
              responsibleName,
              responsibleEmail,
              technicalEmail: responsibleEmail,
              authRevokedAt: credentialsUpdatedAt,
            },
          });
          await tx.platformAuditLog.create({
            data: {
              actorUserId: current.userId,
              actorPlatformRole: current.platformRole,
              action: "tenant.administrator_credentials.provisioned",
              targetType: "tenant_administrator",
              targetId: administratorUser.id,
              tenantId: id,
              impersonationSessionId: current.impersonationSessionId,
              metadataJson: {
                membershipId: membership.id,
                legacyInvitationConverted: true,
                revokedInvitationCount: revokedInvitations.count,
                passwordChangeRequired: true,
              },
            },
          });
          return {
            ok: true,
            responsibleName: updatedTenant.responsibleName,
            responsibleEmail: updatedTenant.responsibleEmail,
            credentialsUpdatedAt,
          };
        }

        const administrator = tenant.users[0];
        const hasAnotherTenant = administrator.user.memberships.some(
          (membership) => membership.tenantId !== id && membership.status === "ACTIVE",
        );
        if (hasAnotherTenant) {
          throw new ConflictException(
            "O administrador está vinculado a outra empresa. Use o fluxo explícito de convite ou vínculo.",
          );
        }

        const emailOwner = await tx.user.findUnique({
          where: { email: responsibleEmail },
          select: { id: true },
        });
        if (emailOwner && emailOwner.id !== administrator.userId) {
          throw new ConflictException("O e-mail informado já pertence a outro usuário.");
        }

        await tx.user.update({
          where: { id: administrator.userId },
          data: {
            name: responsibleName,
            email: responsibleEmail,
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
        await tx.tenantMembership.update({
          where: { id: administrator.id },
          data: { presentationName: responsibleName },
        });
        const updatedTenant = await tx.tenant.update({
          where: { id },
          data: {
            responsibleName,
            responsibleEmail,
            technicalEmail: responsibleEmail,
            ...(passwordHash ? { authRevokedAt: credentialsUpdatedAt } : {}),
          },
        });
        if (passwordHash) {
          await tx.passwordResetToken.updateMany({
            where: { userId: administrator.userId, usedAt: null },
            data: { usedAt: credentialsUpdatedAt },
          });
          await tx.authSession.updateMany({
            where: { userId: administrator.userId, revokedAt: null },
            data: { revokedAt: credentialsUpdatedAt },
          });
        }
        await tx.platformAuditLog.create({
          data: {
            actorUserId: current.userId,
            actorPlatformRole: current.platformRole,
            action: "tenant.administrator_credentials.updated",
            targetType: "tenant_administrator",
            targetId: administrator.userId,
            tenantId: id,
            impersonationSessionId: current.impersonationSessionId,
            metadataJson: {
              membershipId: administrator.id,
              nameChanged: tenant.responsibleName !== responsibleName,
              emailChanged: tenant.responsibleEmail !== responsibleEmail,
              passwordChanged: Boolean(passwordHash),
            },
          },
        });

        return {
          ok: true,
          responsibleName: updatedTenant.responsibleName,
          responsibleEmail: updatedTenant.responsibleEmail,
          credentialsUpdatedAt,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("O e-mail informado já pertence a outro usuário.");
      }
      throw error;
    }
  }

  async createTenant(dto: CreateTenantDto, current: AuthenticatedUser) {
    if (dto.admin) assertBcryptPasswordLength(dto.admin.password);
    const slug = normalizeSlug(dto.slug);
    const plan = await this.activePlanOrThrow(dto.planId);
    const administratorEmail = dto.admin?.email.toLowerCase().trim();
    const initialStatus = dto.initialStatus ?? "TRIAL";
    const settings = await this.settings();
    const passwordHash = dto.admin ? await hash(dto.admin.password, 12) : null;
    const created = await this.prisma.$transaction(async (tx) => {
      if (administratorEmail) {
        const existingAdministrator = await tx.user.findUnique({
          where: { email: administratorEmail },
          include: { memberships: { select: { id: true } } },
        });
        if (existingAdministrator?.memberships.length) {
          throw new ConflictException(
            "O e-mail do administrador já está vinculado a outra empresa.",
          );
        }
      }
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          legalName: dto.name.trim(),
          displayName: dto.name.trim(),
          slug,
          status: initialStatus,
          timezone: dto.timezone ?? "America/Sao_Paulo",
          locale: dto.locale ?? "pt-BR",
          technicalEmail: administratorEmail ?? dto.responsibleEmail?.toLowerCase().trim(),
          responsibleName: nullable(dto.responsibleName),
          responsibleEmail: normalizeNullableEmail(dto.responsibleEmail),
          responsiblePhone: nullable(dto.responsiblePhone),
          responsibleTitle: nullable(dto.responsibleTitle),
          notes: nullable(dto.notes),
          maxUsers: dto.maxUsers,
          maxConnections: dto.maxConnections,
          activatedAt: new Date(),
        },
      });
      const roles = await seedTenantRoles(tx, tenant.id);
      let membership: { id: string } | null = null;
      if (dto.admin && administratorEmail && passwordHash) {
        const user = await tx.user.upsert({
          where: { email: administratorEmail },
          update: { name: dto.admin.name.trim(), passwordHash, status: "ACTIVE" },
          create: {
            email: administratorEmail,
            name: dto.admin.name.trim(),
            passwordHash,
            status: "ACTIVE",
          },
        });
        membership = await tx.tenantMembership.create({
          data: { tenantId: tenant.id, userId: user.id, roleId: roles.tenant_admin.id },
        });
      }
      const subscription = await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: initialStatus === "ACTIVE" ? "ACTIVE" : "TRIALING",
          trialEndsAt:
            initialStatus === "TRIAL"
              ? addDays(new Date(), plan.trialDays || settings.defaultTrialDays)
              : null,
          currentPeriodEnd: addDays(new Date(), settings.defaultSubscriptionPeriodDays),
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
      metadata: { slug, planId: plan.id, membershipId: created.membership?.id, initialStatus },
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
        billingEmail: normalizeNullableEmail(dto.billingEmail),
        technicalEmail: normalizeNullableEmail(dto.technicalEmail),
        responsibleName: nullable(dto.responsibleName),
        responsibleEmail: normalizeNullableEmail(dto.responsibleEmail),
        responsiblePhone: nullable(dto.responsiblePhone),
        responsibleTitle: nullable(dto.responsibleTitle),
        notes: nullable(dto.notes),
        maxUsers: dto.maxUsers,
        maxConnections: dto.maxConnections,
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

  async tenantConfiguration(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        maxUsers: true,
        maxConnections: true,
        featureOverrides: true,
        limitOverrides: true,
      },
    });
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    const effective = await this.entitlements.getEntitlements(id);
    const featureOverrides = jsonRecord(tenant.featureOverrides);
    return {
      tenantId: id,
      modules: {
        chat: true,
        campaigns: effective.features.campaigns,
        tickets: effective.features.tickets,
      },
      lockedModules: ["chat"],
      limits: effective.limits,
      overrides: {
        modules: {
          ...(typeof featureOverrides.campaigns === "boolean"
            ? { campaigns: featureOverrides.campaigns }
            : {}),
          ...(typeof featureOverrides.tickets === "boolean"
            ? { tickets: featureOverrides.tickets }
            : {}),
        },
        limits: {
          ...coerceLimitOverrides(tenant.limitOverrides),
          ...(tenant.maxUsers == null ? {} : { maxUsers: tenant.maxUsers }),
          ...(tenant.maxConnections == null ? {} : { maxConnections: tenant.maxConnections }),
        },
      },
    };
  }

  async updateTenantConfiguration(
    id: string,
    dto: UpdateTenantConfigurationDto,
    current: AuthenticatedUser,
  ) {
    const disabledPermissionIds = [
      ...(dto.modules?.campaigns === false
        ? ["campaigns.read", "campaigns.create", "campaigns.update", "campaigns.delete"]
        : []),
      ...(dto.modules?.tickets === false
        ? ["tickets.read", "tickets.create", "tickets.update", "tickets.delete"]
        : []),
    ];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "tenants" WHERE id = ${id} FOR UPDATE`);
      const existing = await tx.tenant.findUnique({
        where: { id },
        select: {
          id: true,
          featureOverrides: true,
          limitOverrides: true,
          maxUsers: true,
          maxConnections: true,
        },
      });
      if (!existing) throw new NotFoundException("Tenant não encontrado.");

      const featureOverrides = jsonRecord(existing.featureOverrides);
      if (dto.modules?.campaigns !== undefined) {
        featureOverrides.campaigns = dto.modules.campaigns;
      }
      if (dto.modules?.tickets !== undefined) featureOverrides.tickets = dto.modules.tickets;

      const limitOverrides = jsonRecord(existing.limitOverrides);
      let maxUsers = existing.maxUsers;
      let maxConnections = existing.maxConnections;
      for (const [key, value] of Object.entries(dto.limits ?? {})) {
        if (key === "maxUsers") {
          maxUsers = value == null ? null : Number(value);
        } else if (key === "maxConnections") {
          maxConnections = value == null ? null : Number(value);
        } else if (value == null) {
          delete limitOverrides[key];
        } else {
          limitOverrides[key] = Number(value);
        }
      }

      await tx.tenant.update({
        where: { id },
        data: {
          featureOverrides: featureOverrides as Prisma.InputJsonObject,
          limitOverrides: limitOverrides as Prisma.InputJsonObject,
          maxUsers,
          maxConnections,
        },
      });
      if (disabledPermissionIds.length > 0) {
        await tx.rolePermission.deleteMany({
          where: {
            role: { tenantId: id },
            permissionId: { in: disabledPermissionIds },
          },
        });
      }
    });
    await this.audit.record({
      actor: current,
      action: "tenant.configuration.updated",
      targetType: "tenant",
      targetId: id,
      tenantId: id,
      metadata: {
        modules: dto.modules ?? {},
        limits: dto.limits ?? {},
      },
    });
    return this.tenantConfiguration(id);
  }

  async settings() {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SETTINGS_KEY },
    });
    return normalizePlatformSettings(setting?.value);
  }

  async updateSettings(dto: UpdatePlatformSettingsDto, current: AuthenticatedUser) {
    const value = normalizePlatformSettings(dto);
    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_SETTINGS_KEY },
      update: { value, updatedByUserId: current.userId },
      create: { key: PLATFORM_SETTINGS_KEY, value, updatedByUserId: current.userId },
    });
    await this.audit.record({
      actor: current,
      action: "platform.settings.updated",
      targetType: "platform_setting",
      targetId: PLATFORM_SETTINGS_KEY,
      metadata: value,
    });
    return value;
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
    const { page, pageSize, skip } = platformPagination(query);
    const q = trimmedSearch(query);
    const status = optionalPlanStatus(query.status);
    const where: Prisma.PlanWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return this.prisma.plan
      .findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
        include: { _count: { select: { subscriptions: true } } },
      })
      .then(async (items) =>
        paginated(
          items.map((plan) => serializePlan(plan)),
          await this.prisma.plan.count({ where }),
          page,
          pageSize,
        ),
      );
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
    if (!plan) throw new NotFoundException("Plano não encontrado.");
    return plan;
  }

  async createPlan(dto: CreatePlanDto, current: AuthenticatedUser) {
    const data = validatePlanConfig(dto.features, dto.limits);
    const baseCode = normalizePlatformSlug(dto.name).replace(/-/g, "_") || "plano";
    let code = baseCode;
    for (let suffix = 2; await this.prisma.plan.findUnique({ where: { code } }); suffix += 1) {
      code = `${baseCode.slice(0, 58)}_${suffix}`;
    }
    const plan = await this.prisma.plan.create({
      data: {
        code,
        name: dto.name.trim(),
        description: nullable(dto.description),
        status: dto.status ?? "ACTIVE",
        billingPeriod: dto.billingPeriod ?? "MANUAL",
        priceCents: dto.priceCents,
        trialDays: dto.trialDays ?? 0,
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
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: nullable(dto.description),
        status: dto.status,
        trialDays: dto.trialDays,
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
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    if (existing.status === "ARCHIVED") throw new ConflictException("O plano já está arquivado.");
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

  async unarchivePlan(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    if (existing.status !== "ARCHIVED") throw new ConflictException("O plano não está arquivado.");
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { status: "INACTIVE", archivedAt: null },
    });
    await this.audit.record({
      actor: current,
      action: "plan.unarchived",
      targetType: "plan",
      targetId: id,
    });
    return plan;
  }

  async deactivatePlan(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    if (existing.status === "INACTIVE") throw new ConflictException("O plano já está inativo.");
    if (existing.status === "ARCHIVED") {
      throw new ConflictException("Desarquive o plano antes de alterar seu status.");
    }
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    await this.audit.record({
      actor: current,
      action: "plan.deactivated",
      targetType: "plan",
      targetId: id,
    });
    return plan;
  }

  async activatePlan(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    if (existing.status === "ACTIVE") throw new ConflictException("O plano já está ativo.");
    if (existing.status !== "INACTIVE") {
      throw new ConflictException("Somente planos inativos podem ser ativados por esta ação.");
    }
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    await this.audit.record({
      actor: current,
      action: "plan.activated",
      targetType: "plan",
      targetId: id,
    });
    return plan;
  }

  async deletePlan(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) throw new NotFoundException("Plano não encontrado.");
    if (existing._count.subscriptions > 0) {
      throw new ConflictException(
        "O plano possui assinaturas vinculadas e não pode ser excluído. Desative-o para impedir novas utilizações.",
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    await this.audit.record({
      actor: current,
      action: "plan.deleted",
      targetType: "plan",
      targetId: id,
      metadata: { code: existing.code, previousStatus: existing.status },
    });
    return { id, deleted: true };
  }

  async createSubscription(
    tenantId: string,
    dto: CreateSubscriptionDto,
    current: AuthenticatedUser,
  ) {
    await this.requireTenant(tenantId);
    const plan = await this.activePlanOrThrow(dto.planId);
    const settings = await this.settings();
    const client = await this.prisma.platformClient.findUnique({ where: { tenantId } });
    const subscription = await this.prisma.$transaction(async (tx) => {
      await tx.tenantSubscription.updateMany({
        where: { tenantId, status: { in: activeSubscriptionStatuses } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      const created = await tx.tenantSubscription.create({
        data: {
          tenantId,
          planId: plan.id,
          clientId: client?.id,
          status: "ACTIVE",
          startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          currentPeriodStart: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : dto.indefinite
              ? new Date("9999-12-31T23:59:59.999Z")
              : addDays(new Date(), settings.defaultSubscriptionPeriodDays),
          indefinite: dto.indefinite ?? false,
          monthlyValueCents: dto.monthlyValueCents ?? plan.priceCents,
          discountCents: dto.discountCents ?? 0,
          couponCode: nullable(dto.couponCode),
          notes: nullable(dto.notes),
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

  async createClientSubscription(
    clientId: string,
    dto: CreateSubscriptionDto,
    current: AuthenticatedUser,
  ) {
    const plan = await this.activePlanOrThrow(dto.planId);
    const settings = await this.settings();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientId}))`;
      const client = await tx.platformClient.findUnique({ where: { id: clientId } });
      if (!client) throw new NotFoundException("Cliente não encontrado.");
      if (client.status === "CANCELLED") {
        throw new BadRequestException("Não é possível assinar um cliente cancelado.");
      }
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
      const subscription = await tx.tenantSubscription.create({
        data: {
          tenantId: null,
          clientId: client.id,
          planId: plan.id,
          status: "REGISTERING",
          startsAt,
          currentPeriodStart: startsAt,
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : dto.indefinite
              ? new Date("9999-12-31T23:59:59.999Z")
              : addDays(startsAt, settings.defaultSubscriptionPeriodDays),
          indefinite: dto.indefinite ?? false,
          monthlyValueCents: dto.monthlyValueCents ?? plan.priceCents,
          discountCents: dto.discountCents ?? 0,
          couponCode: nullable(dto.couponCode),
          notes: nullable(dto.notes),
          limitsSnapshot: coerceLimits(plan.limits),
          featuresSnapshot: coerceFeatures(plan.features),
          createdByUserId: current.userId,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          tenantId: null,
          nextPlanId: plan.id,
          nextStatus: subscription.status,
          reason: dto.reason ?? "client.subscription.created",
          actorUserId: current.userId,
        },
      });
      return subscription;
    });
    await this.audit.record({
      actor: current,
      action: "client.subscription.created",
      targetType: "subscription",
      targetId: result.id,
      metadata: { clientId },
    });
    return this.subscriptionDetail(result.id);
  }

  listSubscriptions(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = platformPagination(query);
    const status = optionalSubscriptionStatus(query.status);
    const planId = optionalIdentifier(query.planId, "planId");
    const tenantId = optionalUuidLike(query.tenantId, "tenantId");
    const q = trimmedSearch(query);
    const city = query.city?.trim();
    const state = query.state?.trim().toUpperCase();
    const createdAt = dateRange(query.dateFrom, query.dateTo);
    const where: Prisma.TenantSubscriptionWhereInput = {
      ...(status ? { status } : {}),
      ...(planId ? { planId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(city || state
        ? {
            client: {
              ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
              ...(state ? { state } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { client: { name: { contains: q, mode: "insensitive" } } },
              { client: { responsibleName: { contains: q, mode: "insensitive" } } },
              { plan: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    return this.prisma.tenantSubscription
      .findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: { select: { id: true, name: true, slug: true, status: true } },
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              archivedAt: true,
              billingPeriod: true,
            },
          },
          client: {
            select: {
              id: true,
              name: true,
              responsibleName: true,
              responsibleEmail: true,
              city: true,
              state: true,
            },
          },
          invoices: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
      .then(async (items) => {
        const [total, grouped] = await this.prisma.$transaction([
          this.prisma.tenantSubscription.count({ where }),
          this.prisma.tenantSubscription.groupBy({
            by: ["status"],
            where,
            orderBy: { status: "asc" },
            _count: { id: true },
          }),
        ]);
        const summaryRows = grouped as unknown as Array<{ status: string; _count: { id: number } }>;
        return {
          ...paginated(
            items.map((subscription) => serializeSubscription(subscription)),
            total,
            page,
            pageSize,
          ),
          summary: Object.fromEntries(summaryRows.map((item) => [item.status, item._count.id])),
        };
      });
  }

  async subscriptionDetail(id: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: {
        tenant: true,
        plan: true,
        client: true,
        history: { orderBy: { createdAt: "desc" }, take: 50 },
        invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!subscription) throw new NotFoundException("Assinatura não encontrada.");
    return subscription;
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!existing) throw new NotFoundException("Assinatura não encontrada.");
    let nextPlan = existing.plan;
    if (dto.planId && dto.planId !== existing.planId) {
      nextPlan = await this.activePlanOrThrow(dto.planId);
      await this.assertDowngradeAllowed(existing.tenantId, nextPlan.limits);
    }
    const limits = coerceLimits(nextPlan.limits);
    const updated = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.tenantSubscription.update({
        where: { id },
        data: {
          planId: nextPlan.id,
          status: dto.status,
          limitsSnapshot: limits,
          featuresSnapshot: coerceFeatures(nextPlan.features),
          monthlyValueCents: dto.monthlyValueCents,
          discountCents: dto.discountCents,
          couponCode: nullable(dto.couponCode),
          notes: nullable(dto.notes),
        },
      });
      if (existing.tenantId) {
        await tx.tenant.update({
          where: { id: existing.tenantId },
          data: {
            status: tenantStatusForSubscription(subscription.status),
            maxUsers: limits.maxUsers,
            maxConnections: limits.maxConnections,
          },
        });
      }
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          tenantId: existing.tenantId,
          previousPlanId: existing.planId,
          nextPlanId: subscription.planId,
          previousStatus: existing.status,
          nextStatus: subscription.status,
          reason: dto.reason ?? "subscription.changed",
          actorUserId: current.userId,
        },
      });
      return subscription;
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
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!existing) throw new NotFoundException("Assinatura não encontrada.");
    if (existing.status === "CANCELLED") {
      throw new ConflictException("A assinatura já está cancelada.");
    }
    if (
      ![
        "AWAITING_FINANCE",
        "FINANCE_RELEASED",
        "ACTIVE",
        "SUSPENDED",
        "REGISTERING",
        "TRIALING",
      ].includes(existing.status)
    ) {
      throw new ConflictException("A assinatura não pode ser cancelada no estado atual.");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledAt = new Date();
      const reason = dto.reason?.trim() || "subscription.cancelled";
      const subscription = await tx.tenantSubscription.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt, cancelAtPeriodEnd: false },
      });
      if (existing.tenantId) {
        await tx.tenant.update({
          where: { id: existing.tenantId },
          data: {
            status: "TERMINATED",
            terminatedAt: cancelledAt,
            authRevokedAt: cancelledAt,
            suspensionReason: reason,
          },
        });
      }
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          tenantId: existing.tenantId,
          previousStatus: existing.status,
          nextStatus: "CANCELLED",
          previousPlanId: existing.planId,
          nextPlanId: existing.planId,
          reason,
          actorUserId: current.userId,
        },
      });
      return subscription;
    });
    await this.audit.record({
      actor: current,
      action: "subscription.cancelled",
      targetType: "subscription",
      targetId: id,
      tenantId: existing.tenantId ?? undefined,
    });
    return updated;
  }

  async generateSubscriptionFinance(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { invoices: true, client: true },
    });
    if (!existing) throw new NotFoundException("Assinatura não encontrada.");
    if (existing.invoices.length) throw new ConflictException("Financeiro já gerado.");
    if (!["REGISTERING", "TRIALING"].includes(existing.status)) {
      throw new ConflictException("Financeiro não pode ser gerado no estado atual.");
    }
    const subtotalCents = existing.monthlyValueCents ?? 0;
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId: existing.tenantId,
          subscriptionId: id,
          number: await this.nextInvoiceNumber(),
          status: "OPEN",
          currency: "BRL",
          subtotalCents,
          discountCents: existing.discountCents,
          totalCents: Math.max(0, subtotalCents - existing.discountCents),
          dueAt: addDays(new Date(), 7),
          referenceDate: new Date(),
          reference: new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }),
          couponCode: existing.couponCode,
          notes: existing.notes,
        },
      });
      await tx.tenantSubscription.update({ where: { id }, data: { status: "AWAITING_FINANCE" } });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          tenantId: existing.tenantId,
          previousPlanId: existing.planId,
          nextPlanId: existing.planId,
          previousStatus: existing.status,
          nextStatus: "AWAITING_FINANCE",
          reason: "subscription.finance.generated",
          actorUserId: current.userId,
        },
      });
      return created;
    });
    await this.audit.record({
      actor: current,
      action: "subscription.finance.generated",
      targetType: "subscription",
      targetId: id,
      tenantId: existing.tenantId ?? undefined,
      metadata: { invoiceId: invoice.id },
    });
    return this.subscriptionDetail(id);
  }

  async activateSubscription(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: { client: true, plan: true, invoices: { orderBy: { createdAt: "desc" } } },
    });
    if (!existing) throw new NotFoundException("Assinatura não encontrada.");
    if (existing.status === "ACTIVE") throw new ConflictException("A assinatura já está ativa.");
    if (existing.status === "SUSPENDED") {
      if (!existing.tenantId) {
        throw new ConflictException("A assinatura suspensa não possui uma Tenant para reativar.");
      }
      const reactivatedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.tenantSubscription.update({
          where: { id },
          data: { status: "ACTIVE", suspensionReason: null },
        });
        await tx.tenant.update({
          where: { id: existing.tenantId! },
          data: {
            status: "ACTIVE",
            suspendedAt: null,
            suspensionReason: null,
            authRevokedAt: reactivatedAt,
          },
        });
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: id,
            tenantId: existing.tenantId,
            previousPlanId: existing.planId,
            nextPlanId: existing.planId,
            previousStatus: "SUSPENDED",
            nextStatus: "ACTIVE",
            reason: "subscription.reactivated",
            actorUserId: current.userId,
          },
        });
      });
      await this.audit.record({
        actor: current,
        action: "subscription.reactivated",
        targetType: "subscription",
        targetId: id,
        tenantId: existing.tenantId,
      });
      return this.subscriptionDetail(id);
    }
    if (!existing.invoices.length) throw new ConflictException("Financeiro ainda não gerado.");
    const invoice = existing.invoices[0];
    if (existing.status !== "FINANCE_RELEASED" || !invoice.released) {
      throw new ConflictException("A ativação exige uma fatura com financeiro liberado.");
    }
    if (!existing.client)
      throw new BadRequestException("A assinatura não possui cliente vinculado.");
    if (existing.tenantId)
      throw new ConflictException("A assinatura já possui uma tenant vinculada.");
    const invitationEmailEnabled = this.tenantAdministratorInvitationEmailEnabled();
    if (invitationEmailEnabled) this.email?.assertInvitationDeliveryReady();
    const invitationToken = randomBytes(32).toString("base64url");
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const temporaryPasswordHash = invitationEmailEnabled
      ? null
      : await hash(DEFAULT_TENANT_ADMIN_PASSWORD, 12);
    let tenant: {
      id: string;
      administratorProvisioning: "invitation_email" | "temporary_password" | "existing_user_linked";
      passwordChangeRequired: boolean;
    };
    try {
      tenant = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const lockedSubscription = await tx.tenantSubscription.findUnique({
          where: { id },
          include: {
            client: true,
            plan: true,
            invoices: { orderBy: { createdAt: "desc" } },
          },
        });
        if (!lockedSubscription) throw new NotFoundException("Assinatura não encontrada.");
        if (lockedSubscription.tenantId) {
          throw new ConflictException("A assinatura já possui uma tenant vinculada.");
        }
        const lockedInvoice = lockedSubscription.invoices[0];
        if (lockedSubscription.status !== "FINANCE_RELEASED" || !lockedInvoice?.released) {
          throw new ConflictException("A ativação exige uma fatura com financeiro liberado.");
        }
        const refreshedClient = lockedSubscription.client;
        if (!refreshedClient) {
          throw new BadRequestException("A assinatura não possui cliente vinculado.");
        }
        if (refreshedClient.status === "CANCELLED") {
          throw new ConflictException(
            "Não é possível ativar a assinatura de um cliente cancelado.",
          );
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${refreshedClient.id}))`;
        const limits = coerceLimits(lockedSubscription.limitsSnapshot);
        const baseSlug =
          normalizePlatformSlug(refreshedClient.name) ||
          `cliente-${refreshedClient.id.slice(0, 8)}`;
        let slug =
          baseSlug.length >= 3 ? baseSlug : `${baseSlug}-${refreshedClient.id.slice(0, 6)}`;
        for (let suffix = 2; await tx.tenant.findUnique({ where: { slug } }); suffix += 1) {
          slug = `${baseSlug.slice(0, 56)}-${suffix}`;
        }
        const created = await tx.tenant.create({
          data: {
            name: refreshedClient.name,
            legalName: refreshedClient.name,
            displayName: refreshedClient.name,
            slug,
            status: "ACTIVE",
            document: refreshedClient.document,
            billingEmail: refreshedClient.responsibleEmail,
            technicalEmail: refreshedClient.responsibleEmail,
            responsibleName: refreshedClient.responsibleName,
            responsibleEmail: refreshedClient.responsibleEmail,
            maxUsers: limits.maxUsers,
            maxConnections: limits.maxConnections,
            activatedAt: new Date(),
          },
        });
        const roles = await seedTenantRoles(tx, created.id);
        const administratorEmail = refreshedClient.responsibleEmail.toLowerCase().trim();
        const existingAdministrator = await tx.user.findUnique({
          where: { email: administratorEmail },
          select: {
            id: true,
            status: true,
            platformRole: true,
            memberships: {
              select: {
                tenant: {
                  select: {
                    subscriptions: { select: { clientId: true } },
                  },
                },
              },
            },
          },
        });
        let administratorProvisioning:
          | "invitation_email"
          | "temporary_password"
          | "existing_user_linked";
        let passwordChangeRequired = false;
        if (existingAdministrator) {
          const linkedClientIds = new Set(
            existingAdministrator.memberships.flatMap((membership) =>
              membership.tenant.subscriptions
                .map((subscription) => subscription.clientId)
                .filter((clientId): clientId is string => Boolean(clientId)),
            ),
          );
          if (
            existingAdministrator.status !== "ACTIVE" ||
            existingAdministrator.platformRole !== "USER" ||
            linkedClientIds.size === 0 ||
            [...linkedClientIds].some((clientId) => clientId !== refreshedClient.id)
          ) {
            throw new ConflictException(
              "O e-mail do administrador pertence a outro acesso e não pode ser reutilizado.",
            );
          }
          await tx.tenantMembership.create({
            data: {
              tenantId: created.id,
              userId: existingAdministrator.id,
              roleId: roles.tenant_admin.id,
              presentationName: refreshedClient.responsibleName,
              status: "ACTIVE",
            },
          });
          administratorProvisioning = "existing_user_linked";
        } else if (invitationEmailEnabled) {
          await tx.userInvitation.create({
            data: {
              tenantId: created.id,
              email: administratorEmail,
              roleId: roles.tenant_admin.id,
              tokenHash: hashPlatformToken(invitationToken),
              expiresAt: invitationExpiresAt,
            },
          });
          administratorProvisioning = "invitation_email";
        } else {
          const administrator = await tx.user.create({
            data: {
              email: administratorEmail,
              name: refreshedClient.responsibleName,
              passwordHash: temporaryPasswordHash!,
              status: "ACTIVE",
            },
          });
          await tx.tenantMembership.create({
            data: {
              tenantId: created.id,
              userId: administrator.id,
              roleId: roles.tenant_admin.id,
              presentationName: refreshedClient.responsibleName,
              status: "ACTIVE",
            },
          });
          await tx.userInvitation.create({
            data: {
              tenantId: created.id,
              email: administratorEmail,
              roleId: roles.tenant_admin.id,
              tokenHash: hashPlatformToken(randomBytes(32).toString("base64url")),
              expiresAt: new Date("9999-12-31T23:59:59.999Z"),
            },
          });
          administratorProvisioning = "temporary_password";
          passwordChangeRequired = true;
        }
        await tx.tenantSubscription.update({
          where: { id },
          data: { tenantId: created.id, status: "ACTIVE" },
        });
        await tx.invoice.updateMany({
          where: { subscriptionId: id },
          data: { tenantId: created.id },
        });
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: id,
            tenantId: created.id,
            previousPlanId: lockedSubscription.planId,
            nextPlanId: lockedSubscription.planId,
            previousStatus: lockedSubscription.status,
            nextStatus: "ACTIVE",
            reason: "subscription.activated",
            actorUserId: current.userId,
          },
        });
        if (administratorProvisioning === "invitation_email") {
          await this.email?.sendTenantAdministratorInvitation({
            to: refreshedClient.responsibleEmail,
            administratorName: refreshedClient.responsibleName,
            tenantName: created.name,
            acceptUrl: `${this.tenantAppUrl()}/login?invite=${encodeURIComponent(invitationToken)}`,
            expiresAt: invitationExpiresAt,
          });
        }
        return { ...created, administratorProvisioning, passwordChangeRequired };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "O e-mail do administrador já pertence a outro usuário. Informe um e-mail exclusivo.",
        );
      }
      throw error;
    }
    await this.audit.record({
      actor: current,
      action: "subscription.activated",
      targetType: "subscription",
      targetId: id,
      tenantId: tenant.id,
      metadata: {
        administratorProvisioning: tenant.administratorProvisioning,
        passwordChangeRequired: tenant.passwordChangeRequired,
      },
    });
    return this.subscriptionDetail(id);
  }

  async suspendSubscription(id: string, dto: ReasonDto, current: AuthenticatedUser) {
    const existing = await this.prisma.tenantSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Assinatura não encontrada.");
    if (existing.status !== "ACTIVE" || !existing.tenantId) {
      throw new ConflictException("Somente assinaturas ativas podem ser suspensas.");
    }
    await this.prisma.$transaction([
      this.prisma.tenantSubscription.update({
        where: { id },
        data: { status: "SUSPENDED", suspensionReason: dto.reason.trim() },
      }),
      this.prisma.tenant.update({
        where: { id: existing.tenantId },
        data: {
          status: "SUSPENDED",
          suspendedAt: new Date(),
          suspensionReason: dto.reason.trim(),
          authRevokedAt: new Date(),
        },
      }),
      this.prisma.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          tenantId: existing.tenantId,
          previousPlanId: existing.planId,
          nextPlanId: existing.planId,
          previousStatus: "ACTIVE",
          nextStatus: "SUSPENDED",
          reason: dto.reason.trim(),
          actorUserId: current.userId,
        },
      }),
    ]);
    await this.audit.record({
      actor: current,
      action: "subscription.suspended",
      targetType: "subscription",
      targetId: id,
      tenantId: existing.tenantId,
    });
    return this.subscriptionDetail(id);
  }

  history(id: string) {
    return this.prisma.subscriptionHistory.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  async listInvoices(query: PlatformListQueryDto) {
    await this.prisma.invoice.updateMany({
      where: { status: "OPEN", dueAt: { lt: new Date() } },
      data: { status: "OVERDUE" },
    });
    const { page, pageSize, skip } = platformPagination(query);
    const tenantId = optionalUuidLike(query.tenantId, "tenantId");
    const status = ["DRAFT", "OPEN", "PAID", "VOID", "OVERDUE", "RELEASED"].includes(
      query.status ?? "",
    )
      ? (query.status as "DRAFT" | "OPEN" | "PAID" | "VOID" | "OVERDUE" | "RELEASED")
      : undefined;
    const q = trimmedSearch(query);
    const planId = optionalIdentifier(query.planId, "planId");
    const dueAt = dateRange(query.dateFrom, query.dateTo);
    const where: Prisma.InvoiceWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status } : {}),
      ...(planId ? { subscription: { planId } } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { subscription: { client: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.invoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            platformClient: { select: { city: true, state: true } },
          },
        },
        subscription: {
          include: {
            plan: { select: { id: true, code: true, name: true, status: true } },
            client: { select: { id: true, name: true, city: true, state: true } },
          },
        },
      },
    });
    const [total, grouped] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.groupBy({
        by: ["status"],
        where,
        orderBy: { status: "asc" },
        _count: { id: true },
        _sum: { totalCents: true },
      }),
    ]);
    const summaryRows = grouped as unknown as Array<{
      status: string;
      _count: { id: number };
      _sum: { totalCents: number | null };
    }>;
    return {
      ...paginated(
        items.map((invoice) => serializeInvoice(invoice)),
        total,
        page,
        pageSize,
      ),
      summary: {
        total: {
          count: summaryRows.reduce((sum, item) => sum + item._count.id, 0),
          cents: summaryRows.reduce((sum, item) => sum + (item._sum.totalCents ?? 0), 0),
        },
        byStatus: Object.fromEntries(
          summaryRows.map((item) => [
            item.status,
            { count: item._count.id, cents: item._sum.totalCents ?? 0 },
          ]),
        ),
      },
    };
  }

  async invoiceDetail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { tenant: true, subscription: { include: { plan: true } } },
    });
    if (!invoice) throw new NotFoundException("Fatura não encontrada.");
    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto, current: AuthenticatedUser) {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: { id: dto.subscriptionId, ...(dto.tenantId ? { tenantId: dto.tenantId } : {}) },
    });
    if (!subscription) throw new BadRequestException("Assinatura inválida.");
    const settings = await this.settings();
    const totalCents = Math.max(0, dto.subtotalCents - (dto.discountCents ?? 0));
    const paidCents = dto.paidCents ?? 0;
    const released = dto.released ?? false;
    const status = invoiceStatusForValues(totalCents, paidCents, released, new Date(dto.dueAt));
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: dto.subscriptionId,
          number: await this.nextInvoiceNumber(),
          currency: dto.currency ?? settings.defaultCurrency,
          subtotalCents: dto.subtotalCents,
          discountCents: dto.discountCents ?? 0,
          totalCents,
          paidCents,
          released,
          releasedAt: released ? new Date() : null,
          paidAt: paidCents >= totalCents ? new Date() : null,
          status,
          dueAt: new Date(dto.dueAt),
          referenceDate: dto.referenceDate ? new Date(dto.referenceDate) : null,
          reference: nullable(dto.reference),
          couponCode: nullable(dto.couponCode),
          notes: nullable(dto.notes),
        },
      });
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: { status: status === "RELEASED" ? "FINANCE_RELEASED" : "AWAITING_FINANCE" },
      });
      return created;
    });
    await this.audit.record({
      actor: current,
      action: "invoice.created",
      targetType: "invoice",
      targetId: invoice.id,
      tenantId: invoice.tenantId ?? undefined,
    });
    return invoice;
  }

  async updateInvoiceStatus(id: string, dto: InvoiceStatusDto, current: AuthenticatedUser) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fatura não encontrada.");
    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: dto.status,
          paidCents: dto.status === "PAID" ? existing.totalCents : undefined,
          paidAt: dto.status === "PAID" ? new Date() : undefined,
          released: dto.status === "RELEASED",
          releasedAt:
            dto.status === "RELEASED" ? new Date() : dto.status === "PAID" ? null : undefined,
          cancelledAt: dto.status === "VOID" ? new Date() : undefined,
        },
      });
      if (dto.status === "RELEASED") {
        await tx.tenantSubscription.update({
          where: { id: existing.subscriptionId },
          data: { status: "FINANCE_RELEASED" },
        });
      }
      return updated;
    });
    await this.audit.record({
      actor: current,
      action: "invoice.status.changed",
      targetType: "invoice",
      targetId: id,
      tenantId: invoice.tenantId ?? undefined,
      metadata: { status: dto.status },
    });
    return invoice;
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto, current: AuthenticatedUser) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fatura não encontrada.");
    if (["VOID", "RELEASED"].includes(existing.status)) {
      throw new ConflictException("Fatura finalizada não pode ser alterada.");
    }
    const subtotalCents = dto.subtotalCents ?? existing.subtotalCents;
    const discountCents = dto.discountCents ?? existing.discountCents;
    const totalCents = Math.max(0, subtotalCents - discountCents);
    const paidCents = dto.paidCents ?? existing.paidCents;
    const released = dto.released ?? existing.released;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : existing.dueAt;
    const status = invoiceStatusForValues(totalCents, paidCents, released, dueAt);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          subtotalCents,
          discountCents,
          totalCents,
          paidCents,
          released,
          releasedAt: released ? (existing.releasedAt ?? new Date()) : null,
          paidAt: paidCents >= totalCents ? (existing.paidAt ?? new Date()) : null,
          status,
          dueAt,
          referenceDate: dto.referenceDate ? new Date(dto.referenceDate) : undefined,
          reference: nullable(dto.reference),
          couponCode: nullable(dto.couponCode),
          notes: nullable(dto.notes),
        },
      });
      await tx.tenantSubscription.update({
        where: { id: existing.subscriptionId },
        data: { status: status === "RELEASED" ? "FINANCE_RELEASED" : "AWAITING_FINANCE" },
      });
      return updated;
    });
    await this.audit.record({
      actor: current,
      action: "invoice.updated",
      targetType: "invoice",
      targetId: id,
      tenantId: invoice.tenantId ?? undefined,
    });
    return invoice;
  }

  async deleteInvoice(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fatura não encontrada.");
    if (!["DRAFT", "OPEN", "OVERDUE"].includes(existing.status)) {
      throw new ConflictException("Somente faturas não pagas podem ser excluídas.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id } });
      const remaining = await tx.invoice.count({
        where: { subscriptionId: existing.subscriptionId },
      });
      if (!remaining) {
        await tx.tenantSubscription.update({
          where: { id: existing.subscriptionId },
          data: { status: "REGISTERING" },
        });
      }
    });
    await this.audit.record({
      actor: current,
      action: "invoice.deleted",
      targetType: "invoice",
      targetId: id,
      tenantId: existing.tenantId ?? undefined,
    });
    return { id, deleted: true };
  }

  listAudit(query: PlatformListQueryDto) {
    const { page, pageSize, skip } = platformPagination(query);
    const q = trimmedSearch(query);
    const tenantId = optionalUuidLike(query.tenantId, "tenantId");
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" } },
              { targetType: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return this.prisma.platformAuditLog
      .findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, email: true, name: true } },
          tenant: { select: { id: true, slug: true, name: true } },
        },
      })
      .then(async (items) =>
        paginated(items, await this.prisma.platformAuditLog.count({ where }), page, pageSize),
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
    if (!log) throw new NotFoundException("Evento de auditoria não encontrado.");
    return log;
  }

  async startImpersonation(dto: StartImpersonationDto, current: AuthenticatedUser) {
    const { session, membership } = await this.createImpersonation(dto, current);
    const tokens = await this.auth.issueImpersonationTokens({
      actorPlatformUserId: current.userId,
      impersonationSessionId: session.id,
      membershipId: dto.membershipId,
    });
    return { ...session, tenant: membership.tenant, membership, tokens };
  }

  async startImpersonationHandoff(dto: StartImpersonationHandoffDto, current: AuthenticatedUser) {
    const code = randomBytes(32).toString("base64url");
    const handoffExpiresAt = new Date(Date.now() + 60_000);
    const { session, membership } = await this.createImpersonation(dto, current, {
      handoffCodeHash: hashPlatformToken(code),
      handoffChallenge: dto.codeChallenge,
      handoffExpiresAt,
    });
    return {
      code,
      expiresAt: handoffExpiresAt,
      impersonationExpiresAt: session.expiresAt,
      tenant: membership.tenant,
    };
  }

  async exchangeImpersonationHandoff(dto: ExchangeImpersonationHandoffDto) {
    const now = new Date();
    const codeHash = hashPlatformToken(dto.code);
    this.assertHandoffRateLimit(codeHash, now.getTime());
    const session = await this.prisma.impersonationSession.findUnique({
      where: { handoffCodeHash: codeHash },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, slug: true, name: true } },
      },
    });
    const challenge = pkceChallenge(dto.codeVerifier);
    if (
      !session ||
      !session.handoffChallenge ||
      !safeTokenEquals(session.handoffChallenge, challenge) ||
      !session.handoffExpiresAt ||
      session.handoffExpiresAt <= now ||
      session.expiresAt <= now ||
      session.handoffConsumedAt ||
      session.status !== "ACTIVE"
    ) {
      this.recordFailedHandoff(codeHash, now.getTime());
      throw new BadRequestException({
        code: "IMPERSONATION_HANDOFF_INVALID",
        message: "Acesso temporário inválido ou expirado.",
      });
    }
    const consumed = await this.prisma.impersonationSession.updateMany({
      where: {
        id: session.id,
        status: "ACTIVE",
        handoffConsumedAt: null,
        handoffExpiresAt: { gt: now },
        expiresAt: { gt: now },
      },
      data: { handoffConsumedAt: now },
    });
    if (consumed.count !== 1) {
      this.recordFailedHandoff(codeHash, now.getTime());
      throw new BadRequestException({
        code: "IMPERSONATION_HANDOFF_INVALID",
        message: "Acesso temporário inválido ou expirado.",
      });
    }
    this.failedHandoffAttempts.delete(codeHash);
    const tokens = await this.auth.issueImpersonationTokens({
      actorPlatformUserId: session.actorUserId,
      impersonationSessionId: session.id,
      membershipId: session.impersonatedMembershipId,
    });
    return {
      ...tokens,
      impersonation: {
        id: session.id,
        expiresAt: session.expiresAt,
        actorUser: session.actor,
        tenant: session.tenant,
      },
    };
  }

  async stopCurrentImpersonation(current: AuthenticatedUser) {
    if (!current.impersonationSessionId || !current.actorPlatformUserId) {
      throw new BadRequestException({
        code: "IMPERSONATION_SESSION_REQUIRED",
        message: "Nenhuma impersonação ativa foi encontrada.",
      });
    }
    const stoppedAt = new Date();
    const stopped = await this.prisma.impersonationSession.updateMany({
      where: {
        id: current.impersonationSessionId,
        actorUserId: current.actorPlatformUserId,
        status: "ACTIVE",
      },
      data: { status: "STOPPED", stoppedAt },
    });
    if (stopped.count !== 1) {
      throw new BadRequestException({
        code: "IMPERSONATION_SESSION_INACTIVE",
        message: "A impersonação já foi encerrada ou expirou.",
      });
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: current.actorPlatformUserId },
      select: { platformRole: true },
    });
    await this.prisma.platformAuditLog.create({
      data: {
        actorUserId: current.actorPlatformUserId,
        actorPlatformRole: actor?.platformRole ?? "SUPPORT",
        action: "impersonation.stopped",
        targetType: "impersonation",
        targetId: current.impersonationSessionId,
        tenantId: current.tenantId,
        impersonationSessionId: current.impersonationSessionId,
        metadataJson: { source: "tenant_handoff" },
      },
    });
    return { id: current.impersonationSessionId, stoppedAt };
  }

  private async createImpersonation(
    dto: StartImpersonationDto,
    current: AuthenticatedUser,
    handoff?: {
      handoffCodeHash: string;
      handoffChallenge: string;
      handoffExpiresAt: Date;
    },
  ) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: dto.membershipId,
        tenantId: dto.tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      include: { tenant: true },
    });
    if (!membership) throw new BadRequestException("Membership invalida para impersonação.");
    const ttl = readPositiveInteger(this.config, "TRIXUS_IMPERSONATION_TTL_MINUTES", 15);
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
          ...handoff,
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
    return { session, membership };
  }

  async stopImpersonation(id: string, current: AuthenticatedUser) {
    const existing = await this.prisma.impersonationSession.findFirst({
      where: { id, actorUserId: current.userId },
    });
    if (!existing) throw new NotFoundException("Sessão de impersonação não encontrada.");
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
          this.config.get<string>("TRIXUS_QUEUE_WORKER_ENABLED") === "true"
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
    if (!tenant) throw new NotFoundException("Tenant não encontrado.");
    return tenant;
  }

  private async activePlanOrThrow(id: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, status: "ACTIVE" } });
    if (!plan) throw new BadRequestException({ code: "PLAN_NOT_ACTIVE" });
    return plan;
  }

  private async assertDowngradeAllowed(tenantId: string | null, nextLimits: unknown) {
    if (!tenantId) return;
    const usage = await this.entitlements.getUsage(tenantId);
    const limits = coerceLimits(nextLimits);
    const exceeded = Object.entries({
      maxUsers: usage.activeUsers,
      maxDepartments: usage.departments,
      maxConnections: usage.connections,
      maxCampaigns: usage.campaignsThisPeriod,
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

  private tenantAppUrl() {
    return (
      this.config.get<string>("TRIXUS_TENANT_APP_URL") ??
      this.config.get<string>("TRIXUS_PUBLIC_APP_URL") ??
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  private tenantAdministratorInvitationEmailEnabled() {
    return (
      this.config.get<string>("TENANT_ADMIN_PROVISIONING_MODE")?.trim().toLowerCase() ===
      "invitation_email"
    );
  }

  private assertHandoffRateLimit(codeHash: string, now: number) {
    this.pruneExpiredHandoffAttempts(now);
    const attempt = this.failedHandoffAttempts.get(codeHash);
    if (
      (attempt && attempt.count >= 5) ||
      (!attempt && this.failedHandoffAttempts.size >= PlatformService.MAX_TRACKED_HANDOFF_CODES)
    ) {
      throw new HttpException(
        {
          code: "TOO_MANY_HANDOFF_ATTEMPTS",
          message: "Muitas tentativas de acesso temporário. Tente novamente em instantes.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedHandoff(codeHash: string, now: number) {
    const attempt = this.failedHandoffAttempts.get(codeHash);
    if (attempt) {
      attempt.count += 1;
      return;
    }
    this.pruneExpiredHandoffAttempts(now);
    if (this.failedHandoffAttempts.size < PlatformService.MAX_TRACKED_HANDOFF_CODES) {
      this.failedHandoffAttempts.set(codeHash, { count: 1, resetAt: now + 60_000 });
    }
  }

  private pruneExpiredHandoffAttempts(now: number) {
    for (const [codeHash, attempt] of this.failedHandoffAttempts) {
      if (attempt.resetAt <= now) this.failedHandoffAttempts.delete(codeHash);
    }
  }
}

function hashPlatformToken(token: string) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function safeTokenEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  return (
    expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function validatePlanConfig(features: unknown, limits: unknown) {
  return { features: coerceFeatures(features), limits: coerceLimits(limits) };
}

function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function normalizePlatformSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function tenantStatusForSubscription(status: string): "TRIAL" | "ACTIVE" | "SUSPENDED" {
  if (status === "TRIALING") return "TRIAL";
  if (["PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"].includes(status)) return "SUSPENDED";
  return "ACTIVE";
}

function nullable(value?: string | null) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function normalizeNullableEmail(value?: string | null) {
  if (value === undefined) return undefined;
  return value?.trim().toLocaleLowerCase("en-US") || null;
}

function assertBcryptPasswordLength(value: string) {
  if (Buffer.byteLength(value, "utf8") > 72) {
    throw new BadRequestException("A senha deve possuir no máximo 72 bytes.");
  }
}

function normalizePlatformSettings(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const settings = source as Record<string, unknown>;
  const readInteger = (key: "defaultTrialDays" | "defaultSubscriptionPeriodDays") => {
    const candidate = Number(settings[key]);
    return Number.isInteger(candidate) && candidate > 0
      ? candidate
      : DEFAULT_PLATFORM_SETTINGS[key];
  };
  const currency = typeof settings.defaultCurrency === "string" ? settings.defaultCurrency : "";
  return {
    defaultTrialDays: Math.min(90, readInteger("defaultTrialDays")),
    defaultSubscriptionPeriodDays: Math.min(366, readInteger("defaultSubscriptionPeriodDays")),
    defaultCurrency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : DEFAULT_PLATFORM_SETTINGS.defaultCurrency,
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: endOfDay(new Date(to)) } : {}),
  };
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function invoiceStatusForValues(
  totalCents: number,
  paidCents: number,
  released: boolean,
  dueAt: Date,
): "OPEN" | "PAID" | "OVERDUE" | "RELEASED" {
  if (released) return "RELEASED";
  if (paidCents >= totalCents) return "PAID";
  if (dueAt.getTime() < Date.now()) return "OVERDUE";
  return "OPEN";
}

function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  responsibleName?: string | null;
  responsibleEmail?: string | null;
  responsiblePhone?: string | null;
  responsibleTitle?: string | null;
  notes?: string | null;
  maxUsers?: number | null;
  maxConnections?: number | null;
  subscriptions?: Array<{
    status: string;
    plan: { id: string; code: string; name: string } | null;
    client?: {
      id: string;
      name: string;
      responsibleName: string;
      responsibleEmail: string;
    } | null;
  }>;
  _count?: { users?: number; messagingConnections?: number };
  platformClient?: {
    id: string;
    name: string;
    responsibleName: string;
    responsibleEmail: string;
  } | null;
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
    responsibleName: tenant.responsibleName ?? null,
    responsibleEmail: tenant.responsibleEmail ?? null,
    responsiblePhone: tenant.responsiblePhone ?? null,
    responsibleTitle: tenant.responsibleTitle ?? null,
    notes: tenant.notes ?? null,
    maxUsers: tenant.maxUsers ?? null,
    maxConnections: tenant.maxConnections ?? null,
    maxCampaigns: subscription
      ? coerceLimits((subscription as { limitsSnapshot?: unknown }).limitsSnapshot).maxCampaigns
      : 0,
    client: subscription?.client ?? tenant.platformClient ?? null,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

function serializePlan(plan: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  billingPeriod: string;
  priceCents: number | null;
  currency: string;
  trialDays: number;
  features: unknown;
  limits: unknown;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  _count?: { subscriptions?: number };
}) {
  return {
    ...plan,
    features: coerceFeatures(plan.features),
    limits: coerceLimits(plan.limits),
  };
}

function serializeSubscription(subscription: {
  id: string;
  tenantId: string | null;
  planId: string;
  status: string;
  startsAt: Date;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  indefinite: boolean;
  monthlyValueCents: number | null;
  discountCents: number;
  couponCode: string | null;
  notes: string | null;
  cancelledAt: Date | null;
  limitsSnapshot: unknown;
  featuresSnapshot: unknown;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { id: string; name: string; slug: string; status: string } | null;
  plan: {
    id: string;
    code: string;
    name: string;
    status: string;
    archivedAt: Date | null;
    billingPeriod: string;
  } | null;
  client?: {
    id: string;
    name: string;
    responsibleName: string;
    responsibleEmail: string;
    city: string;
    state: string;
  } | null;
  invoices?: Array<{ status: string; paidCents: number; totalCents: number; released: boolean }>;
}) {
  return {
    ...subscription,
    tenant: subscription.tenant,
    plan: subscription.plan,
    type: subscription.plan?.billingPeriod ?? "MONTHLY",
    grossValueCents: subscription.monthlyValueCents ?? 0,
    netValueCents: Math.max(0, (subscription.monthlyValueCents ?? 0) - subscription.discountCents),
    latestInvoice: subscription.invoices?.[0] ?? null,
    limitsSnapshot: coerceLimits(subscription.limitsSnapshot),
    featuresSnapshot: coerceFeatures(subscription.featuresSnapshot),
    inconsistent: !subscription.tenant || !subscription.plan,
  };
}

function serializeInvoice(invoice: {
  id: string;
  tenantId: string | null;
  subscriptionId: string;
  number: string;
  status: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  released: boolean;
  releasedAt: Date | null;
  dueAt: Date;
  referenceDate: Date | null;
  reference: string | null;
  couponCode: string | null;
  notes: string | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: {
    id: string;
    name: string;
    slug: string;
    platformClient?: { city: string; state: string } | null;
  } | null;
  subscription:
    | ({
        plan: { id: string; code: string; name: string; status: string } | null;
        client?: { id: string; name: string; city: string; state: string } | null;
      } & {
        id: string;
        tenantId: string | null;
        planId: string;
        status: string;
      })
    | null;
}) {
  return {
    ...invoice,
    tenant: invoice.tenant,
    subscription: invoice.subscription,
    client: invoice.subscription?.client ?? null,
    inconsistent: !invoice.subscription || !invoice.subscription.plan,
  };
}

function jsonRecord(value: unknown): Record<string, boolean | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, boolean | number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) {
      result[key] = item;
    }
  }
  return result;
}
