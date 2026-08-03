import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, UnrecoverableError, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import {
  MESSAGING_OUTBOUND_QUEUE,
  MessagingOutboundJob,
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
      },
    );

    this.worker.on("completed", (job) => {
      this.logger.log({
        event: "messaging.outbound.job_completed",
        jobId: job.id,
        tenantId: job.data.tenantId,
        messageId: job.data.messageId,
        attempt: job.attemptsMade,
        result: "completed",
      });
    });
    this.worker.on("failed", (job, error) => {
      this.logger.warn({
        event: "messaging.outbound.job_failed",
        jobId: job?.id,
        tenantId: job?.data.tenantId,
        messageId: job?.data.messageId,
        attempt: job?.attemptsMade,
        result: "failed",
        error: error.message,
      });
    });
    this.worker.on("error", (error) => {
      this.logger.warn({
        event: "messaging.outbound.worker_error",
        result: "error",
        error: error.message,
      });
    });
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
    return this.withConversationLock(message.conversationId, async () => {
      try {
        return await this.outbound.dispatchQueuedMessage({
          tenantId: job.data.tenantId,
          messageId: job.data.messageId,
          attempt: job.attemptsMade + 1,
          finalAttempt,
        });
      } catch (error) {
        if (error instanceof OutboundDispatchError && !error.retryable) {
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
    return next;
  }

  private release(conversationId: string, promise: Promise<unknown>) {
    if (this.locks.get(conversationId) === promise) this.locks.delete(conversationId);
  }

  private concurrency() {
    const value = Number(this.config.get<string>("NEXOS_OUTBOUND_WORKER_CONCURRENCY") ?? 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }
}

export const OUTBOUND_WORKER_ATTEMPTS = OUTBOUND_JOB_OPTIONS.attempts;
