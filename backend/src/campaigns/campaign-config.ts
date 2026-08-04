import { ConfigService } from "@nestjs/config";

export type CampaignRuntimeConfig = {
  concurrency: number;
  messagesPerMinute: number;
  batchSize: number;
  maxRecipients: number;
};

export function readPositiveInteger(
  config: Pick<ConfigService, "get">,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string | number>(key);
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "").trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readCampaignRuntimeConfig(
  config: Pick<ConfigService, "get">,
): CampaignRuntimeConfig {
  return {
    concurrency: readPositiveInteger(config, "NEXOS_CAMPAIGN_CONCURRENCY", 2),
    messagesPerMinute: readPositiveInteger(config, "NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE", 12),
    batchSize: Math.min(readPositiveInteger(config, "NEXOS_CAMPAIGN_BATCH_SIZE", 25), 100),
    maxRecipients: readPositiveInteger(config, "NEXOS_CAMPAIGN_MAX_RECIPIENTS", 25),
  };
}

export function positiveDelayMs(targetTime: number, now = Date.now()) {
  const delay = targetTime - now;
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}
