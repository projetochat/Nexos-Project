import { describe, expect, it, vi } from "vitest";
import { EvolutionQrCodeStore } from "./evolution-qr-code.store";

describe("EvolutionQrCodeStore", () => {
  it("keeps a QR available for polling and clears it after connection", async () => {
    const store = new EvolutionQrCodeStore();
    await store.put("instance-a", "data:image/png;base64,cXItY29kZQ==");

    await expect(store.get("instance-a")).resolves.toBe("data:image/png;base64,cXItY29kZQ==");
    await store.clear("instance-a");
    await expect(store.get("instance-a")).resolves.toBeNull();
  });

  it("deduplicates concurrent generation until the owner releases the lock", async () => {
    const store = new EvolutionQrCodeStore();
    const owner = await store.acquireGenerationLock("instance-a");

    expect(owner).toBeTruthy();
    await expect(store.renewGenerationLock("instance-a", owner!)).resolves.toBe(true);
    await expect(store.acquireGenerationLock("instance-a")).resolves.toBeNull();
    await store.releaseGenerationLock("instance-a", owner!);
    await expect(store.renewGenerationLock("instance-a", owner!)).resolves.toBe(false);
    await expect(store.acquireGenerationLock("instance-a")).resolves.toBeTruthy();
  });

  it("uses the local fallback without opening Redis when queues are disabled", async () => {
    const createConnection = () => {
      throw new Error("Redis must not be opened");
    };
    const store = new EvolutionQrCodeStore({
      enabled: () => false,
      createConnection,
    } as never);

    await store.put("instance-a", "data:image/png;base64,bG9jYWwtcXI=");
    await expect(store.get("instance-a")).resolves.toBe("data:image/png;base64,bG9jYWwtcXI=");
  });

  it("fails closed instead of using a replica-local lock when enabled Redis is unavailable", async () => {
    const store = new EvolutionQrCodeStore({
      enabled: () => true,
      createConnection: () => ({
        set: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
        eval: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      }),
    } as never);

    await expect(store.acquireGenerationLock("instance-a")).resolves.toBeNull();
    await expect(store.renewGenerationLock("instance-a", "owner-token")).resolves.toBe(false);
  });
});
