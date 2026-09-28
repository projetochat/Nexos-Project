import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageStatus, Prisma, ScheduleExecutionStatus } from "../generated/prisma";
import {
  MessagingOutboundService,
  ScheduledMessagePermanentError,
} from "../messaging/messaging-outbound.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

type SchedulePayload = {
  type?: unknown;
  conversationId?: unknown;
  recurrence?: unknown;
  recipientIds?: unknown;
  content?: unknown;
  attachment?: unknown;
  status?: unknown;
};

@Injectable()
export class ScheduleExecutorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleExecutorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingOutboundService) private readonly outbound: MessagingOutboundService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>("TRIXUS_SCHEDULE_POLLER_ENABLED") === "false") return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs());
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now = new Date()) {
    await this.reconcileQueued(now);
    await this.recoverStaleClaims(now);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        executionStatus: ScheduleExecutionStatus.PENDING,
        dueAt: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        tenantId: true,
        dueAt: true,
        attempts: true,
        version: true,
        createdByMembershipId: true,
      },
      take: this.batchSize(),
    });
    let claimed = 0;
    for (const schedule of schedules) {
      const claim = await this.prisma.schedule.updateMany({
        where: {
          tenantId: schedule.tenantId,
          id: schedule.id,
          executionStatus: ScheduleExecutionStatus.PENDING,
          version: schedule.version,
        },
        data: {
          executionStatus: ScheduleExecutionStatus.CLAIMED,
          claimedAt: now,
          attempts: { increment: 1 },
          lastError: null,
          nextAttemptAt: null,
          version: { increment: 1 },
        },
      });
      if (claim.count !== 1) continue;
      claimed += 1;
      await this.materialize(schedule, schedule.version + 1).catch(async (error) => {
        await this.handleClaimFailure(
          schedule.tenantId,
          schedule.id,
          schedule.version + 1,
          schedule.attempts + 1,
          now,
          error,
        );
      });
    }
    return { scanned: schedules.length, claimed };
  }

  async recoverStaleClaims(now = new Date()) {
    const staleBefore = new Date(now.getTime() - this.claimTimeoutMs());
    return this.prisma.schedule.updateMany({
      where: {
        executionStatus: ScheduleExecutionStatus.CLAIMED,
        claimedAt: { lt: staleBefore },
        messageId: null,
      },
      data: {
        executionStatus: ScheduleExecutionStatus.PENDING,
        claimedAt: null,
        nextAttemptAt: now,
        lastError: "Execução interrompida antes da materialização; reagendada com segurança.",
        version: { increment: 1 },
      },
    });
  }

  async reconcileQueued(now = new Date()) {
    const schedules = await this.prisma.schedule.findMany({
      where: { executionStatus: ScheduleExecutionStatus.QUEUED, messageId: { not: null } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        tenantId: true,
        messageId: true,
        version: true,
      },
      take: this.batchSize(),
    });
    if (!schedules.length) return { scanned: 0, completed: 0, failed: 0 };
    const messages = await this.prisma.message.findMany({
      where: { id: { in: schedules.flatMap((item) => (item.messageId ? [item.messageId] : [])) } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        providerErrorCode: true,
        providerErrorMessage: true,
      },
    });
    const byKey = new Map(
      messages.map((message) => [`${message.tenantId}:${message.id}`, message]),
    );
    let completed = 0;
    let failed = 0;
    for (const schedule of schedules) {
      const message = schedule.messageId
        ? byKey.get(`${schedule.tenantId}:${schedule.messageId}`)
        : undefined;
      if (!message) continue;
      if (
        message.status === MessageStatus.SENT ||
        message.status === MessageStatus.DELIVERED ||
        message.status === MessageStatus.READ
      ) {
        // Payloads may contain base64 attachments. Fetch one only when it is needed instead of
        // retaining every queued attachment in the reconciliation batch.
        const current = await this.prisma.schedule.findUnique({
          where: { tenantId_id: { tenantId: schedule.tenantId, id: schedule.id } },
          select: { payload: true },
        });
        if (!current) continue;
        const payload = payloadObject(current.payload);
        const result = await this.prisma.schedule.updateMany({
          where: {
            tenantId: schedule.tenantId,
            id: schedule.id,
            executionStatus: ScheduleExecutionStatus.QUEUED,
            version: schedule.version,
            messageId: schedule.messageId,
          },
          data: {
            executionStatus: ScheduleExecutionStatus.SENT,
            completedAt: now,
            lastError: null,
            payload: { ...payload, status: "completed" } as Prisma.InputJsonObject,
            version: { increment: 1 },
          },
        });
        if (result.count === 1) {
          completed += 1;
          this.publish(schedule.tenantId, schedule.id);
        }
      } else if (message.status === MessageStatus.FAILED) {
        const result = await this.prisma.schedule.updateMany({
          where: {
            tenantId: schedule.tenantId,
            id: schedule.id,
            executionStatus: ScheduleExecutionStatus.QUEUED,
            version: schedule.version,
            messageId: schedule.messageId,
          },
          data: {
            executionStatus: ScheduleExecutionStatus.FAILED,
            claimedAt: null,
            lastError: sanitizeError(
              message.providerErrorMessage ?? message.providerErrorCode ?? "Falha no envio.",
            ),
            version: { increment: 1 },
          },
        });
        if (result.count === 1) {
          failed += 1;
          this.publish(schedule.tenantId, schedule.id);
        }
      }
    }
    return { scanned: schedules.length, completed, failed };
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn({ event: "schedule.poller.failed", error: sanitizeError(error) });
    } finally {
      this.running = false;
    }
  }

  private async materialize(
    schedule: {
      id: string;
      tenantId: string;
      dueAt: Date | null;
      createdByMembershipId: string | null;
    },
    claimedVersion: number,
  ) {
    // The due scan intentionally excludes payload so a batch never holds multiple large
    // data-URL attachments in memory. Load only the schedule that won the CAS claim.
    const claimed = await this.prisma.schedule.findFirst({
      where: {
        tenantId: schedule.tenantId,
        id: schedule.id,
        executionStatus: ScheduleExecutionStatus.CLAIMED,
        version: claimedVersion,
      },
      select: { payload: true },
    });
    if (!claimed) {
      throw new ScheduledMessagePermanentError("Agendamento reivindicado não foi encontrado.");
    }
    const payload = payloadObject(claimed.payload) as SchedulePayload;
    if (!isExecutablePayload(payload) || !schedule.dueAt) {
      throw new ScheduledMessagePermanentError("Agendamento fora do escopo executável.");
    }
    await this.outbound.queueScheduledMessage({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      claimedVersion,
      occurrenceAt: schedule.dueAt,
      conversationId: payload.conversationId,
      createdByMembershipId: schedule.createdByMembershipId,
      content: payload.content,
      attachment: attachmentPayload(payload.attachment),
    });
    this.publish(schedule.tenantId, schedule.id);
  }

  private async handleClaimFailure(
    tenantId: string,
    id: string,
    version: number,
    attempts: number,
    now: Date,
    error: unknown,
  ) {
    const terminal =
      error instanceof ScheduledMessagePermanentError || attempts >= this.maxAttempts();
    const result = await this.prisma.schedule.updateMany({
      where: {
        tenantId,
        id,
        executionStatus: ScheduleExecutionStatus.CLAIMED,
        version,
      },
      data: {
        executionStatus: terminal
          ? ScheduleExecutionStatus.FAILED
          : ScheduleExecutionStatus.PENDING,
        claimedAt: null,
        lastError: sanitizeError(error),
        nextAttemptAt: terminal ? null : new Date(now.getTime() + this.retryDelayMs(attempts)),
        version: { increment: 1 },
      },
    });
    if (result.count === 1) this.publish(tenantId, id);
  }

  private publish(tenantId: string, scheduleId: string) {
    this.realtime.publish({ tenantId }, "schedule.updated", { scheduleId });
  }

  private intervalMs() {
    const value = Number(this.config.get<string>("TRIXUS_SCHEDULE_POLL_INTERVAL_MS") ?? 1_000);
    return Number.isFinite(value) && value >= 250 ? value : 1_000;
  }

  private batchSize() {
    const value = Number(this.config.get<string>("TRIXUS_SCHEDULE_POLL_BATCH_SIZE") ?? 25);
    return Number.isInteger(value) && value > 0 && value <= 100 ? value : 25;
  }

  private claimTimeoutMs() {
    const value = Number(this.config.get<string>("TRIXUS_SCHEDULE_CLAIM_TIMEOUT_MS") ?? 60_000);
    return Number.isFinite(value) && value >= 10_000 ? value : 60_000;
  }

  private maxAttempts() {
    const value = Number(this.config.get<string>("TRIXUS_SCHEDULE_MAX_ATTEMPTS") ?? 5);
    return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 5;
  }

  private retryDelayMs(attempts: number) {
    const base = Number(this.config.get<string>("TRIXUS_SCHEDULE_RETRY_BASE_MS") ?? 30_000);
    const safeBase = Number.isFinite(base) && base >= 1_000 ? base : 30_000;
    return Math.min(safeBase * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
  }
}

function payloadObject(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function isExecutablePayload(
  payload: SchedulePayload,
): payload is SchedulePayload & { conversationId: string; content: string } {
  return (
    payload.type === "message" &&
    typeof payload.conversationId === "string" &&
    !!payload.conversationId &&
    payload.recurrence === "once" &&
    Array.isArray(payload.recipientIds) &&
    payload.recipientIds.length === 0 &&
    typeof payload.content === "string" &&
    (!!payload.content.trim() || !!payload.attachment)
  );
}

function attachmentPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const attachment = value as Record<string, unknown>;
  if (
    typeof attachment.fileName !== "string" ||
    typeof attachment.mimeType !== "string" ||
    typeof attachment.size !== "number" ||
    typeof attachment.dataUrl !== "string"
  ) {
    throw new ScheduledMessagePermanentError("Anexo do agendamento é inválido.");
  }
  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  };
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Falha no agendamento.")).slice(
    0,
    500,
  );
}
