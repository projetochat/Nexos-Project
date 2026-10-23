import { describe, expect, it, vi } from "vitest";
import { AiService } from "./ai.service";

describe("AiService tenant isolation", () => {
  it("always scopes connection lists to the authenticated tenant", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new AiService(
      { aiConnection: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listConnections({ tenantId: "tenant-a" } as never);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-a", archivedAt: null },
      }),
    );
  });
});
