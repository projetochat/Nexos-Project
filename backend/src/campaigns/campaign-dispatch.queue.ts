import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { JobsOptions, Queue } from "bullmq";
import { RedisConnectionFactory } from "../queue/messaging-outbound.queue";

export const CAMPAIGN_DISPATCH_QUEUE = "campaign-dispatch";

export type CampaignDispatchJob =
  | { kind: "campaign.prepare"; tenantId: string; campaignId: string }
  | { kind: "campaign.recipient.send"; tenantId: string; campaignId: string; recipientId: string }
  | { kind: "campaign.finalize"; tenantId: string; campaignId: string }
  | { kind: "campaign.cancel"; tenantId: string; campaignId: string };

const CAMPAIGN_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: false,
};

@Injectable()
export class CampaignDispatchQueue implements OnModuleDestroy {
  private queue: Queue<CampaignDispatchJob> | null = null;

  constructor(@Inject(RedisConnectionFactory) private readonly redis: RedisConnectionFactory) {}

  enabled() {
    return this.redis.enabled();
  }

  async enqueue(job: CampaignDispatchJob, options: JobsOptions = {}) {
    return this.getQueue().add(job.kind, job, {
      ...CAMPAIGN_JOB_OPTIONS,
      ...options,
      jobId: campaignJobId(job),
    });
  }

  async health() {
    if (!this.redis.enabled()) return { ok: false, configured: false };
    const connection = this.redis.createConnection("nexos-campaign-redis-health");
    try {
      const pong = await connection.ping();
      return { ok: pong === "PONG", configured: true };
    } finally {
      await connection.quit();
    }
  }

  getQueue() {
    if (!this.redis.enabled()) throw new Error("Nexos queue is disabled.");
    this.queue ??= new Queue<CampaignDispatchJob>(CAMPAIGN_DISPATCH_QUEUE, {
      connection: this.redis.createConnection("nexos-campaign-queue"),
    });
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}

export function campaignJobId(job: CampaignDispatchJob) {
  if (job.kind === "campaign.recipient.send") return `campaign-recipient-${job.recipientId}`;
  return `${job.kind.replaceAll(".", "-")}-${job.campaignId}`;
}
