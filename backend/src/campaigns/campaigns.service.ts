import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  HttpException,
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
  MessageMediaState,
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
import {
  changedDeletion,
  deletionSnapshot,
  type DeletionImpactPreview,
  type DeletionResult,
} from "../common/deletion-impact";
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

import { MessagingMediaStorageService } from "../messaging/media/messaging-media-storage.service";
import {
  CAMPAIGN_ATTACHMENT_MAX_BYTES,
  normalizeCampaignAttachment,
  readCampaignAttachment,
  writeCampaignAttachment,
  freezeCampaignAttachment,
  readFrozenCampaignAttachment,
  campaignAttachmentMessageType,
  readCampaignAttachmentMetadata,
} from "./campaign-attachment";

const OUTBOX_CAMPAIGN_DISPATCH_REQUESTED = "campaign.dispatch.requested";
const OUTBOX_CAMPAIGN_CANCEL_REQUESTED = "campaign.cancel.requested";
const OUTBOX_CAMPAIGN_RESUME_REQUESTED = "campaign.resume.requested";
export const CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE =
  "CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE";
export const CAMPAIGN_RECIPIENT_CLAIMED = "CAMPAIGN_RECIPIENT_CLAIMED";
export const CAMPAIGN_COMMIT_OUTCOME_UNKNOWN = "CAMPAIGN_COMMIT_OUTCOME_UNKNOWN";
const MUTABLE_STATUSES = [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED] as const;
const EXECUTION_LOCKED_STATUSES = [
  CampaignStatus.QUEUED,
  CampaignStatus.RUNNING,
  CampaignStatus.COMPLETED,
  CampaignStatus.CANCELLED,
] as const;
const DELETABLE_CAMPAIGN_STATUSES = [
  CampaignStatus.DRAFT,
  CampaignStatus.CANCELLED,
  CampaignStatus.COMPLETED,
  CampaignStatus.FAILED,
] as const;
const ACTIVE_CAMPAIGN_RECIPIENT_STATUSES = [
  CampaignRecipientStatus.PENDING,
  CampaignRecipientStatus.QUEUED,
  CampaignRecipientStatus.PROCESSING,
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
    @Optional()
    @Inject(MessagingMediaStorageService)
    private readonly mediaStorage?: MessagingMediaStorageService,
  ) {}

  private attachmentsEnabled() {
    return this.config.get<string>("TRIXUS_CAMPAIGN_ATTACHMENTS_ENABLED") === "true";
  }

  capabilities() {
    return {
      attachmentsEnabled: this.attachmentsEnabled(),
      maxAttachmentBytes: CAMPAIGN_ATTACHMENT_MAX_BYTES,
      types: ["IMAGE", "AUDIO", "DOCUMENT", "VIDEO"],
    };
  }

  private assertAttachmentCapability(campaign: Campaign) {
    if (campaign.messageType && campaign.messageType !== "TEXT" && !this.attachmentsEnabled()) {
      throw new ServiceUnavailableException({
        code: "CAMPAIGN_ATTACHMENTS_DISABLED",
        message: "Anexos de campanhas aguardam ativação.",
      });
    }
  }

  private attachmentInput(value: CreateCampaignDto["attachment"]) {
    if (value && !this.attachmentsEnabled())
      throw new ServiceUnavailableException({
        code: "CAMPAIGN_ATTACHMENTS_DISABLED",
        message: "Anexos de campanhas aguardam ativação.",
      });
    return normalizeCampaignAttachment(value);
  }

  async list(query: ListCampaignsQueryDto, current: AuthenticatedUser) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const where: Prisma.CampaignWhereInput = {
      tenantId: current.tenantId,
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
      items: await Promise.all(items.map((campaign) => this.serialize(campaign, false))),
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
    await this.entitlements.assertWithinLimit(
      current.tenantId,
      "maxCampaigns",
      await this.prisma.campaign.count({
        where: { tenantId: current.tenantId, archivedAt: null },
      }),
    );
    const audience = this.normalizeAudience(dto.audience);
    await this.assertConnection(dto.connectionId, current.tenantId);
    await this.assertAudienceReferences(audience, current.tenantId);
    const attachment = this.attachmentInput(dto.attachment);
    const persist = async (db: DbClient) => {
      const campaign = await db.campaign.create({
        data: {
          tenantId: current.tenantId,
          name: cleanText(dto.name, 120),
          description: dto.description ? cleanText(dto.description, 500) : null,
          messageText: cleanMessage(dto.messageText, !!attachment),
          messageType: (attachment
            ? campaignAttachmentMessageType(attachment.mimeType)
            : MessageType.TEXT) as Campaign["messageType"],
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
      if (attachment) await writeCampaignAttachment(db, current.tenantId, campaign.id, attachment);
      return campaign;
    };
    const campaign = this.attachmentsEnabled()
      ? await this.prisma.$transaction(persist)
      : await persist(this.prisma);
    this.publishCampaign(campaign, "campaign.created");
    return this.serialize(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto, current: AuthenticatedUser) {
    const existing = await this.findCampaign(id, current.tenantId);
    this.assertAttachmentCapability(existing);
    if (!MUTABLE_STATUSES.includes(existing.status as (typeof MUTABLE_STATUSES)[number])) {
      throw canonicalConflict(
        "CAMPAIGN_IMMUTABLE_AFTER_START",
        "A campanha não pode ser alterada após o início.",
      );
    }
    if (EXECUTION_LOCKED_STATUSES.includes(existing.status as never)) {
      throw canonicalConflict(
        "CAMPAIGN_IMMUTABLE_AFTER_START",
        "A campanha não pode ser alterada após o início.",
      );
    }
    const audience = dto.audience ? this.normalizeAudience(dto.audience) : null;
    if (dto.connectionId) await this.assertConnection(dto.connectionId, current.tenantId);
    if (audience) await this.assertAudienceReferences(audience, current.tenantId);
    const enabled = this.attachmentsEnabled();
    const attachment =
      dto.attachment === undefined
        ? enabled
          ? await readCampaignAttachment(this.prisma, current.tenantId, id)
          : null
        : this.attachmentInput(dto.attachment);
    const messageText = cleanMessage(dto.messageText ?? existing.messageText, !!attachment);
    const replacement =
      enabled && existing.status === CampaignStatus.SCHEDULED
        ? await this.resolveAudience(
            audience ?? this.audienceFromCampaign(existing),
            messageText,
            current.tenantId,
            !!attachment,
          )
        : null;
    if (replacement) {
      await this.assertConnection(dto.connectionId ?? existing.connectionId, current.tenantId);
      await this.entitlements.assertWithinLimit(
        current.tenantId,
        "maxCampaignRecipients",
        0,
        replacement.eligibleCount,
      );
    }
    const persist = async (db: DbClient) => {
      const updated = await db.campaign.update({
        where: {
          id: existing.id,
          ...(enabled ? { version: existing.version, status: existing.status } : {}),
        },
        data: {
          name: dto.name ? cleanText(dto.name, 120) : undefined,
          description:
            dto.description === undefined
              ? undefined
              : dto.description
                ? cleanText(dto.description, 500)
                : null,
          messageText,
          messageType: (attachment
            ? campaignAttachmentMessageType(attachment.mimeType)
            : MessageType.TEXT) as Campaign["messageType"],
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
      if (enabled && dto.attachment !== undefined)
        await writeCampaignAttachment(db, current.tenantId, id, attachment);
      if (replacement)
        return this.createSnapshotAndQueue(
          updated,
          replacement,
          current,
          CampaignStatus.SCHEDULED,
          db as Prisma.TransactionClient,
        );
      return updated;
    };
    const updated = enabled
      ? await this.prisma.$transaction(persist).catch((error) => {
          if (error && typeof error === "object" && "code" in error && error.code === "P2025")
            throw canonicalConflict(
              "CAMPAIGN_CHANGED_BEFORE_EDIT",
              "A campanha foi alterada durante a edição. Atualize e tente novamente.",
            );
          throw error;
        })
      : await persist(this.prisma);
    this.publishCampaign(updated, "campaign.updated");
    return this.serialize(updated);
  }

  async deletionImpact(id: string, current: AuthenticatedUser): Promise<DeletionImpactPreview> {
    return (await this.campaignDeletionState(id, current.tenantId, this.prisma)).impact;
  }

  async remove(
    id: string,
    snapshotToken: string,
    current: AuthenticatedUser,
  ): Promise<DeletionResult> {
    const preview = await this.deletionImpact(id, current);
    if (snapshotToken !== preview.snapshotToken) return changedDeletion(preview);

    const result = await this.prisma.$transaction(async (tx) => {
      const state = await this.campaignDeletionState(id, current.tenantId, tx);
      if (snapshotToken !== state.impact.snapshotToken) return changedDeletion(state.impact);
      if (state.activeRecipientCount > 0) {
        throw canonicalConflict(
          "CAMPAIGN_DELETE_RECIPIENTS_ACTIVE",
          "A campanha possui destinatários em processamento e não pode ser excluída.",
        );
      }

      await tx.message.updateMany({
        where: { tenantId: current.tenantId, campaignId: state.campaign.id },
        data: { campaignId: null, campaignRecipientId: null },
      });
      await tx.outboxEvent.deleteMany({
        where: {
          tenantId: current.tenantId,
          aggregateId: state.campaign.id,
          type: {
            in: [
              OUTBOX_CAMPAIGN_DISPATCH_REQUESTED,
              OUTBOX_CAMPAIGN_CANCEL_REQUESTED,
              OUTBOX_CAMPAIGN_RESUME_REQUESTED,
            ],
          },
        },
      });
      await tx.campaignRecipient.deleteMany({
        where: { tenantId: current.tenantId, campaignId: state.campaign.id },
      });
      const deleted = await tx.campaign.deleteMany({
        where: {
          id: state.campaign.id,
          tenantId: current.tenantId,
          archivedAt: null,
          version: state.campaign.version,
          status: state.campaign.status,
          updatedAt: state.campaign.updatedAt,
        },
      });
      if (deleted.count !== 1) {
        throw canonicalConflict(
          "CAMPAIGN_DELETE_CHANGED",
          "A campanha foi alterada durante a exclusão. Atualize os dados e tente novamente.",
        );
      }
      return { status: "deleted" } as const;
    });
    return result;
  }

  async preview(dto: AudiencePreviewDto, current: AuthenticatedUser) {
    await this.entitlements.assertFeature(current.tenantId, "campaigns");
    const audience = this.normalizeAudience(dto.audience);
    await this.assertAudienceReferences(audience, current.tenantId);
    const attachment = this.attachmentInput(dto.attachment);
    const result = await this.resolveAudience(
      audience,
      cleanMessage(dto.messageText, !!attachment),
      current.tenantId,
      !!attachment,
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
    this.assertAttachmentCapability(campaign);
    if (this.attachmentsEnabled() && campaign.status === CampaignStatus.PAUSED)
      return this.resume(id, current);
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.PAUSED) {
      throw invalidTransition(campaign.status, CampaignStatus.QUEUED);
    }
    await this.assertConnection(campaign.connectionId, current.tenantId);
    const snapshot = await this.resolveAudience(
      this.audienceFromCampaign(campaign),
      campaign.messageText,
      current.tenantId,
      campaign.messageType !== "TEXT",
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
        "Não é permitido agendar para horário passado.",
      );
    }
    const campaign = await this.findCampaign(id, current.tenantId);
    this.assertAttachmentCapability(campaign);
    if (campaign.status !== CampaignStatus.DRAFT)
      throw invalidTransition(campaign.status, CampaignStatus.SCHEDULED);
    await this.assertConnection(campaign.connectionId, current.tenantId);
    const snapshot = await this.resolveAudience(
      this.audienceFromCampaign(campaign),
      campaign.messageText,
      current.tenantId,
      campaign.messageType !== "TEXT",
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
    this.assertAttachmentCapability(source);
    const attachment = this.attachmentsEnabled()
      ? await readCampaignAttachment(this.prisma, current.tenantId, id)
      : null;
    const persist = async (db: DbClient) => {
      const duplicated = await db.campaign.create({
        data: {
          tenantId: source.tenantId,
          name: `${source.name} - copia`.slice(0, 120),
          description: source.description,
          messageText: source.messageText,
          messageType: source.messageType,
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
      if (attachment)
        await writeCampaignAttachment(db, current.tenantId, duplicated.id, attachment);
      return duplicated;
    };
    const duplicated = this.attachmentsEnabled()
      ? await this.prisma.$transaction(persist)
      : await persist(this.prisma);
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
    if (!contact) throw new NotFoundException("Contato não encontrado.");
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
    if (!this.campaignQueue.enabled()) {
      return { scheduled: 0, queued: 0, running: 0, cancelling: 0 };
    }
    const counts = { scheduled: 0, queued: 0, running: 0, cancelling: 0 };
    let cursorId: string | undefined;
    for (;;) {
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          status: {
            in: [
              CampaignStatus.SCHEDULED,
              CampaignStatus.QUEUED,
              CampaignStatus.RUNNING,
              CampaignStatus.CANCELLING,
            ],
          },
          archivedAt: null,
        },
        select: { id: true, tenantId: true, status: true, scheduledAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      for (const campaign of campaigns) {
        if (!(await this.campaignModuleEnabled(campaign.tenantId))) continue;
        if (campaign.status === CampaignStatus.CANCELLING) {
          await this.campaignQueue.enqueue(
            { kind: "campaign.cancel", tenantId: campaign.tenantId, campaignId: campaign.id },
            { jobId: `campaign-reconcile-cancel-${campaign.id}` },
          );
          counts.cancelling += 1;
          continue;
        }
        await this.campaignQueue.enqueue(
          { kind: "campaign.prepare", tenantId: campaign.tenantId, campaignId: campaign.id },
          {
            delay:
              campaign.status === CampaignStatus.SCHEDULED
                ? positiveDelayMs(campaign.scheduledAt?.getTime() ?? Date.now())
                : 0,
            jobId: `campaign-reconcile-prepare-${campaign.id}`,
          },
        );
        if (campaign.status === CampaignStatus.SCHEDULED) counts.scheduled += 1;
        else if (campaign.status === CampaignStatus.QUEUED) counts.queued += 1;
        else counts.running += 1;
      }
      if (campaigns.length < 100) break;
      cursorId = campaigns[campaigns.length - 1].id;
    }
    return counts;
  }

  async prepareDispatch(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.archivedAt) return { skipped: true };
    if (!(await this.campaignModuleEnabled(campaign.tenantId))) {
      return { skipped: true, reason: "CAMPAIGNS_MODULE_DISABLED" };
    }
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
    if (
      !statusIn(campaign.status, [
        CampaignStatus.SCHEDULED,
        CampaignStatus.QUEUED,
        CampaignStatus.RUNNING,
      ])
    )
      return { skipped: true, status: campaign.status };
    if (campaign.status !== CampaignStatus.RUNNING) {
      const claimed = await this.prisma.campaign.updateMany({
        where: {
          id: campaign.id,
          status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED] },
        },
        data: { status: CampaignStatus.RUNNING, startedAt: campaign.startedAt ?? new Date() },
      });
      if (claimed.count !== 1) return { skipped: true };
    }
    const batchSize = readCampaignRuntimeConfig(this.config).batchSize;
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
    });
    for (const recipient of recipients) {
      const recipientClaim = await this.prisma.campaignRecipient.updateMany({
        where: {
          id: recipient.id,
          status: { in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED] },
        },
        data: { status: CampaignRecipientStatus.QUEUED, queuedAt: new Date() },
      });
      if (recipientClaim.count !== 1) continue;
      // A previous add may have failed after Redis accepted it. The stable recipient job ID
      // makes this retry safe, while the claim above leaves active recipients untouched.
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
    if (!(await this.campaignModuleEnabled(campaign.tenantId))) {
      return { skipped: true, reason: "CAMPAIGNS_MODULE_DISABLED" };
    }
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
    if (recipient.contact.active === false) {
      await this.skipRecipient(recipient.id, CampaignRecipientSkipReason.BLOCKED);
      await this.incrementCampaign(campaign.id, { skippedCount: 1, blockedCount: 1 });
      return { skipped: true, reason: CampaignRecipientSkipReason.BLOCKED };
    }
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
        lastErrorCode: CAMPAIGN_RECIPIENT_CLAIMED,
      },
    });
    if (claim.count !== 1) return { skipped: true };
    let createdMessageId: string | undefined;
    try {
      const messageId = await this.createCampaignMessage(recipient, attempt);
      createdMessageId = messageId;
      await this.finalizeCreatedRecipient(recipient.id, campaign.id, messageId);
      await this.outboxDispatcher.dispatchMessage(messageId);
      await this.campaignQueue.enqueue({
        kind: "campaign.prepare",
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
      });
      return { messageId };
    } catch (error) {
      // Retry only failures that establish no transaction committed. Connection loss/timeouts
      // and any failure after message creation keep the existing conservative failure path.
      const persistedMessage = createdMessageId
        ? { id: createdMessageId }
        : await this.prisma.message.findFirst({
            where: { tenantId: campaign.tenantId, campaignRecipientId: recipient.id },
            select: { id: true },
          });
      if (persistedMessage) {
        await this.finalizeCreatedRecipient(recipient.id, campaign.id, persistedMessage.id);
        await this.outboxDispatcher.dispatchMessage(persistedMessage.id);
        this.logger.warn({
          event: "campaign.recipient.persisted_reconciled",
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          recipientId: recipient.id,
          messageId: persistedMessage.id,
        });
        return { messageId: persistedMessage.id, recovered: true };
      }
      if (attempt < 3 && isSafeCampaignTransactionRetry(error)) {
        await this.prisma.campaignRecipient.updateMany({
          where: { id: recipient.id, status: CampaignRecipientStatus.PROCESSING },
          data: {
            status: CampaignRecipientStatus.QUEUED,
            lastErrorCode: canonicalErrorCode(error),
          },
        });
        throw error;
      }
      const failed = await this.prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: CampaignRecipientStatus.PROCESSING },
        data: {
          status: CampaignRecipientStatus.FAILED,
          failedAt: new Date(),
          lastErrorCode: isAmbiguousCampaignError(error)
            ? CAMPAIGN_COMMIT_OUTCOME_UNKNOWN
            : canonicalErrorCode(error),
        },
      });
      if (failed.count === 1) await this.incrementCampaign(campaign.id, { failedCount: 1 });
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

  async recoverStaleRecipients(staleAfterMs = 60_000, limit = 100) {
    const staleBefore = new Date(Date.now() - staleAfterMs);
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: {
        status: CampaignRecipientStatus.PROCESSING,
        processingAt: { lt: staleBefore },
      },
      select: {
        id: true,
        tenantId: true,
        campaignId: true,
        lastErrorCode: true,
        processingAt: true,
      },
      orderBy: [{ processingAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    let safelyRequeued = 0;
    let persistedReconciled = 0;
    let blockedAsAmbiguous = 0;
    for (const recipient of recipients) {
      if (!(await this.campaignModuleEnabled(recipient.tenantId))) continue;
      const message = await this.prisma.message.findFirst({
        where: { tenantId: recipient.tenantId, campaignRecipientId: recipient.id },
        select: { id: true },
      });
      if (message) {
        const finalized = await this.finalizeCreatedRecipient(
          recipient.id,
          recipient.campaignId,
          message.id,
        );
        if (finalized) {
          await this.outboxDispatcher.dispatchMessage(message.id);
          persistedReconciled += 1;
        }
        continue;
      }
      if (recipient.lastErrorCode === CAMPAIGN_RECIPIENT_CLAIMED) {
        const released = await this.prisma.campaignRecipient.updateMany({
          where: {
            id: recipient.id,
            status: CampaignRecipientStatus.PROCESSING,
            lastErrorCode: CAMPAIGN_RECIPIENT_CLAIMED,
          },
          data: { status: CampaignRecipientStatus.QUEUED, lastErrorCode: null },
        });
        if (released.count === 1) {
          try {
            await this.campaignQueue.enqueue({
              kind: "campaign.recipient.send",
              tenantId: recipient.tenantId,
              campaignId: recipient.campaignId,
              recipientId: recipient.id,
            });
          } catch (error) {
            // Queue acknowledgement may itself be ambiguous. Restore the stale claim so the
            // next reconciliation retries the same deterministic job id instead of losing it.
            await this.prisma.campaignRecipient.updateMany({
              where: { id: recipient.id, status: CampaignRecipientStatus.QUEUED },
              data: {
                status: CampaignRecipientStatus.PROCESSING,
                processingAt: recipient.processingAt,
                lastErrorCode: CAMPAIGN_RECIPIENT_CLAIMED,
              },
            });
            throw error;
          }
          safelyRequeued += 1;
        }
        continue;
      }
      const failed = await this.prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: CampaignRecipientStatus.PROCESSING },
        data: {
          status: CampaignRecipientStatus.FAILED,
          failedAt: new Date(),
          lastErrorCode: CAMPAIGN_COMMIT_OUTCOME_UNKNOWN,
        },
      });
      if (failed.count === 1) {
        await this.incrementCampaign(recipient.campaignId, { failedCount: 1 });
        blockedAsAmbiguous += 1;
      }
    }
    if (recipients.length) {
      this.logger.warn({
        event: "campaign.recipients.stale_reconciled",
        scanned: recipients.length,
        safelyRequeued,
        persistedReconciled,
        blockedAsAmbiguous,
      });
    }
    return { scanned: recipients.length, safelyRequeued, persistedReconciled, blockedAsAmbiguous };
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

  private async campaignModuleEnabled(tenantId: string) {
    try {
      return (await this.entitlements.getEntitlements(tenantId)).features.campaigns;
    } catch {
      return false;
    }
  }

  private async finalizeCreatedRecipient(
    recipientId: string,
    campaignId: string,
    messageId: string,
  ) {
    const finalized = await this.prisma.$transaction(async (tx) => {
      const recipient = await tx.campaignRecipient.updateMany({
        where: { id: recipientId, status: CampaignRecipientStatus.PROCESSING },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: new Date(),
          messageId,
          lastErrorCode: null,
        },
      });
      if (recipient.count !== 1) return false;
      await tx.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      });
      return true;
    });
    if (finalized) {
      const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
      if (campaign) this.publishProgress(campaign);
    }
    return finalized;
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
    const frozen = this.attachmentsEnabled()
      ? await readFrozenCampaignAttachment(
          this.prisma,
          campaign.tenantId,
          campaign.id,
          campaign.version,
        )
      : { present: false, attachment: null };
    const attachment = frozen.attachment;
    if (campaign.messageType !== "TEXT" && !attachment)
      throw new ServiceUnavailableException("Mídia da campanha indisponível; envio bloqueado.");
    const type = attachment ? campaignAttachmentMessageType(attachment.mimeType) : MessageType.TEXT;
    if (attachment && !this.mediaStorage)
      throw new ServiceUnavailableException("Storage de mídia indisponível.");
    const stored = attachment
      ? await this.mediaStorage!.storeDownloaded({
          tenantId: campaign.tenantId,
          conversationId: `campaign-${campaign.id}`,
          body: Buffer.from(attachment.dataUrl.split(",")[1], "base64"),
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          messageType: type,
        }).catch((error) => {
          if (error instanceof HttpException && error.getStatus() < 500) throw error;
          throw Object.assign(new Error("Falha transitória ao preparar arquivo da campanha."), {
            code: CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE,
          });
        })
      : null;
    const now = new Date();
    let callbackCompleted = false;
    let message;
    try {
      message = await this.prisma.$transaction(async (tx) => {
        // The ambiguity marker commits atomically with Message + outbox. A crash before commit
        // rolls all three back and leaves the outer CLAIMED marker safe to retry.
        const commitBoundary = await tx.campaignRecipient.updateMany({
          where: {
            id: recipient.id,
            status: CampaignRecipientStatus.PROCESSING,
            lastErrorCode: CAMPAIGN_RECIPIENT_CLAIMED,
          },
          data: { lastErrorCode: CAMPAIGN_COMMIT_OUTCOME_UNKNOWN },
        });
        if (commitBoundary.count !== 1) {
          throw new Error("Campaign recipient claim was lost before message creation.");
        }
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
            type,
            ...(stored
              ? {
                  mediaStorageKey: stored.objectKey,
                  mediaMimeType: stored.mimeType,
                  mediaFileName: stored.fileName,
                  mediaSize: stored.sizeBytes,
                  mediaChecksum: stored.checksum,
                  mediaState: MessageMediaState.READY,
                  mediaCaption: content || null,
                }
              : {}),
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
          data: {
            lastMessagePreview: truncatePreview(content || stored?.fileName || ""),
            lastMessageAt: now,
          },
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: campaign.tenantId,
            type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
            aggregateId: saved.id,
            payload: { tenantId: campaign.tenantId, messageId: saved.id },
          },
        });
        callbackCompleted = true;
        return saved;
      });
    } catch (error) {
      // A completed callback followed by a transaction error may still commit. Keep its bytes.
      if (stored && !callbackCompleted) {
        try {
          const reference = await this.prisma.message.findFirst({
            where: { tenantId: campaign.tenantId, mediaStorageKey: stored.objectKey },
            select: { id: true },
          });
          if (!reference) await this.mediaStorage!.deleteObject(stored.objectKey);
        } catch {
          /* Retain bytes if the reference check/cleanup is uncertain. */
        }
      }
      throw error;
    }
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
    transaction?: Prisma.TransactionClient,
  ) {
    const persist = async (tx: Prisma.TransactionClient) => {
      if (this.attachmentsEnabled()) {
        const unsafe = await tx.campaignRecipient.count({
          where: {
            tenantId: campaign.tenantId,
            campaignId: campaign.id,
            OR: [
              {
                status: { in: [CampaignRecipientStatus.PROCESSING, CampaignRecipientStatus.SENT] },
              },
              { messageId: { not: null } },
            ],
          },
        });
        if (unsafe)
          throw canonicalConflict(
            "CAMPAIGN_SNAPSHOT_ALREADY_DISPATCHED",
            "A campanha já possui destinatários em processamento ou enviados.",
          );
      }
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
        where: {
          id: campaign.id,
          ...(this.attachmentsEnabled()
            ? { version: campaign.version, status: campaign.status }
            : {}),
        },
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
      if (this.attachmentsEnabled())
        await freezeCampaignAttachment(
          tx,
          campaign.tenantId,
          campaign.id,
          campaign.version,
          campaign.messageType !== "TEXT",
        );
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
    };
    return (transaction ? persist(transaction) : this.prisma.$transaction(persist)).catch(
      (error) => {
        if (
          this.attachmentsEnabled() &&
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        )
          throw canonicalConflict(
            "CAMPAIGN_SNAPSHOT_CHANGED",
            "A campanha foi alterada antes do envio. Atualize e tente novamente.",
          );
        throw error;
      },
    );
  }

  private async resolveAudience(
    audience: NormalizedAudience,
    messageText: string,
    tenantId: string,
    allowEmpty = false,
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
    let blockedCount = 0;

    for (const contact of contacts) {
      if (contact.active === false) {
        blockedCount += 1;
        skipped.push({ contact, reason: CampaignRecipientSkipReason.BLOCKED });
        continue;
      }
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
        (!renderedMessage && !allowEmpty) ||
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
      blockedCount,
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
    if (!connection) {
      throw canonicalBadRequest(
        "CAMPAIGN_CONNECTION_UNAVAILABLE",
        "A conexão selecionada não está disponivel.",
      );
    }
    if (
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      connection.status !== MessagingConnectionStatus.CONNECTED
    ) {
      throw canonicalBadRequest(
        "CAMPAIGN_CONNECTION_UNAVAILABLE",
        "A conexão selecionada não está disponivel.",
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

  private async campaignDeletionState(id: string, tenantId: string, db: DbClient) {
    const campaign = await db.campaign.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: { connection: true },
    });
    if (!campaign) throw new NotFoundException("Campanha não encontrada.");
    if (!DELETABLE_CAMPAIGN_STATUSES.includes(campaign.status as never)) {
      throw canonicalConflict(
        "CAMPAIGN_ARCHIVE_INVALID",
        "Campanha em execução não pode ser excluída.",
      );
    }

    const [recipientCount, activeRecipientCount, recipientSample, messageCount, outboxCount] =
      await Promise.all([
        db.campaignRecipient.count({ where: { tenantId, campaignId: campaign.id } }),
        db.campaignRecipient.count({
          where: {
            tenantId,
            campaignId: campaign.id,
            status: { in: [...ACTIVE_CAMPAIGN_RECIPIENT_STATUSES] },
          },
        }),
        db.campaignRecipient.findMany({
          where: { tenantId, campaignId: campaign.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 5,
          select: { id: true, displayName: true, normalizedPhone: true, status: true },
        }),
        db.message.count({ where: { tenantId, campaignId: campaign.id } }),
        db.outboxEvent.count({
          where: {
            tenantId,
            aggregateId: campaign.id,
            type: {
              in: [
                OUTBOX_CAMPAIGN_DISPATCH_REQUESTED,
                OUTBOX_CAMPAIGN_CANCEL_REQUESTED,
                OUTBOX_CAMPAIGN_RESUME_REQUESTED,
              ],
            },
          },
        }),
      ]);
    if (activeRecipientCount > 0) {
      throw canonicalConflict(
        "CAMPAIGN_DELETE_RECIPIENTS_ACTIVE",
        "A campanha possui destinatários em processamento e não pode ser excluída.",
      );
    }

    const impact: DeletionImpactPreview = {
      snapshotToken: deletionSnapshot({
        id: campaign.id,
        version: campaign.version,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
        recipientCount,
        activeRecipientCount,
        messageCount,
        outboxCount,
      }),
      title: "Excluir campanha?",
      prompt:
        "A campanha será excluída definitivamente. As mensagens já existentes continuarão no histórico das conversas.",
      record: {
        name: campaign.name,
        identifiers: [
          { label: "ID", value: campaign.id },
          { label: "Estado", value: campaign.status },
          { label: "Instância", value: campaign.connection.name },
        ],
      },
      dependencies: [
        {
          id: "recipients",
          label: "Destinatários da campanha",
          count: recipientCount,
          operation: "delete",
          operationLabel: "Serão excluídos com a campanha",
          items: recipientSample.map((recipient) => ({
            id: recipient.id,
            label: recipient.displayName || recipient.normalizedPhone,
            description: recipient.status,
          })),
          hasMore: recipientCount > recipientSample.length,
        },
        {
          id: "messages",
          label: "Mensagens existentes no histórico",
          count: messageCount,
          operation: "unlink",
          operationLabel: "Serão preservadas sem o vínculo da campanha",
        },
        ...(outboxCount
          ? [
              {
                id: "outbox",
                label: "Solicitações técnicas pendentes",
                count: outboxCount,
                operation: "delete" as const,
                operationLabel: "Serão removidas com segurança",
              },
            ]
          : []),
      ],
      consequences: [
        {
          id: "campaign",
          text: "A campanha, seus destinatários e suas estatísticas serão excluídos definitivamente.",
          irreversible: true,
        },
        {
          id: "history",
          text: "As mensagens já enviadas permanecerão disponíveis no histórico das conversas.",
          irreversible: false,
        },
      ],
      confirmation: {
        level: "standard",
        confirmLabel: "Confirmar",
      },
    };
    return { campaign, activeRecipientCount, impact };
  }

  private async findCampaign(id: string, tenantId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, tenantId, archivedAt: null },
      include: { connection: true },
    });
    if (!campaign) throw new NotFoundException("Campanha não encontrada.");
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
    data: Partial<
      Record<
        "sentCount" | "failedCount" | "skippedCount" | "optedOutCount" | "blockedCount",
        number
      >
    >,
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

  private async serialize(
    campaign: Campaign & {
      connection?: {
        id: string;
        name: string;
        providerType: MessagingProviderType;
        status: MessagingConnectionStatus;
      };
    },
    includeAttachmentData = true,
  ) {
    const attachment =
      this.attachmentsEnabled() && includeAttachmentData
        ? await readCampaignAttachment(this.prisma, campaign.tenantId, campaign.id)
        : null;
    const attachmentMetadata = attachment
      ? { fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size }
      : this.attachmentsEnabled() && !includeAttachmentData
        ? await readCampaignAttachmentMetadata(this.prisma, campaign.tenantId, campaign.id)
        : null;
    return {
      id: campaign.id,
      tenantId: campaign.tenantId,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      attachment,
      attachmentMetadata,
      hasAttachment: !!attachmentMetadata,
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
  if (!text) throw new BadRequestException("Texto obrigatório.");
  return text.slice(0, max);
}

function cleanMessage(value: string, allowEmpty = false) {
  const text = value.trim();
  if (!text && !allowEmpty) throw new BadRequestException("Mensagem obrigatoria.");
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
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE
  )
    return CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE;
  if (error instanceof BadRequestException || error instanceof ConflictException) {
    const response = error.getResponse();
    if (response && typeof response === "object" && "code" in response)
      return String(response.code);
  }
  return "CAMPAIGN_RECIPIENT_SEND_FAILED";
}

function isSafeCampaignTransactionRetry(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  // P2034: transaction rolled back; P2024: timed out acquiring a connection.
  return (
    error.code === "P2034" ||
    error.code === "P2024" ||
    error.code === CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE
  );
}

function isAmbiguousCampaignError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["P1001", "P1002", "P1011", "P1017"].includes(String(error.code));
}
