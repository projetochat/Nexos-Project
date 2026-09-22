import { describe, expect, it, vi } from "vitest";
import {
  lockMessagingServiceState,
  MessagingServicePausedError,
  withMessagingServiceEnabled,
} from "./service-availability";

describe("messaging connection admission lock (database mocked)", () => {
  it.each([{ result: { providerMessageId: "accepted-id" } }, { result: undefined }])(
    "preserves a fulfilled action result if the read-only transaction fails after the callback",
    async ({ result }) => {
      const tx = { $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true }]) };
      const prisma = {
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
          await callback(tx);
          throw new Error("commit acknowledgement lost after action completed");
        }),
      };
      const action = vi.fn().mockResolvedValue(result);
      await expect(
        withMessagingServiceEnabled(prisma as never, "tenant-a", "connection-a", action),
      ).resolves.toBe(result);
      expect(action).toHaveBeenCalledOnce();
    },
  );
  it("propagates a transaction failure before the lock/action", async () => {
    const action = vi.fn();
    const prisma = { $transaction: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    await expect(
      withMessagingServiceEnabled(prisma as never, "tenant-a", "connection-a", action),
    ).rejects.toThrow("database unavailable");
    expect(action).not.toHaveBeenCalled();
  });
  it("uses a tenant-scoped shared row lock before admitting work", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ serviceEnabled: true }]);
    await lockMessagingServiceState({ $queryRaw } as never, "tenant-a", "connection-a");
    const [parts, connectionId, tenantId] = $queryRaw.mock.calls[0];
    expect(parts.join("?")).toContain('SELECT "serviceEnabled" FROM "messaging_connections"');
    expect(parts.join("?")).toContain('"tenantId" = ? FOR SHARE');
    expect(connectionId).toBe("connection-a");
    expect(tenantId).toBe("tenant-a");
  });
  it.each([{ rows: [] }, { rows: [{ serviceEnabled: false }] }])(
    "rejects missing/paused connections without admitting the action",
    async ({ rows }) => {
      const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) };
      const prisma = {
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
        ),
      };
      const action = vi.fn();
      await expect(
        withMessagingServiceEnabled(prisma as never, "tenant-a", "connection-a", action),
      ).rejects.toThrow();
      expect(action).not.toHaveBeenCalled();
    },
  );
  it("uses the paused error so inbound can retain the webhook", async () => {
    await expect(
      lockMessagingServiceState(
        { $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: false }]) } as never,
        "tenant-a",
        "connection-a",
      ),
    ).rejects.toBeInstanceOf(MessagingServicePausedError);
  });
  it("holds the transaction around asynchronous admitted work and propagates failure", async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        order.push("lock");
        return [{ serviceEnabled: true }];
      }),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        try {
          const result = await callback(tx);
          order.push("commit");
          return result;
        } catch (error) {
          order.push("rollback");
          throw error;
        }
      }),
    };
    await expect(
      withMessagingServiceEnabled(prisma as never, "tenant-a", "connection-a", async () => {
        order.push("action");
        throw new Error("isolated failure");
      }),
    ).rejects.toThrow("isolated failure");
    expect(order).toEqual(["lock", "action", "rollback"]);
  });
});
