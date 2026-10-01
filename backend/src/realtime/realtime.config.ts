import { ConfigService } from "@nestjs/config";

export type RealtimeConfig = {
  enabled: boolean;
  redisAdapterEnabled: boolean;
  path: string;
  corsOrigin: string;
  presenceTtlSeconds: number;
  typingTtlMs: number;
  subscriptionLimit: number;
};

type RealtimeCorsEnvironment = {
  TRIXUS_REALTIME_CORS_ORIGIN?: string;
  FRONTEND_ORIGIN?: string;
};

export function realtimeAllowedOrigins(
  environment: RealtimeCorsEnvironment = process.env,
): string[] {
  return (
    environment.TRIXUS_REALTIME_CORS_ORIGIN ??
    environment.FRONTEND_ORIGIN ??
    "http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function realtimeCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) {
  if (!origin || realtimeAllowedOrigins().includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error("Origin not allowed by realtime CORS"), false);
}

export function realtimeConfig(config: ConfigService): RealtimeConfig {
  return {
    enabled: config.get<string>("TRIXUS_REALTIME_ENABLED", "true") !== "false",
    redisAdapterEnabled:
      config.get<string>("TRIXUS_REALTIME_REDIS_ADAPTER_ENABLED", "true") !== "false",
    path: config.get<string>("TRIXUS_REALTIME_PATH", "/socket.io"),
    corsOrigin: config.get<string>(
      "TRIXUS_REALTIME_CORS_ORIGIN",
      config.get<string>("FRONTEND_ORIGIN", "http://localhost:5173"),
    ),
    presenceTtlSeconds: Number(config.get<string>("TRIXUS_PRESENCE_TTL_SECONDS", "90")),
    typingTtlMs: Number(config.get<string>("TRIXUS_TYPING_TTL_MS", "5000")),
    subscriptionLimit: Number(config.get<string>("TRIXUS_REALTIME_SUBSCRIPTION_LIMIT", "25")),
  };
}
