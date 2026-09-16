import { describe, expect, it, vi } from "vitest";
import { OperationsMetricsService } from "./operations-metrics.service";

describe("dashboard instance metrics", () => {
  it("intersects the requested instance with the profile scope in conversation, message and lead totals", async () => {
    const model = () => ({
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    });
    const prisma = {
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
      conversation: model(),
      message: model(),
      lead: model(),
      ticket: model(),
      customer: model(),
      contact: model(),
      department: model(),
      messagingConnection: model(),
    };
    const service = new OperationsMetricsService(prisma as never);
    await service.snapshot(
      "tenant-a",
      { start: new Date("2026-09-01"), end: new Date("2026-10-01") },
      { allowedConnectionIds: ["vocical"], connectionId: "other" },
    );
    for (const [args] of prisma.conversation.count.mock.calls) {
      expect(args.where.AND).toContainEqual({ connectionId: { in: ["vocical"] } });
      expect(args.where.connectionId).toBe("other");
    }
    for (const [args] of prisma.message.count.mock.calls) {
      expect(args.where.conversation.AND).toContainEqual({ connectionId: { in: ["vocical"] } });
    }
    for (const [args] of prisma.lead.count.mock.calls) {
      expect(args.where.AND).toContainEqual({
        conversation: { connectionId: { in: ["vocical"] } },
      });
    }
    expect(prisma.messagingConnection.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["vocical"] } }) }),
    );
  });
});
