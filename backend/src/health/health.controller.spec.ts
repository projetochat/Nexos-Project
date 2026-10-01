import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

function controller(
  overrides: {
    database?: () => Promise<unknown>;
    queue?: () => Promise<{ ok: boolean; configured?: boolean }>;
    campaignQueue?: () => Promise<{ ok: boolean; configured?: boolean }>;
    storage?: () => Promise<{ ok: boolean }>;
    realtime?: () => { enabled: boolean; status: "up" | "down" | "degraded"; adapter: string };
  } = {},
) {
  return new HealthController(
    { $queryRaw: overrides.database ?? vi.fn().mockResolvedValue([{ ok: 1 }]) } as never,
    { health: overrides.queue ?? vi.fn().mockResolvedValue({ ok: true }) } as never,
    {
      enabled: vi.fn().mockReturnValue(true),
      health: overrides.campaignQueue ?? vi.fn().mockResolvedValue({ ok: true }),
    } as never,
    {
      health:
        overrides.realtime ??
        vi.fn().mockReturnValue({ enabled: true, status: "up", adapter: "redis" }),
    } as never,
    {
      provider: "local",
      readiness: overrides.storage ?? vi.fn().mockResolvedValue({ ok: true }),
    } as never,
  );
}

describe("HealthController", () => {
  it("keeps liveness independent from external dependencies", () => {
    expect(controller().liveness()).toMatchObject({ ok: true, status: "alive" });
  });

  it("reports ready only when every required dependency is usable", async () => {
    await expect(controller().readiness()).resolves.toMatchObject({
      ok: true,
      database: "up",
      redis: "up",
      campaignQueue: "up",
      storage: "up",
      realtime: "up",
    });
  });

  it("fails readiness when Redis is down instead of returning a false positive", async () => {
    const readiness = controller({ queue: vi.fn().mockResolvedValue({ ok: false }) }).readiness();
    await expect(readiness).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(readiness).rejects.toMatchObject({ response: { ok: false, redis: "down" } });
  });

  it("fails readiness when database, storage or realtime is unavailable", async () => {
    await expect(
      controller({
        database: vi.fn().mockRejectedValue(new Error("down")),
        storage: vi.fn().mockResolvedValue({ ok: false }),
        realtime: vi.fn().mockReturnValue({
          enabled: true,
          status: "degraded",
          adapter: "redis_degraded",
        }),
      }).readiness(),
    ).rejects.toMatchObject({
      response: {
        ok: false,
        database: "down",
        storage: "down",
        realtime: "degraded",
      },
    });
  });

  it("bounds a dependency that never responds", async () => {
    const previous = process.env.TRIXUS_HEALTH_CHECK_TIMEOUT_MS;
    process.env.TRIXUS_HEALTH_CHECK_TIMEOUT_MS = "100";
    try {
      const startedAt = Date.now();
      await expect(
        controller({ database: () => new Promise(() => undefined) }).readiness(),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(Date.now() - startedAt).toBeLessThan(500);
    } finally {
      if (previous === undefined) delete process.env.TRIXUS_HEALTH_CHECK_TIMEOUT_MS;
      else process.env.TRIXUS_HEALTH_CHECK_TIMEOUT_MS = previous;
    }
  });
});
