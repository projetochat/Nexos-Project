import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

afterEach(() => vi.useRealTimers());

describe("dashboard week ranges", () => {
  it.each([
    ["week", "2026-09-13T03:00:00.000Z", "2026-09-15T15:00:00.000Z"],
    ["previous_week", "2026-09-06T03:00:00.000Z", "2026-09-13T03:00:00.000Z"],
  ] as const)(
    "uses Sunday boundaries for %s in the company timezone",
    async (period, start, end) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T15:00:00.000Z"));
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
        conversation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const metrics = {
        snapshot: vi.fn().mockResolvedValue({}),
        chartData: vi.fn().mockResolvedValue({}),
        semantics: vi.fn().mockReturnValue({}),
      };
      const service = new OperationsService(prisma as never, metrics as never);
      const result = await service.dashboard(
        { tenantId: "tenant-a", roleKey: "agent", connectionIds: ["vocical"] } as never,
        { period },
      );
      expect(result.range).toEqual({ start, end });
      expect(metrics.snapshot).toHaveBeenNthCalledWith(
        1,
        "tenant-a",
        {
          start: new Date(start),
          end: new Date(end),
        },
        { period, allowedConnectionIds: ["vocical"] },
      );
      expect(metrics.chartData).toHaveBeenCalledWith("tenant-a", expect.anything(), {
        period,
        allowedConnectionIds: ["vocical"],
      });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-a", archivedAt: null, connectionId: { in: ["vocical"] } },
        }),
      );
    },
  );
});
