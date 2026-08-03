import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";

export const MESSAGING_OUTBOUND_QUEUE = "messaging-outbound";
export const MESSAGING_OUTBOUND_JOB = "send-message";
export const OUTBOX_MESSAGING_OUTBOUND_REQUESTED = "MESSAGING_OUTBOUND_REQUESTED";

export type MessagingOutboundJob = {
  tenantId: string;
  messageId: string;
};

export const OUTBOUND_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: false,
};

@Injectable()
export class RedisConnectionFactory {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  enabled() {
    return this.config.get<string>("NEXOS_QUEUE_ENABLED") !== "false";
  }

  redisUrl() {
    return this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
  }

  createConnection(connectionName: string, options: { blocking?: boolean } = {}) {
    return new IORedis(this.redisUrl(), {
      connectionName,
      connectTimeout: 1_000,
      maxRetriesPerRequest: options.blocking ? null : 1,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (!options.blocking && times > 2) return null;
        return Math.min(times * 250, 2_000);
      },
    });
  }
}

@Injectable()
export class MessagingOutboundQueue implements OnModuleDestroy {
  private queue: Queue<MessagingOutboundJob> | null = null;

  constructor(@Inject(RedisConnectionFactory) private readonly redis: RedisConnectionFactory) {}

  async enqueue(job: MessagingOutboundJob) {
    return this.getQueue().add(MESSAGING_OUTBOUND_JOB, job, {
      ...OUTBOUND_JOB_OPTIONS,
      jobId: outboundJobId(job.messageId),
    });
  }

  async health() {
    if (!this.redis.enabled()) return { ok: false, configured: false };
    const connection = this.redis.createConnection("nexos-redis-health");
    try {
      const pong = await connection.ping();
      return { ok: pong === "PONG", configured: true };
    } finally {
      await connection.quit();
    }
  }

  getQueue() {
    if (!this.redis.enabled()) throw new Error("Nexos queue is disabled.");
    this.queue ??= new Queue<MessagingOutboundJob>(MESSAGING_OUTBOUND_QUEUE, {
      connection: this.redis.createConnection("nexos-outbound-queue"),
    });
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}

export function outboundJobId(messageId: string) {
  return `message-${messageId}`;
}
