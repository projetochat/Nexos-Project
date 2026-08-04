import { Controller, Get, Inject } from "@nestjs/common";
import { CampaignDispatchQueue } from "../campaigns/campaign-dispatch.queue";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingOutboundQueue } from "../queue/messaging-outbound.queue";
import { RealtimeService } from "../realtime/realtime.service";
import { FileStorageProvider } from "../tickets/storage/file-storage.provider";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingOutboundQueue) private readonly queue: MessagingOutboundQueue,
    @Inject(CampaignDispatchQueue) private readonly campaignQueue: CampaignDispatchQueue,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(FileStorageProvider) private readonly storage: FileStorageProvider,
  ) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.queue.health();
    const campaignRedis = await this.campaignQueue.health().catch(() => ({ ok: false }));
    const realtime = this.realtime.health();
    return {
      ok: true,
      service: "nexos-api",
      database: "up",
      redis: redis.ok ? "up" : "down",
      queue: redis.ok ? "up" : "down",
      campaignQueue: campaignRedis.ok ? "up" : "down",
      campaignWorker: this.campaignQueue.enabled() ? "configured" : "disabled",
      campaignScheduler: this.campaignQueue.enabled() ? "configured" : "disabled",
      realtime: realtime.status,
      realtimeAdapter: realtime.adapter,
      storage: "up",
      storageProvider: this.storage.provider,
      timestamp: new Date().toISOString(),
    };
  }
}
