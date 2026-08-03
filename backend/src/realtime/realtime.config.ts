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

export function realtimeConfig(config: ConfigService): RealtimeConfig {
  return {
    enabled: config.get<string>("NEXOS_REALTIME_ENABLED", "true") !== "false",
    redisAdapterEnabled:
      config.get<string>("NEXOS_REALTIME_REDIS_ADAPTER_ENABLED", "true") !== "false",
    path: config.get<string>("NEXOS_REALTIME_PATH", "/socket.io"),
    corsOrigin: config.get<string>("NEXOS_REALTIME_CORS_ORIGIN", "http://localhost:5173"),
    presenceTtlSeconds: Number(config.get<string>("NEXOS_PRESENCE_TTL_SECONDS", "90")),
    typingTtlMs: Number(config.get<string>("NEXOS_TYPING_TTL_MS", "5000")),
    subscriptionLimit: Number(config.get<string>("NEXOS_REALTIME_SUBSCRIPTION_LIMIT", "25")),
  };
}
