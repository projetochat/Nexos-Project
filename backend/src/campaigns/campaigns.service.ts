import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthenticatedUser } from "../auth/auth.types";
import { normalizePhone } from "../crm/phone-normalization";
import {
  Campaign,
  CampaignAudienceType,
  CampaignRecipientSkipReason,
  CampaignRecipientStatus,
  CampaignStatus,
  CampaignTagMatchMode,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  OutboxEventStatus,
  Prisma,
} from "../generated/prisma";
import { OUTBOX_MESSAGING_OUTBOUND_REQUESTED } from "../queue/messaging-outbound.queue";
import { OutboxDispatcherService } from "../queue/outbox-dispatcher.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlanEntitlementService } from "../platform/plan-entitlement.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import type { RealtimeServerEvent } from "../realtime/realtime-events";
import { positiveDelayMs, readCampaignRuntimeConfig } from "./campaign-config";
import { CampaignDispatchQueue } from "./campaign-dispatch.queue";
import {
  AudiencePreviewDto,
  CampaignAudienceDto,
  CreateCampaignDto,
  ListCampaignRecipientsQueryDto,
  ListCampaignsQueryDto,
  ScheduleCampaignDto,
  StartCampaignDto,
  UpdateCampaignDto,
  UpdateMarketingPreferenceDto,
} from "./dto/campaign.dto";

const OUTBOX_CAMPAIGN_DISPATCH_REQUESTED = "campaign.dispatch.requested";
const OUTBOX_CAMPAIGN_CANCEL_REQUESTED = "campaign.cancel.requested";
const OUTBOX_CAMPAIGN_RESUME_REQUESTED = "campaign.resume.requested";
const MUTABLE_STATUSES = [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED] as const;
const EXECUTION_LOCKED_STATUSES = [
  CampaignStatus.QUEUED,
  CampaignStatus.RUNNING,
  CampaignStatus.COMPLETED,
  CampaignStatus.CANCELLED,
] as const;

type DbClient = PrismaService | Prisma.TransactionClient;
type AudienceContact = Prisma.ContactGetPayload<{
  include: {
    customer: true;
    tags: true;
    messagingPreferences: true;
  };
}>;

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CampaignDispatchQueue) private readonly campaignQueue: CampaignDispatchQueue,
    @Inject(OutboxDispatcherService) private readonly outboxDispatcher: OutboxDispatcherService,
    @Inject(PlanEntitlementService) private readonly entitlements: PlanEntitlementService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async list(query: ListCampaignsQueryDto, current: AuthenticatedUser) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where: Prisma.CampaignWhereInput = {
      tenantId: current.tenantId,
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.connectionId ? { connectionId: query.connectionId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: { connection: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return {
      items: items.map((campaign) => this.serialize(campaign)),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async detail(id: string, current: AuthenticatedUser) {
    return this.serialize(await this.findCampaign(id, current.tenantId));
  }

  async create(dto: CreateCampaignDto, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "campaigns");
    const audience = this.normalizeAudience(dto.audience);
    await this.assertConnection(dto.connectionId, current.tenantId);
    await this.assertAudienceReferences(audience, current.tenantId);
    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId: current.tenantId,
        name: cleanText(dto.name, 120),
        description: dto.description ? cleanText(dto.description, 500) : null,
        messageText: cleanMessage(dto.messageText),
        connectionId: dto.connectionId,
        audienceType: audience.type,
        audienceTagMatchMode: audience.tagMatchMode,
        audienceTagIds: audience.tagIds,
        audienceCustomerIds: audience.customerIds,
        audienceContactIds: audience.contactIds,
        timezone: dto.timezone ?? "America/Sao_Paulo",
        createdByMembershipId: current.membershipId,
      },
      include: { connection: true },
    });
    this.publishCampaign(campaign, "campaign.created");
    return this.serialize(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto, current: AuthenticatedUser) {
    const existing = await this.findCampaign(id, current.tenantId);
    if (!MUTABLE_STATUSES.includes(existing.status as (typeof MUTABLE_STATUSES)[number])) {
      throw canonicalConflict(
        "CAMPAIGN_IMMUTABLE_AFTER_START",
        "A campanha nao pode ser alterada apos o inicio.",
      );
    }
    if (EXECUTION_LOCKED_STATUSES.includes(existing.status as never)) {
      throw canonicalConflict(
        "CAMPAIGN_IMMUTABLE_AFTER_START",
        "A campanha nao pode ser alterada apos o inicio.",
      );
    }
    const audience = dto.audience ? this.normalizeAudience(dto.audience) : null;
    if (dto.connectionId) await this.assertConnection(dto.connectionId, current.tenantId);
    if (audience) await this.assertAudienceReferences(audience, current.tenantId);
    const updated = await this.prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name: dto.name ? cleanText(dto.name, 120) : undefined,
        description:
          dto.description === undefined
            ? undefined
            : dto.description
              ? cleanText(dto.description, 500)
              : null,
        messageText: dto.messageText ? cleanMessage(dto.messageText) : undefined,
        connectionId: dto.connectionId,
        audienceType: audience?.type,
        audienceTagMatchMode: audience?.tagMatchMode,
        audienceTagIds: audience?.tagIds,
        audienceCustomerIds: audience?.customerIds,
        audienceContactIds: audience?.contactIds,
        timezone: dto.timezone,
        version: { increment: 1 },
      },
      include: { connection: true },
    });
    this.publishCampaign(updated, "campaign.updated");
    return this.serialize(updated);
  }

  async archive(id: string, current: AuthenticatedUser) {
    const campaign = await this.findCampaign(id, current.tenantId);
    if (
      !statusIn(campaign.status, [
        CampaignStatus.DRAFT,
        CampaignStatus.CANCELLED,
        CampaignStatus.COMPLETED,
        CampaignStatus.FAILED,
      ])
    ) {
      throw canonicalConflict(
        "CAMPAIGN_ARCHIVE_INVALID",
        "Campanha em execucao nao pode ser arquivada.",
      );
    }
    return this.serialize(
      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { archivedAt: new Date() },
        include: { connection: true },
      }),
    );
  }

  async preview(dto: AudiencePreviewDto, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "campaigns");
    const audience = this.normalizeAudience(dto.audience);
    await this.assertAudienceReferences(audience, current.tenantId);
    const result = await this.resolveAudience(
      audience,
      cleanMessage(dto.messageText),
      current.tenantId,
    );
    return this.previewPayload(result);
  }

  async start(id: string, dto: StartCampaignDto, current: AuthenticatedUser) {
    if (!dto.confirm)
      throw canonicalBadRequest(
        "CAMPAIGN_CONFIRMATION_REQUIRED",
        "Confirmacao explicita obrigatoria.",
      );
    await this.assertQueueAvailable();
    await this.entitlements.assertFeature(current.tenantId, "campaigns");
    const campaign = await this.findCampaign(id, current.tenantId);
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
      throw invalidTransition(campaign.status, CampaignStatus.QUEUED);
    }
    await this.assertConnection(campaign.connectionId, current.tenantId);
    const snapshot = await this.resolveAudience(
      this.audienceFromCampaign(campaign),
      campaign.messageText,
      current.tenantId,
    );
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxCampaignRecipients",
      0,
      snapshot.eligibleCount,
    );
    this.assertStartCounts(snapshot, dto.expectedEligibleCount);
    const queued = await this.createSnapshotAndQueue(
      campaign,
      snapshot,
      current,
      CampaignStatus.QUEUED,
    );
    await this.campaignQueue.enqueue({
      kind: "campaign.prepare",
      tenantId: current.tenantId,
      campaignId: id,
    });
    return this.serialize(queued);
  }

  async schedule(id: string, dto: ScheduleCampaignDto, current: AuthenticatedUser) {
    if (!dto.confirm)
      throw canonicalBadRequest(
        "CAMPAIGN_CONFIRMATION_REQUIRED",
        "Confirmacao explicita obrigatoria.",
      );
    await this.assertQueueAvailable();
    await this.entitlements.assertFeature(current.tenantId, "campaigns");
    const scheduledAt = new Date(dto.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw canonicalBadRequest(
        "CAMPAIGN_SCHEDULED_AT_INVALID",
        "Nao e permitido agendar para horario passado.",
      );
    }
    const campaign = await this.findCampaign(id, current.tenantId);
    if (campaign.status !== CampaignStatus.DRAFT)
      throw invalidTransition(campaign.status, CampaignStatus.SCHEDULED);
    await this.assertConnection(campaign.connectionId, current.tenantId);
    const snapshot = await this.resolveAudience(
      this.audienceFromCampaign(campaign),
      campaign.messageText,
      current.tenantId,
    );
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxCampaignRecipients",
      0,
      snapshot.eligibleCount,
    );
    this.assertStartCounts(snapshot, dto.expectedEligibleCount);
    const scheduled = await this.createSnapshotAndQueue(
      { ...campaign, scheduledAt, timezone: dto.timezone ?? campaign.timezone },
      snapshot,
      current,
      CampaignStatus.SCHEDULED,
    );
    await this.campaignQueue.enqueue(
      { kind: "campaign.prepare", tenantId: current.tenantId, campaignId: id },
      { delay: positiveDelayMs(scheduledAt.getTime()) },
    );
    return this.serialize(scheduled);
  }

  async pause(id: string, current: AuthenticatedUser) {
    const campaign = await this.findCampaign(id, current.tenantId);
    if (!statusIn(campaign.status, [CampaignStatus.QUEUED, CampaignStatus.RUNNING])) {
      throw invalidTransition(campaign.status, CampaignStatus.PAUSED);
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.PAUSED },
      include: { connection: true },
    });
    this.publishCampaign(updated, "campaign.status.updated");
    return this.serialize(updated);
  }

  async resume(id: string, current: AuthenticatedUser) {
    await this.assertQueueAvailable();
    const campaign = await this.findCampaign(id, current.tenantId);
    if (campaign.status !== CampaignStatus.PAUSED)
      throw invalidTransition(campaign.status, CampaignStatus.QUEUED);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.QUEUED },
        include: { connection: true },
      });
      await tx.outboxEvent.upsert({
        where: {
          tenantId_type_aggregateId: {
            tenantId: campaign.tenantId,
            type: OUTBOX_CAMPAIGN_RESUME_REQUESTED,
            aggregateId: campaign.id,
          },
        },
        update: { status: OutboxEventStatus.PENDING, attempts: 0, lastError: null },
        create: {
          tenantId: campaign.tenantId,
          type: OUTBOX_CAMPAIGN_RESUME_REQUESTED,
          aggregateId: campaign.id,
          payload: { tenantId: campaign.tenantId, campaignId: campaign.id },
        },
      });
      return saved;
    });
    await this.campaignQueue.enqueue({
      kind: "campaign.prepare",
      tenantId: current.tenantId,
      campaignId: id,
    });
    this.publishCampaign(updated, "campaign.status.updated");
    return this.serialize(updated);
  }

  async cancel(id: string, current: AuthenticatedUser) {
    await this.assertQueueAvailable();
    const campaign = await this.findCampaign(id, current.tenantId);
    if (
      !statusIn(campaign.status, [
        CampaignStatus.SCHEDULED,
        CampaignStatus.QUEUED,
        CampaignStatus.RUNNING,
        CampaignStatus.PAUSED,
      ])
    ) {
      if (campaign.status === CampaignStatus.CANCELLED) return this.serialize(campaign);
      throw invalidTransition(campaign.status, CampaignStatus.CANCELLING);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.CANCELLING,
          cancelledByMembershipId: current.membershipId,
          cancelledAt: new Date(),
        },
        include: { connection: true },
      });
      await tx.outboxEvent.upsert({
        where: {
          tenantId_type_aggregateId: {
            tenantId: campaign.tenantId,
            type: OUTBOX_CAMPAIGN_CANCEL_REQUESTED,
            aggregateId: campaign.id,
          },
        },
        update: { status: OutboxEventStatus.PENDING, attempts: 0, lastError: null },
        create: {
          tenantId: campaign.tenantId,
          type: OUTBOX_CAMPAIGN_CANCEL_REQUESTED,
          aggregateId: campaign.id,
          payload: { tenantId: campaign.tenantId, campaignId: campaign.id },
        },
      });
      return saved;
    });
    await this.campaignQueue.enqueue({
      kind: "campaign.cancel",
      tenantId: current.tenantId,
      campaignId: id,
    });
    this.publishCampaign(updated, "campaign.status.updated");
    return this.serialize(updated);
  }

  async duplicate(id: string, current: AuthenticatedUser) {
    const source = await this.findCampaign(id, current.tenantId);
    const duplicated = await this.prisma.campaign.create({
      data: {
        tenantId: source.tenantId,
        name: `${source.name} - copia`.slice(0, 120),
        description: source.description,
        messageText: source.messageText,
        connectionId: source.connectionId,
        audienceType: source.audienceType,
        audienceTagMatchMode: source.audienceTagMatchMode,
        audienceTagIds: source.audienceTagIds,
        audienceCustomerIds: source.audienceCustomerIds,
        audienceContactIds: source.audienceContactIds,
        timezone: source.timezone,
        createdByMembershipId: current.membershipId,
      },
      include: { connection: true },
    });
    return this.serialize(duplicated);
  }

  async recipients(id: string, query: ListCampaignRecipientsQueryDto, current: AuthenticatedUser) {
    await this.findCampaign(id, current.tenantId);
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where: Prisma.CampaignRecipientWhereInput = {
      tenantId: current.tenantId,
      campaignId: id,
      ...(query.status ? { status: query.status as CampaignRecipientStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: "insensitive" } },
              { lastErrorCode: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaignRecipient.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.campaignRecipient.count({ where }),
    ]);
    return {
      items: items.map((recipient) => ({
        id: recipient.id,
        contactId: recipient.contactId,
        contactName: recipient.contact.name,
        customerName: recipient.customer?.name ?? null,
        phoneMasked: maskPhone(recipient.normalizedPhone),
        status: recipient.status,
        skipReason: recipient.skipReason,
        messageId: recipient.messageId,
        attempts: recipient.attempts,
        lastErrorCode: recipient.lastErrorCode,
        createdAt: recipient.createdAt,
        updatedAt: recipient.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async stats(id: string, current: AuthenticatedUser) {
    const campaign = await this.findCampaign(id, current.tenantId);
    return this.counters(campaign);
  }

  async updateContactPreference(
    contactId: string,
    dto: UpdateMarketingPreferenceDto,
    current: AuthenticatedUser,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId: current.tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException("Contato nao encontrado.");
    const preference = await this.prisma.contactMessagingPreference.upsert({
      where: {
        tenantId_contactId_channel: {
          tenantId: current.tenantId,
          contactId,
          channel: "WHATSAPP",
        },
      },
      update: {
        marketingAllowed: dto.marketingAllowed,
        optedOutAt: dto.marketingAllowed ? null : new Date(),
        source: dto.source?.trim() || "manual",
      },
      create: {
        tenantId: current.tenantId,
        contactId,
        channel: "WHATSAPP",
        marketingAllowed: dto.marketingAllowed,
        optedOutAt: dto.marketingAllowed ? null : new Date(),
        source: dto.source?.trim() || "manual",
      },
    });
    return preference;
  }

  async reconcileScheduledCampaigns() {
    if (!this.campaignQueue.enabled()) return { scheduled: 0 };
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.SCHEDULED, archivedAt: null, scheduledAt: { not: null } },
      select: { id: true, tenantId: true, scheduledAt: true },
      take: 100,
    });
    for (const campaign of campaigns) {
      await this.campaignQueue.enqueue(
        { kind: "campaign.prepare", tenantId: campaign.tenantId, campaignId: campaign.id },
        { delay: positiveDelayMs(campaign.scheduledAt?.getTime() ?? Date.now()) },
      );
    }
    return { scheduled: campaigns.length };
  }

  async prepareDispatch(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.archivedAt) return { skipped: true };
    if (
      campaign.status === CampaignStatus.SCHEDULED &&
      campaign.scheduledAt &&
      campaign.scheduledAt.getTime() > Date.now()
    ) {
      await this.campaignQueue.enqueue(
        { kind: "campaign.prepare", tenantId: campaign.tenantId, campaignId },
        { delay: positiveDelayMs(campaign.scheduledAt.getTime()) },
      );
      return { rescheduled: true };
    }
    if (!statusIn(campaign.status, [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED]))
      return { skipped: true, status: campaign.status };
    const claimed = await this.prisma.campaign.updateMany({
      where: { id: campaign.id, status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED] } },
      data: { status: CampaignStatus.RUNNING, startedAt: campaign.startedAt ?? new Date() },
    });
    if (claimed.count !== 1) return { skipped: true };
    const batchSize = readCampaignRuntimeConfig(this.config).batchSize;
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: CampaignRecipientStatus.PENDING },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
    });
    for (const recipient of recipients) {
      await this.prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: CampaignRecipientStatus.PENDING },
        data: { status: CampaignRecipientStatus.QUEUED, queuedAt: new Date() },
      });
      await this.campaignQueue.enqueue({
        kind: "campaign.recipient.send",
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        recipientId: recipient.id,
      });
    }
    await this.campaignQueue.enqueue({
      kind: "campaign.finalize",
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
    });
    return { queued: recipients.length };
  }

  async dispatchRecipient(campaignId: string, recipientId: string, attempt: number) {
    const recipient = await this.prisma.campaignRecipient.findFirst({
      where: { id: recipientId, campaignId },
      include: {
        campaign: true,
        contact: { include: { customer: true, messagingPreferences: true } },
      },
    });
    if (!recipient) return { skipped: true };
    if (recipient.status === CampaignRecipientStatus.SENT || recipient.messageId)
      return { skipped: true };
    const campaign = recipient.campaign;
    if (campaign.status === CampaignStatus.PAUSED) {
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: CampaignRecipientStatus.PENDING },
      });
      return { paused: true };
    }
    if (statusIn(campaign.status, [CampaignStatus.CANCELLING, CampaignStatus.CANCELLED])) {
      await this.cancelRecipient(recipient.id);
      return { cancelled: true };
    }
    if (campaign.status !== CampaignStatus.RUNNING)
      return { skipped: true, status: campaign.status };
    const preference = recipient.contact.messagingPreferences.find(
      (item) => item.channel === "WHATSAPP",
    );
    if (preference && !preference.marketingAllowed) {
      await this.skipRecipient(recipient.id, CampaignRecipientSkipReason.OPT_OUT);
      await this.incrementCampaign(campaign.id, { skippedCount: 1, optedOutCount: 1 });
      return { skipped: true, reason: CampaignRecipientSkipReason.OPT_OUT };
    }
    const claim = await this.prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: CampaignRecipientStatus.QUEUED },
      data: {
        status: CampaignRecipientStatus.PROCESSING,
        processingAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claim.count !== 1) return { skipped: true };
    try {
      const messageId = await this.createCampaignMessage(recipient, attempt);
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: new Date(),
          messageId,
          lastErrorCode: null,
        },
      });
      await this.incrementCampaign(campaign.id, { sentCount: 1 });
      await this.outboxDispatcher.dispatchMessage(messageId);
      await this.campaignQueue.enqueue({
        kind: "campaign.prepare",
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
      });
      return { messageId };
    } catch (error) {
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: CampaignRecipientStatus.FAILED,
          failedAt: new Date(),
          lastErrorCode: canonicalErrorCode(error),
        },
      });
      await this.incrementCampaign(campaign.id, { failedCount: 1 });
      this.logger.warn({
        event: "campaign.recipient.failed",
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        recipientId: recipient.id,
        attempt,
        errorCode: canonicalErrorCode(error),
      });
      throw error;
    }
  }

  async finalizeDispatch(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return { skipped: true };
    if (campaign.status === CampaignStatus.CANCELLING) return this.finishCancellation(campaignId);
    if (campaign.status !== CampaignStatus.RUNNING)
      return { skipped: true, status: campaign.status };
    const open = await this.prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: {
          in: [
            CampaignRecipientStatus.PENDING,
            CampaignRecipientStatus.QUEUED,
            CampaignRecipientStatus.PROCESSING,
          ],
        },
      },
    });
    if (open > 0) return { open };
    const failed = await this.prisma.campaignRecipient.count({
      where: { campaignId, status: CampaignRecipientStatus.FAILED },
    });
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: failed > 0 ? CampaignStatus.FAILED : CampaignStatus.COMPLETED,
        completedAt: new Date(),
        lastErrorCode: failed > 0 ? "CAMPAIGN_RECIPIENT_FAILURES" : null,
      },
      include: { connection: true },
    });
    this.publishCampaign(updated, failed > 0 ? "campaign.failed" : "campaign.completed");
    return this.counters(updated);
  }

  async finishCancellation(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return { skipped: true };
    const now = new Date();
    const cancelled = await this.prisma.campaignRecipient.updateMany({
      where: {
        campaignId,
        status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED] },
      },
      data: {
        status: CampaignRecipientStatus.CANCELLED,
        skipReason: CampaignRecipientSkipReason.CAMPAIGN_CANCELLED,
        failedAt: now,
      },
    });
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.CANCELLED,
        cancelledAt: campaign.cancelledAt ?? now,
        cancelledCount: { increment: cancelled.count },
      },
      include: { connection: true },
    });
    this.publishCampaign(updated, "campaign.cancelled");
    return this.counters(updated);
  }

  private async createCampaignMessage(
    recipient: Prisma.CampaignRecipientGetPayload<{
      include: { campaign: true; contact: { include: { customer: true } } };
    }>,
    attempt: number,
  ) {
    const campaign = recipient.campaign;
    const content =
      recipient.renderedMessage || this.renderMessage(campaign.messageText, recipient.contact);
    if (content.length > 4000)
      throw canonicalBadRequest(
        "CAMPAIGN_MESSAGE_TOO_LONG",
        "Mensagem renderizada excede o limite permitido.",
      );
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const conversation = await this.resolveConversation(tx, {
        tenantId: campaign.tenantId,
        contactId: recipient.contactId,
        connectionId: campaign.connectionId,
      });
      const saved = await tx.message.create({
        data: {
          tenantId: campaign.tenantId,
          conversationId: conversation.id,
          connectionId: campaign.connectionId,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          authorMembershipId: campaign.createdByMembershipId,
          content,
          clientMessageId: `campaign:${recipient.id}`,
          campaignId: campaign.id,
          campaignRecipientId: recipient.id,
          createdAt: now,
        },
      });
      await tx.conversation.update({
        where: { tenantId_id: { tenantId: campaign.tenantId, id: conversation.id } },
        data: { lastMessagePreview: truncatePreview(content), lastMessageAt: now },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: campaign.tenantId,
          type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
          aggregateId: saved.id,
          payload: { tenantId: campaign.tenantId, messageId: saved.id },
        },
      });
      return saved;
    });
    this.logger.log({
      event: "campaign.recipient.sent",
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      messageId: message.id,
      connectionId: campaign.connectionId,
      attempt,
    });
    return message.id;
  }

  private async resolveConversation(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; contactId: string; connectionId: string },
  ) {
    const existing = await tx.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        contactId: input.contactId,
        connectionId: input.connectionId,
        isGroup: false,
        archivedAt: null,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    if (existing) return existing;
    return tx.conversation.create({
      data: {
        tenantId: input.tenantId,
        contactId: input.contactId,
        connectionId: input.connectionId,
        status: ConversationStatus.ABERTA,
        isGroup: false,
      },
    });
  }

  private async createSnapshotAndQueue(
    campaign: Campaign,
    snapshot: Awaited<ReturnType<CampaignsService["resolveAudience"]>>,
    current: AuthenticatedUser,
    status: CampaignStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.campaignRecipient.deleteMany({
        where: { tenantId: campaign.tenantId, campaignId: campaign.id },
      });
      if (snapshot.recipients.length) {
        await tx.campaignRecipient.createMany({
          data: snapshot.recipients.map((recipient) => ({
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            contactId: recipient.contact.id,
            customerId: recipient.contact.customerId,
            normalizedPhone: recipient.contact.normalizedPhone,
            displayName: recipient.contact.name,
            renderedMessage: recipient.renderedMessage,
            status: CampaignRecipientStatus.PENDING,
          })),
          skipDuplicates: true,
        });
      }
      if (snapshot.skipped.length) {
        await tx.campaignRecipient.createMany({
          data: snapshot.skipped.map((recipient) => ({
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            contactId: recipient.contact.id,
            customerId: recipient.contact.customerId,
            normalizedPhone: recipient.contact.normalizedPhone,
            displayName: recipient.contact.name,
            status: CampaignRecipientStatus.SKIPPED,
            skipReason: recipient.reason,
          })),
          skipDuplicates: true,
        });
      }
      const updated = await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status,
          scheduledAt: status === CampaignStatus.SCHEDULED ? campaign.scheduledAt : null,
          timezone: campaign.timezone,
          totalCount: snapshot.totalCount,
          eligibleCount: snapshot.eligibleCount,
          invalidPhoneCount: snapshot.invalidPhoneCount,
          optedOutCount: snapshot.optedOutCount,
          duplicateCount: snapshot.duplicateCount,
          blockedCount: snapshot.blockedCount,
          skippedCount: snapshot.skipped.length,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          failedCount: 0,
          cancelledCount: 0,
          lastErrorCode: null,
        },
        include: { connection: true },
      });
      await tx.outboxEvent.upsert({
        where: {
          tenantId_type_aggregateId: {
            tenantId: campaign.tenantId,
            type: OUTBOX_CAMPAIGN_DISPATCH_REQUESTED,
            aggregateId: campaign.id,
          },
        },
        update: { status: OutboxEventStatus.PENDING, attempts: 0, lastError: null },
        create: {
          tenantId: campaign.tenantId,
          type: OUTBOX_CAMPAIGN_DISPATCH_REQUESTED,
          aggregateId: campaign.id,
          payload: {
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            requestedByMembershipId: current.membershipId,
          },
        },
      });
      return updated;
    });
  }

  private async resolveAudience(
    audience: NormalizedAudience,
    messageText: string,
    tenantId: string,
  ) {
    const where = await this.audienceWhere(audience, tenantId);
    const contacts = await this.prisma.contact.findMany({
      where,
      include: { customer: true, tags: true, messagingPreferences: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: this.maxRecipients() + 1,
    });
    if (contacts.length > this.maxRecipients()) {
      throw canonicalBadRequest(
        "CAMPAIGN_MAX_RECIPIENTS_EXCEEDED",
        "A campanha excede o limite permitido.",
      );
    }
    const seen = new Set<string>();
    const recipients: Array<{ contact: AudienceContact; renderedMessage: string }> = [];
    const skipped: Array<{ contact: AudienceContact; reason: CampaignRecipientSkipReason }> = [];
    let invalidPhoneCount = 0;
    let optedOutCount = 0;
    let duplicateCount = 0;

    for (const contact of contacts) {
      const normalized = safeNormalize(contact.normalizedPhone || contact.phone);
      if (!normalized) {
        invalidPhoneCount += 1;
        skipped.push({ contact, reason: CampaignRecipientSkipReason.INVALID_PHONE });
        continue;
      }
      if (seen.has(contact.id) || seen.has(normalized)) {
        duplicateCount += 1;
        skipped.push({ contact, reason: CampaignRecipientSkipReason.DUPLICATE });
        continue;
      }
      seen.add(contact.id);
      seen.add(normalized);
      const preference = contact.messagingPreferences.find((item) => item.channel === "WHATSAPP");
      if (preference && !preference.marketingAllowed) {
        optedOutCount += 1;
        skipped.push({ contact, reason: CampaignRecipientSkipReason.OPT_OUT });
        continue;
      }
      const renderedMessage = this.renderMessage(messageText, contact);
      if (
        !renderedMessage ||
        renderedMessage.length > 4000 ||
        /\{\{[^}]+}}/.test(renderedMessage)
      ) {
        skipped.push({ contact, reason: CampaignRecipientSkipReason.TEMPLATE_RENDER_FAILED });
        continue;
      }
      recipients.push({ contact: { ...contact, normalizedPhone: normalized }, renderedMessage });
    }

    return {
      totalCount: contacts.length,
      eligibleCount: recipients.length,
      invalidPhoneCount,
      optedOutCount,
      duplicateCount,
      blockedCount: 0,
      recipients,
      skipped,
    };
  }

  private previewPayload(result: Awaited<ReturnType<CampaignsService["resolveAudience"]>>) {
    return {
      eligibleCount: result.eligibleCount,
      invalidPhoneCount: result.invalidPhoneCount,
      optedOutCount: result.optedOutCount,
      duplicateCount: result.duplicateCount,
      blockedCount: result.blockedCount,
      sample: result.recipients.slice(0, 10).map((item) => ({
        contactId: item.contact.id,
        contactName: item.contact.name,
        customerName: item.contact.customer?.name ?? null,
        phoneMasked: maskPhone(item.contact.normalizedPhone),
        renderedMessage: item.renderedMessage,
      })),
    };
  }

  private async audienceWhere(
    audience: NormalizedAudience,
    tenantId: string,
  ): Promise<Prisma.ContactWhereInput> {
    const base: Prisma.ContactWhereInput = { tenantId, archivedAt: null };
    if (audience.type === CampaignAudienceType.ALL) return base;
    if (audience.type === CampaignAudienceType.CONTACTS)
      return { ...base, id: { in: audience.contactIds } };
    if (audience.type === CampaignAudienceType.CUSTOMERS)
      return { ...base, customerId: { in: audience.customerIds } };
    if (audience.type === CampaignAudienceType.TAGS) {
      if (audience.tagMatchMode === CampaignTagMatchMode.ALL) {
        return {
          ...base,
          AND: audience.tagIds.map((tagId) => ({ tags: { some: { tenantId, tagId } } })),
        };
      }
      return { ...base, tags: { some: { tenantId, tagId: { in: audience.tagIds } } } };
    }
    return base;
  }

  private renderMessage(
    template: string,
    contact: { name: string; customer?: { name: string } | null },
  ) {
    return template
      .replace(/\{\{\s*contact\.name\s*}}/g, escapeTemplateValue(contact.name || "contato"))
      .replace(/\{\{\s*customer\.name\s*}}/g, escapeTemplateValue(contact.customer?.name || ""));
  }

  private async assertConnection(connectionId: string, tenantId: string) {
    const connection = await this.prisma.messagingConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!connection) throw new BadRequestException("A conexao selecionada nao pertence ao tenant.");
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      connection.status !== MessagingConnectionStatus.CONNECTED
    ) {
      throw canonicalBadRequest(
        "CAMPAIGN_CONNECTION_UNAVAILABLE",
        "A conexao selecionada nao esta disponivel.",
      );
    }
    return connection;
  }

  private async assertAudienceReferences(audience: NormalizedAudience, tenantId: string) {
    if (audience.type === CampaignAudienceType.TAGS && audience.tagIds.length === 0) {
      throw canonicalBadRequest("CAMPAIGN_AUDIENCE_EMPTY", "Selecione ao menos uma Tag.");
    }
    if (audience.type === CampaignAudienceType.CONTACTS && audience.contactIds.length === 0) {
      throw canonicalBadRequest("CAMPAIGN_AUDIENCE_EMPTY", "Selecione ao menos um Contact.");
    }
    if (audience.type === CampaignAudienceType.CUSTOMERS && audience.customerIds.length === 0) {
      throw canonicalBadRequest("CAMPAIGN_AUDIENCE_EMPTY", "Selecione ao menos um Customer.");
    }
    const [tags, contacts, customers] = await Promise.all([
      audience.tagIds.length
        ? this.prisma.tag.count({
            where: { tenantId, id: { in: audience.tagIds }, archivedAt: null },
          })
        : 0,
      audience.contactIds.length
        ? this.prisma.contact.count({
            where: { tenantId, id: { in: audience.contactIds }, archivedAt: null },
          })
        : 0,
      audience.customerIds.length
        ? this.prisma.customer.count({
            where: { tenantId, id: { in: audience.customerIds }, archivedAt: null },
          })
        : 0,
    ]);
    if (tags !== audience.tagIds.length)
      throw new ForbiddenException("Tag fora do tenant ou arquivada.");
    if (contacts !== audience.contactIds.length)
      throw new ForbiddenException("Contact fora do tenant ou arquivado.");
    if (customers !== audience.customerIds.length)
      throw new ForbiddenException("Customer fora do tenant ou arquivado.");
  }

  private assertStartCounts(
    snapshot: Awaited<ReturnType<CampaignsService["resolveAudience"]>>,
    expected?: number,
  ) {
    if (snapshot.eligibleCount < 1) {
      throw canonicalBadRequest(
        "CAMPAIGN_NO_ELIGIBLE_RECIPIENTS",
        "Nenhum destinatario elegivel foi encontrado.",
      );
    }
    if (expected !== undefined && expected !== snapshot.eligibleCount) {
      throw canonicalBadRequest(
        "CAMPAIGN_AUDIENCE_CHANGED",
        "O publico mudou desde a ultima pre-visualizacao.",
      );
    }
  }

  private async assertQueueAvailable() {
    if (!this.campaignQueue.enabled())
      throw new ServiceUnavailableException("Fila de campanhas indisponivel.");
    const health = await this.campaignQueue.health().catch(() => ({ ok: false }));
    if (!health.ok) throw new ServiceUnavailableException("Fila de campanhas indisponivel.");
  }

  private normalizeAudience(audience: CampaignAudienceDto): NormalizedAudience {
    const tagIds = unique(audience.tagIds ?? []);
    const customerIds = unique(audience.customerIds ?? []);
    const contactIds = unique(audience.contactIds ?? []);
    return {
      type: audience.type,
      tagMatchMode:
        audience.type === CampaignAudienceType.TAGS
          ? (audience.tagMatchMode ?? CampaignTagMatchMode.ANY)
          : null,
      tagIds: audience.type === CampaignAudienceType.TAGS ? tagIds : [],
      customerIds: audience.type === CampaignAudienceType.CUSTOMERS ? customerIds : [],
      contactIds: audience.type === CampaignAudienceType.CONTACTS ? contactIds : [],
    };
  }

  private audienceFromCampaign(
    campaign: Pick<
      Campaign,
      | "audienceType"
      | "audienceTagMatchMode"
      | "audienceTagIds"
      | "audienceCustomerIds"
      | "audienceContactIds"
    >,
  ): NormalizedAudience {
    return {
      type: campaign.audienceType,
      tagMatchMode: campaign.audienceTagMatchMode,
      tagIds: campaign.audienceTagIds,
      customerIds: campaign.audienceCustomerIds,
      contactIds: campaign.audienceContactIds,
    };
  }

  private async findCampaign(id: string, tenantId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: { connection: true },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");
    return campaign;
  }

  private async skipRecipient(id: string, reason: CampaignRecipientSkipReason) {
    return this.prisma.campaignRecipient.update({
      where: { id },
      data: { status: CampaignRecipientStatus.SKIPPED, skipReason: reason },
    });
  }

  private async cancelRecipient(id: string) {
    return this.prisma.campaignRecipient.update({
      where: { id },
      data: {
        status: CampaignRecipientStatus.CANCELLED,
        skipReason: CampaignRecipientSkipReason.CAMPAIGN_CANCELLED,
      },
    });
  }

  private async incrementCampaign(
    id: string,
    data: Partial<Record<"sentCount" | "failedCount" | "skippedCount" | "optedOutCount", number>>,
  ) {
    await this.prisma.campaign.update({
      where: { id },
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, { increment: value ?? 0 }]),
      ) as Prisma.CampaignUpdateInput,
    });
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (campaign) this.publishProgress(campaign);
  }

  private maxRecipients() {
    return readCampaignRuntimeConfig(this.config).maxRecipients;
  }

  private publishCampaign(campaign: Campaign, event: RealtimeServerEvent) {
    this.realtime?.publishCampaignEvent({
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      event,
      status: campaign.status,
      counters: this.counters(campaign),
      updatedAt: campaign.updatedAt,
    });
  }

  private publishProgress(campaign: Campaign) {
    this.publishCampaign(campaign, "campaign.progress.updated");
  }

  private counters(
    campaign: Pick<
      Campaign,
      | "id"
      | "status"
      | "totalCount"
      | "eligibleCount"
      | "sentCount"
      | "deliveredCount"
      | "readCount"
      | "failedCount"
      | "skippedCount"
      | "cancelledCount"
      | "updatedAt"
    >,
  ) {
    return {
      campaignId: campaign.id,
      status: campaign.status,
      total: campaign.totalCount,
      eligible: campaign.eligibleCount,
      sent: campaign.sentCount,
      delivered: campaign.deliveredCount,
      read: campaign.readCount,
      failed: campaign.failedCount,
      skipped: campaign.skippedCount,
      cancelled: campaign.cancelledCount,
      updatedAt: campaign.updatedAt,
    };
  }

  private serialize(
    campaign: Campaign & {
      connection?: {
        id: string;
        name: string;
        providerType: MessagingProviderType;
        status: MessagingConnectionStatus;
      };
    },
  ) {
    return {
      id: campaign.id,
      tenantId: campaign.tenantId,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      messageType: campaign.messageType,
      messageText: campaign.messageText,
      connectionId: campaign.connectionId,
      connection: campaign.connection
        ? {
            id: campaign.connection.id,
            name: campaign.connection.name,
            providerType: campaign.connection.providerType.toLowerCase(),
            status: campaign.connection.status.toLowerCase(),
          }
        : null,
      audience: this.audienceFromCampaign(campaign),
      timezone: campaign.timezone,
      scheduledAt: campaign.scheduledAt,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      cancelledAt: campaign.cancelledAt,
      version: campaign.version,
      counters: this.counters(campaign),
      lastErrorCode: campaign.lastErrorCode,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}

type NormalizedAudience = {
  type: CampaignAudienceType;
  tagMatchMode: CampaignTagMatchMode | null;
  tagIds: string[];
  customerIds: string[];
  contactIds: string[];
};

function cleanText(value: string, max: number) {
  const text = value.trim();
  if (!text) throw new BadRequestException("Texto obrigatorio.");
  return text.slice(0, max);
}

function cleanMessage(value: string) {
  const text = value.trim();
  if (!text) throw new BadRequestException("Mensagem obrigatoria.");
  if (text.length > 4000)
    throw canonicalBadRequest("CAMPAIGN_MESSAGE_TOO_LONG", "Mensagem excede o limite permitido.");
  return text;
}

function safeNormalize(value: string) {
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `+${digits.slice(0, 2)}******${digits.slice(-4)}`;
}

function truncatePreview(content: string) {
  return content.length > 500 ? `${content.slice(0, 497)}...` : content;
}

function escapeTemplateValue(value: string) {
  return value.replace(/[<>]/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function statusIn(status: CampaignStatus, allowed: CampaignStatus[]) {
  return allowed.includes(status);
}

function canonicalBadRequest(code: string, message: string) {
  return new BadRequestException({ code, message });
}

function canonicalConflict(code: string, message: string) {
  return new ConflictException({ code, message });
}

function invalidTransition(from: CampaignStatus, to: CampaignStatus) {
  return canonicalConflict(
    "CAMPAIGN_STATUS_TRANSITION_INVALID",
    `Transicao invalida de ${from} para ${to}.`,
  );
}

function canonicalErrorCode(error: unknown) {
  if (error instanceof BadRequestException || error instanceof ConflictException) {
    const response = error.getResponse();
    if (response && typeof response === "object" && "code" in response)
      return String(response.code);
  }
  return "CAMPAIGN_RECIPIENT_SEND_FAILED";
}
