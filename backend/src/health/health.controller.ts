import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
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

  @Get("live")
  liveness() {
    return {
      ok: true,
      service: "trixus-api",
      status: "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  readiness() {
    return this.dependencyReadiness();
  }

  @Get()
  async health() {
    return this.dependencyReadiness();
  }

  private async dependencyReadiness() {
    const timeoutMs = readinessTimeoutMs();
    const [database, redis, campaignRedis, storage] = await Promise.all([
      settle(withTimeout(this.prisma.$queryRaw`SELECT 1`, timeoutMs)),
      settle(withTimeout(this.queue.health(), timeoutMs)),
      settle(withTimeout(this.campaignQueue.health(), timeoutMs)),
      settle(withTimeout(this.storage.readiness(), timeoutMs)),
    ]);
    const realtime = this.realtime.health();
    const databaseUp = database.ok;
    const redisUp = redis.ok && redis.value.ok;
    const campaignRedisUp = campaignRedis.ok && campaignRedis.value.ok;
    const storageUp = storage.ok && storage.value.ok;
    const realtimeUp = !realtime.enabled || realtime.status === "up";
    const ok = databaseUp && redisUp && campaignRedisUp && storageUp && realtimeUp;
    const result = {
      ok,
      service: "trixus-api",
      database: databaseUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
      queue: redisUp ? "up" : "down",
      campaignQueue: campaignRedisUp ? "up" : "down",
      campaignWorker: this.campaignQueue.enabled() ? "configured" : "disabled",
      campaignScheduler: this.campaignQueue.enabled() ? "configured" : "disabled",
      realtime: realtime.status,
      realtimeAdapter: realtime.adapter,
      storage: storageUp ? "up" : "down",
      storageProvider: this.storage.provider,
      timestamp: new Date().toISOString(),
    };
    if (!ok) throw new ServiceUnavailableException(result);
    return result;
  }
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise };
  } catch {
    return { ok: false as const };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("HEALTH_CHECK_TIMEOUT")), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readinessTimeoutMs() {
  const configured = Number(process.env.TRIXUS_HEALTH_CHECK_TIMEOUT_MS ?? 2_000);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 100), 10_000) : 2_000;
}
