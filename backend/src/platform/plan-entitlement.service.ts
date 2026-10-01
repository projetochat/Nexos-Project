import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type Limits = {
  maxUsers: number;
  maxConnections: number;
  maxCampaigns: number;
  maxContacts: number;
  maxCampaignRecipients: number;
  maxStorageBytes: number;
};

type Features = {
  chat: boolean;
  campaigns: boolean;
  tickets: boolean;
  multipleConnections: boolean;
  storage: boolean;
  realtime: boolean;
  contacts: boolean;
  groups: boolean;
  conversationHistory: boolean;
  quickMessages: boolean;
  appointments: boolean;
};

@Injectable()
export class PlanEntitlementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getEntitlements(tenantId: string) {
    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] } },
      orderBy: { createdAt: "desc" },
      include: {
        plan: true,
        tenant: { select: { maxUsers: true, maxConnections: true } },
      },
    });
    if (!subscription) {
      throw new ForbiddenException({ code: "PLAN_FEATURE_NOT_AVAILABLE" });
    }
    const limits = coerceLimits(subscription.limitsSnapshot);
    if (!subscription.tenant) {
      throw new ForbiddenException({ code: "TENANT_NOT_OPERATIONAL" });
    }
    if (subscription.tenant.maxUsers != null) limits.maxUsers = subscription.tenant.maxUsers;
    if (subscription.tenant.maxConnections != null) {
      limits.maxConnections = subscription.tenant.maxConnections;
    }
    return {
      subscriptionId: subscription.id,
      planId: subscription.planId,
      planCode: subscription.plan.code,
      status: subscription.status,
      limits,
      features: coerceFeatures(subscription.featuresSnapshot),
    };
  }

  async getUsage(tenantId: string) {
    const periodStart = startOfMonth(new Date());
    const [
      activeUsers,
      connections,
      contacts,
      customers,
      conversations,
      messagesThisPeriod,
      tickets,
      campaignsThisPeriod,
      campaignRecipientsThisPeriod,
      storage,
    ] = await this.prisma.$transaction([
      this.prisma.tenantMembership.count({
        where: { tenantId, status: "ACTIVE", user: { status: "ACTIVE" } },
      }),
      this.prisma.messagingConnection.count({
        where: { tenantId, archivedAt: null, status: { not: "REMOVED" } },
      }),
      this.prisma.contact.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.customer.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.conversation.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.message.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
      this.prisma.ticket.count({ where: { tenantId, archivedAt: null } }),
      this.prisma.campaign.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
      this.prisma.campaignRecipient.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
      this.prisma.ticketAttachment.aggregate({
        where: { tenantId, deletedAt: null, status: "READY" },
        _sum: { sizeBytes: true },
      }),
    ]);
    return {
      activeUsers,
      connections,
      contacts,
      customers,
      conversations,
      messagesThisPeriod,
      storageBytes: storage._sum.sizeBytes ?? 0,
      tickets,
      campaignsThisPeriod,
      campaignRecipientsThisPeriod,
    };
  }

  async assertTenantOperational(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, authRevokedAt: true },
    });
    if (!tenant || !["ACTIVE", "TRIAL"].includes(tenant.status)) {
      throw new ForbiddenException({ code: "TENANT_NOT_OPERATIONAL" });
    }
  }

  async assertFeature(tenantId: string, feature: keyof Features) {
    await this.assertTenantOperational(tenantId);
    const entitlements = await this.getEntitlements(tenantId);
    if (!entitlements.features[feature]) {
      throw new ForbiddenException({ code: "PLAN_FEATURE_NOT_AVAILABLE" });
    }
  }

  async assertWithinLimit(
    tenantId: string,
    metric: keyof Limits,
    currentValue: number,
    increment = 1,
  ) {
    const entitlements = await this.getEntitlements(tenantId);
    const limit = entitlements.limits[metric];
    if (Number.isFinite(limit) && limit >= 0 && currentValue + increment > limit) {
      throw new ConflictException({ code: limitCode(metric), details: { limit, currentValue } });
    }
  }
}

export function coerceLimits(value: unknown): Limits {
  const raw = asRecord(value);
  return {
    maxUsers: readPositive(raw.maxUsers, 3),
    maxConnections: readPositive(raw.maxConnections, 1),
    maxCampaigns: readPositive(raw.maxCampaigns, readPositive(raw.maxCampaignRecipients, 0)),
    maxContacts: readPositive(raw.maxContacts, 1000),
    maxCampaignRecipients: readPositive(raw.maxCampaignRecipients, 0),
    maxStorageBytes: readPositive(raw.maxStorageBytes, 50 * 1024 * 1024),
  };
}

export function coerceFeatures(value: unknown): Features {
  const raw = asRecord(value);
  return {
    chat: raw.chat !== false,
    campaigns: raw.campaigns === true,
    tickets: raw.tickets !== false,
    multipleConnections: raw.multipleConnections === true,
    storage: raw.storage !== false,
    realtime: raw.realtime !== false,
    contacts: raw.contacts !== false,
    groups: raw.groups !== false,
    conversationHistory: raw.conversationHistory !== false,
    quickMessages: raw.quickMessages !== false,
    appointments: raw.appointments !== false,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositive(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function limitCode(metric: keyof Limits) {
  const codes: Record<keyof Limits, string> = {
    maxUsers: "PLAN_LIMIT_USERS_REACHED",
    maxConnections: "PLAN_LIMIT_CONNECTIONS_REACHED",
    maxCampaigns: "PLAN_LIMIT_CAMPAIGNS_REACHED",
    maxContacts: "PLAN_LIMIT_CONTACTS_REACHED",
    maxCampaignRecipients: "PLAN_LIMIT_CAMPAIGN_RECIPIENTS_REACHED",
    maxStorageBytes: "PLAN_LIMIT_STORAGE_REACHED",
  };
  return codes[metric];
}
