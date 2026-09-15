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
    apiKey: normalizeSecret(env.EVOLUTION_API_KEY ?? ""),
    webhookPublicUrl: trimTrailingSlash(env.EVOLUTION_WEBHOOK_PUBLIC_URL ?? ""),
    webhookSecret: normalizeSecret(env.EVOLUTION_WEBHOOK_SECRET ?? ""),
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

export function normalizeSecret(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}
