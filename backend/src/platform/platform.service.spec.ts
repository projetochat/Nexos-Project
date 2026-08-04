import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";

describe("PlatformService health", () => {
  it("reports Redis-backed queues as degraded without failing the control plane", async () => {
    const service = new PlatformService(
      { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) } as never,
      {} as never,
      {} as never,
      { get: vi.fn().mockReturnValue("true") } as never,
      { health: vi.fn().mockResolvedValue({ ok: false, configured: true }) } as never,
      {
        enabled: vi.fn().mockReturnValue(true),
        health: vi.fn().mockResolvedValue({ ok: false, configured: true }),
      } as never,
      { health: vi.fn().mockReturnValue({ status: "degraded", adapter: "memory" }) } as never,
      { provider: "local" } as never,
      {} as never,
    );

    await expect(service.health()).resolves.toMatchObject({
      ok: true,
      database: "up",
      redis: "down",
      outboundQueue: { status: "down", configured: true },
      campaignQueue: { status: "down", configured: true },
      workers: { outbound: "configured", campaign: "configured" },
      realtime: { status: "degraded", adapter: "memory" },
      storage: { status: "up", provider: "local" },
      campaignScheduler: "configured",
    });
  });
});
