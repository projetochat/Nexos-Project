import { describe, expect, it, vi } from "vitest";
import { AuthSessionCleanupService } from "./auth-session-cleanup.service";

describe("AuthSessionCleanupService", () => {
  it("runs a bounded database cleanup outside request handling", async () => {
    const execute = vi.fn().mockResolvedValue(37);
    const service = new AuthSessionCleanupService({ $executeRaw: execute } as never);

    await expect(service.prune()).resolves.toBe(37);
    expect(execute).toHaveBeenCalledOnce();
    const query = execute.mock.calls[0]?.[0] as { strings?: string[] };
    expect(query.strings?.join(" ")).toContain("LIMIT 1000");
  });
});
