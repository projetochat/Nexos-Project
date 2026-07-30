export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  webhookPublicUrl: string | null;
  webhookSecret: string | null;
  timeoutMs: number;
};

export function evolutionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EvolutionConfig {
  return {
    baseUrl: trimTrailingSlash(env.EVOLUTION_BASE_URL ?? env.EVOLUTION_API_URL ?? ""),
    apiKey: env.EVOLUTION_API_KEY ?? "",
    webhookPublicUrl: trimTrailingSlash(env.EVOLUTION_WEBHOOK_PUBLIC_URL ?? ""),
    webhookSecret: env.EVOLUTION_WEBHOOK_SECRET ?? "",
    timeoutMs: Number(env.EVOLUTION_TIMEOUT_MS ?? 10_000),
  };
}

export function assertEvolutionConfigured(config: EvolutionConfig) {
  return !!config.baseUrl && !!config.apiKey;
}

function trimTrailingSlash(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
