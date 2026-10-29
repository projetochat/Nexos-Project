import {
  Body,
  Controller,
  Global,
  Headers,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Post,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  collectLoginMetrics,
  dispatchLoginMetrics,
  loginMetricSettings,
  MetricHeaders,
} from "./index";

@Controller("login-metrics/v1")
class LoginMetricsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  @Post("events")
  events(@Body() body: unknown, @Headers() headers: MetricHeaders) {
    return collectLoginMetrics(
      this.prisma,
      this.config,
      "/api/login-metrics/v1/events",
      body,
      headers,
    );
  }
  @Post("counts")
  counts(@Body() body: unknown, @Headers() headers: MetricHeaders) {
    return collectLoginMetrics(
      this.prisma,
      this.config,
      "/api/login-metrics/v1/counts",
      body,
      headers,
    );
  }
}
@Injectable()
class LoginMetricsDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(LoginMetricsDispatcher.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (!loginMetricSettings(this.config)) return;
    // Configuration is validated before scheduling; network failures do not affect login.
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref?.();
    void this.tick();
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await dispatchLoginMetrics(this.prisma, this.config);
    } catch {
      this.logger.warn({ event: "login_metrics.export_unavailable" });
    } finally {
      this.running = false;
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
@Global()
@Module({ controllers: [LoginMetricsController], providers: [LoginMetricsDispatcher] })
export class LoginMetricsModule {}
