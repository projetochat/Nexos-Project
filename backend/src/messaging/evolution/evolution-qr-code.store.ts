import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type IORedis from "ioredis";
import { RedisConnectionFactory } from "../../queue/messaging-outbound.queue";

const QR_TTL_SECONDS = 90;
const LOCK_TTL_MS = 75_000;

@Injectable()
export class EvolutionQrCodeStore implements OnModuleDestroy {
  private readonly logger = new Logger(EvolutionQrCodeStore.name);
  private readonly local = new Map<string, { value: string; expiresAt: number }>();
  private readonly localLocks = new Map<string, { token: string; expiresAt: number }>();
  private redis: IORedis | null = null;
  private lastRedisWarningAt = 0;

  constructor(
    @Optional()
    @Inject(RedisConnectionFactory)
    private readonly redisFactory?: RedisConnectionFactory,
  ) {}

  async put(instanceName: string, qrCodeBase64: string) {
    const key = this.key(instanceName);
    this.local.set(key, { value: qrCodeBase64, expiresAt: Date.now() + QR_TTL_SECONDS * 1_000 });
    try {
      await this.connection()?.set(key, qrCodeBase64, "EX", QR_TTL_SECONDS);
    } catch (error) {
      this.logRedisFallback(error);
    }
  }

  async get(instanceName: string) {
    const key = this.key(instanceName);
    try {
      const shared = await this.connection()?.get(key);
      if (shared) return shared;
    } catch (error) {
      this.logRedisFallback(error);
    }
    const local = this.local.get(key);
    if (!local) return null;
    if (local.expiresAt <= Date.now()) {
      this.local.delete(key);
      return null;
    }
    return local.value;
  }

  async clear(instanceName: string) {
    const key = this.key(instanceName);
    this.local.delete(key);
    try {
      await this.connection()?.del(key);
    } catch (error) {
      this.logRedisFallback(error);
    }
  }

  async acquireGenerationLock(instanceName: string) {
    const key = `${this.key(instanceName)}:lock`;
    const token = randomUUID();
    const redis = this.connection();
    if (redis) {
      try {
        const result = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
        return result === "OK" ? token : null;
      } catch (error) {
        this.logRedisFallback(error);
        return null;
      }
    }
    const current = this.localLocks.get(key);
    if (current && current.expiresAt > Date.now()) return null;
    this.localLocks.set(key, { token, expiresAt: Date.now() + LOCK_TTL_MS });
    return token;
  }

  async releaseGenerationLock(instanceName: string, token: string) {
    const key = `${this.key(instanceName)}:lock`;
    const local = this.localLocks.get(key);
    if (local?.token === token) this.localLocks.delete(key);
    try {
      await this.connection()?.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    } catch (error) {
      this.logRedisFallback(error);
    }
  }

  async renewGenerationLock(instanceName: string, token: string) {
    const key = `${this.key(instanceName)}:lock`;
    const redis = this.connection();
    if (redis) {
      try {
        const result = await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          key,
          token,
          String(LOCK_TTL_MS),
        );
        return result === 1;
      } catch (error) {
        this.logRedisFallback(error);
        return false;
      }
    }
    const local = this.localLocks.get(key);
    if (local?.token !== token || local.expiresAt <= Date.now()) return false;
    local.expiresAt = Date.now() + LOCK_TTL_MS;
    return true;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
    this.redis = null;
  }

  private connection() {
    if (!this.redisFactory?.enabled()) return null;
    this.redis ??= this.redisFactory.createConnection("trixus-evolution-qr-store");
    return this.redis;
  }

  private key(instanceName: string) {
    const digest = createHash("sha256").update(instanceName).digest("hex");
    return `trixus:evolution:qr:${digest}`;
  }

  private logRedisFallback(error: unknown) {
    if (Date.now() - this.lastRedisWarningAt < 60_000) return;
    this.lastRedisWarningAt = Date.now();
    this.logger.warn({
      event: "evolution.qr.redis_degraded",
      error: error instanceof Error ? error.message.slice(0, 200) : "Redis unavailable",
    });
  }
}
