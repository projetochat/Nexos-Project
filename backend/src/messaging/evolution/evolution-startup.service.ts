import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { assertEvolutionConfigured, evolutionConfigFromEnv } from "./evolution.config";

@Injectable()
export class EvolutionStartupService implements OnModuleInit {
  private readonly logger = new Logger(EvolutionStartupService.name);

  onModuleInit() {
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
  }
}
