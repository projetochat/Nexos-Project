import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { RedisConnectionFactory } from "./messaging-outbound.queue";

@Injectable()
export class OutboxPollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(RedisConnectionFactory)
    private readonly redis: RedisConnectionFactory,
    @Inject(OutboxDispatcherService)
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onApplicationBootstrap() {
    if (!this.redis.enabled()) return;
    if (this.config.get<string>("NEXOS_OUTBOX_POLLER_ENABLED") === "false") return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs());
    this.timer.unref?.();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatcher.dispatchPending();
    } catch (error) {
      this.logger.warn({
        event: "outbox.poller.failed",
        error: error instanceof Error ? error.message : "Outbox poller failed.",
      });
    } finally {
      this.running = false;
    }
  }

  private intervalMs() {
    const value = Number(this.config.get<string>("NEXOS_OUTBOX_POLL_INTERVAL_MS") ?? 1_000);
    return Number.isFinite(value) && value >= 250 ? value : 1_000;
  }
}
