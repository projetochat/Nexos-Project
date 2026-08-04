import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import { readCampaignRuntimeConfig } from "./campaign-config";
import {
  CAMPAIGN_DISPATCH_QUEUE,
  CampaignDispatchJob,
  CampaignDispatchQueue,
} from "./campaign-dispatch.queue";
import { CampaignsService } from "./campaigns.service";
import { RedisConnectionFactory } from "../queue/messaging-outbound.queue";

@Injectable()
export class CampaignDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignDispatchWorker.name);
  private worker: Worker<CampaignDispatchJob> | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RedisConnectionFactory) private readonly redis: RedisConnectionFactory,
    @Inject(CampaignDispatchQueue) private readonly queue: CampaignDispatchQueue,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
  ) {}

  async onModuleInit() {
    if (!this.redis.enabled()) {
      this.logger.warn({ event: "campaign.worker.disabled", reason: "queue_disabled" });
      return;
    }
    await this.campaigns.reconcileScheduledCampaigns();
    const runtimeConfig = readCampaignRuntimeConfig(this.config);
    this.logger.log({
      event: "campaign.worker.config",
      campaignWorkerConcurrency: runtimeConfig.concurrency,
      campaignMessagesPerMinute: runtimeConfig.messagesPerMinute,
      campaignBatchSize: runtimeConfig.batchSize,
      campaignMaxRecipients: runtimeConfig.maxRecipients,
    });
    this.worker = new Worker<CampaignDispatchJob>(
      CAMPAIGN_DISPATCH_QUEUE,
      (job) => this.handle(job),
      {
        connection: this.redis.createConnection("nexos-campaign-worker", { blocking: true }),
        concurrency: runtimeConfig.concurrency,
        limiter: {
          max: runtimeConfig.messagesPerMinute,
          duration: 60_000,
        },
      },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.warn({
        event: "campaign.job.failed",
        jobId: job?.id,
        campaignId: job?.data.campaignId,
        kind: job?.data.kind,
        error: sanitizeError(error),
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async handle(job: Job<CampaignDispatchJob>) {
    const data = job.data;
    if (data.kind === "campaign.prepare") return this.campaigns.prepareDispatch(data.campaignId);
    if (data.kind === "campaign.recipient.send") {
      return this.campaigns.dispatchRecipient(
        data.campaignId,
        data.recipientId,
        job.attemptsMade + 1,
      );
    }
    if (data.kind === "campaign.finalize") return this.campaigns.finalizeDispatch(data.campaignId);
    if (data.kind === "campaign.cancel") return this.campaigns.finishCancellation(data.campaignId);
    return null;
  }
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Campaign job failed.";
}
