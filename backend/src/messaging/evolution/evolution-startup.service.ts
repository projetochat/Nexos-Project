import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution.config";
import { MessagingConnectionsService } from "../messaging-connections.service";

@Injectable()
export class EvolutionStartupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvolutionStartupService.name);
  private reconciliationTimer: NodeJS.Timeout | null = null;

  constructor(
    @Optional()
    @Inject(MessagingConnectionsService)
    private readonly connections?: MessagingConnectionsService,
  ) {}

  async onModuleInit() {
    const config = evolutionConfigFromEnv();
    const evolutionEnabled = assertEvolutionConfigured(config);
    const webhookConfigured = !!config.webhookPublicUrl && !!config.webhookSecret;

    this.logger.log({
      event: "evolution.config.startup",
      evolutionConfigured: evolutionEnabled,
      webhookPublicUrlConfigured: !!config.webhookPublicUrl,
      EVOLUTION_WEBHOOK_SECRET: { configured: !!config.webhookSecret },
      integrationStatus: !evolutionEnabled ? "disabled" : webhookConfigured ? "ready" : "degraded",
    });

    if (evolutionEnabled && !webhookConfigured) {
      this.logger.warn({
        event: "evolution.config.degraded",
        reason: "WEBHOOK_CONFIGURATION_MISSING",
        webhookPublicUrlConfigured: !!config.webhookPublicUrl,
        EVOLUTION_WEBHOOK_SECRET: { configured: !!config.webhookSecret },
      });
    }

    if (evolutionEnabled && webhookConfigured && this.connections) {
      await this.reconcileWebhooks();
      this.reconciliationTimer = setInterval(() => void this.reconcileWebhooks(), 10 * 60_000);
      this.reconciliationTimer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  private async reconcileWebhooks() {
    try {
      const result = await this.connections?.reconcileConnectedWebhooks();
      if (!result || result.scanned === 0) return;
      this.logger.log({ event: "evolution.webhook.reconciliation_completed", ...result });
    } catch (error) {
      this.logger.warn({
        event: "evolution.webhook.reconciliation_failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
