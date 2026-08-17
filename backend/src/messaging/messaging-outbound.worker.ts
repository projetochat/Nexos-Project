import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, MetricsTime, UnrecoverableError, Worker } from "bullmq";
import { OutboxEventStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import {
  MESSAGING_OUTBOUND_QUEUE,
  MessagingOutboundJob,
  OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
  OUTBOUND_JOB_OPTIONS,
  RedisConnectionFactory,
} from "../queue/messaging-outbound.queue";
import { MessagingOutboundService, OutboundDispatchError } from "./messaging-outbound.service";

@Injectable()
export class MessagingOutboundWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MessagingOutboundWorker.name);
  private readonly locks = new Map<string, Promise<unknown>>();
  private worker: Worker<MessagingOutboundJob> | null = null;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisConnectionFactory)
    private readonly redis: RedisConnectionFactory,
    @Inject(MessagingOutboundService)
    private readonly outbound: MessagingOutboundService,
  ) {}

  onApplicationBootstrap() {
    if (!this.redis.enabled()) return;
    if (this.config.get<string>("NEXOS_QUEUE_WORKER_ENABLED") === "false") return;

    this.worker = new Worker<MessagingOutboundJob>(
      MESSAGING_OUTBOUND_QUEUE,
      (job) => this.process(job),
      {
        connection: this.redis.createConnection("nexos-outbound-worker", { blocking: true }),
        concurrency: this.concurrency(),
        metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 },
      },
    );

    this.registerWorkerListeners(this.worker);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<MessagingOutboundJob>) {
    const message = await this.prisma.message.findFirst({
      where: { id: job.data.messageId, tenantId: job.data.tenantId },
      select: { conversationId: true },
    });
    if (!message) {
      throw new UnrecoverableError("Message not found for outbound job.");
    }

    const finalAttempt = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    this.safeLog("log", {
      event: "messaging.outbound.started",
      jobId: job.id,
      tenantId: job.data.tenantId,
      messageId: job.data.messageId,
      conversationId: message.conversationId,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });
    return await this.withConversationLock(message.conversationId, async () => {
      try {
        return await this.outbound.dispatchQueuedMessage({
          tenantId: job.data.tenantId,
          messageId: job.data.messageId,
          attempt: job.attemptsMade + 1,
          finalAttempt,
        });
      } catch (error) {
        if (error instanceof OutboundDispatchError && !error.retryable) {
          await this.markOutboxFinalFailure(job, error).catch((handlerError) => {
            this.safeLog("error", {
              event: "messaging.outbound.worker_final_failure_mark_failed",
              jobId: job.id,
              tenantId: job.data.tenantId,
              messageId: job.data.messageId,
              error: sanitizeError(handlerError),
            });
          });
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    });
  }

  private withConversationLock<T>(conversationId: string, action: () => Promise<T>) {
    const previous = this.locks.get(conversationId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    const tracked = next.finally(() => this.release(conversationId, tracked));
    this.locks.set(conversationId, tracked);
    return tracked;
  }

  private release(conversationId: string, promise: Promise<unknown>) {
    if (this.locks.get(conversationId) === promise) this.locks.delete(conversationId);
  }

  private concurrency() {
    const value = Number(this.config.get<string>("NEXOS_OUTBOUND_WORKER_CONCURRENCY") ?? 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  private registerWorkerListeners(worker: Worker<MessagingOutboundJob>) {
    worker.on("active", (job) => {
      this.safeLog("log", {
        event: "messaging.outbound.worker_active",
        jobId: job.id,
        tenantId: job.data.tenantId,
        messageId: job.data.messageId,
        attempt: job.attemptsMade + 1,
      });
    });
    worker.on("completed", (job, result) => {
      this.safeLog("log", {
        event: "messaging.outbound.worker_completed",
        jobId: job.id,
        tenantId: job.data.tenantId,
        messageId: job.data.messageId,
        attempt: job.attemptsMade,
        result,
      });
    });
    worker.on("failed", (job, error) => {
      void this.handleFailedJob(job ?? null, error).catch((handlerError) => {
        this.safeLog("error", {
          event: "messaging.outbound.worker_failed_listener_error",
          jobId: job?.id,
          tenantId: job?.data.tenantId,
          messageId: job?.data.messageId,
          error: sanitizeError(handlerError),
        });
      });
    });
    worker.on("error", (error) => {
      this.safeLog("warn", {
        event: "messaging.outbound.worker_error",
        result: "error",
        error: sanitizeError(error),
      });
    });
    worker.on("stalled", (jobId) => {
      this.safeLog("warn", {
        event: "messaging.outbound.worker_stalled",
        jobId,
        result: "stalled",
      });
    });
    worker.on("progress", (job, progress) => {
      this.safeLog("log", {
        event: "messaging.outbound.worker_progress",
        jobId: job.id,
        tenantId: job.data.tenantId,
        messageId: job.data.messageId,
        progress,
      });
    });
    worker.on("closing", () => {
      this.safeLog("log", { event: "messaging.outbound.worker_closing" });
    });
    worker.on("closed", () => {
      this.safeLog("log", { event: "messaging.outbound.worker_closed" });
    });
  }

  private async handleFailedJob(job: Job<MessagingOutboundJob> | null, error: Error) {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = Number(job?.opts.attempts ?? OUTBOUND_JOB_OPTIONS.attempts ?? 1);
    const retryScheduled =
      !!job && attemptsMade < maxAttempts && !(error instanceof UnrecoverableError);
    this.safeLog("warn", {
      event: retryScheduled
        ? "messaging.outbound.retry_scheduled"
        : "messaging.outbound.worker_failed",
      jobId: job?.id,
      tenantId: job?.data.tenantId,
      messageId: job?.data.messageId,
      attempt: attemptsMade,
      maxAttempts,
      retryable: retryScheduled,
      error: sanitizeError(error),
    });
    if (!retryScheduled && job) await this.markOutboxFinalFailure(job, error);
  }

  private async markOutboxFinalFailure(job: Job<MessagingOutboundJob>, error: Error) {
    await this.prisma.outboxEvent.updateMany({
      where: {
        tenantId: job.data.tenantId,
        type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
        aggregateId: job.data.messageId,
      },
      data: {
        status: OutboxEventStatus.FAILED,
        lastError: sanitizeError(error),
      },
    });
  }

  private safeLog(level: "log" | "warn" | "error", payload: Record<string, unknown>) {
    try {
      this.logger[level](payload);
    } catch {
      // Worker listeners must never propagate logging failures to the process.
    }
  }
}

export const OUTBOUND_WORKER_ATTEMPTS = OUTBOUND_JOB_OPTIONS.attempts;

function sanitizeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Messaging outbound worker error.";
}
