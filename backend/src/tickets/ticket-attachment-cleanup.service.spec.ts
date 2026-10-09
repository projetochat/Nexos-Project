import { describe, expect, it, vi } from "vitest";
import { OutboxEventStatus } from "../generated/prisma";
import {
  TICKET_ATTACHMENT_CLEANUP_REQUESTED,
  TicketAttachmentCleanupService,
} from "./ticket-attachment-cleanup.service";

describe("TicketAttachmentCleanupService", () => {
  it("deletes every storage object and marks the durable event processed", async () => {
    const prisma = cleanupPrisma();
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const service = new TicketAttachmentCleanupService(prisma as never, storage as never);

    await expect(service.process("event-a")).resolves.toBe(true);

    expect(storage.deleteObject.mock.calls.map(([key]) => key)).toEqual(["object-a", "object-b"]);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "event-a" },
      data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED, lastError: null }),
    });
  });

  it("keeps a failed event retryable without losing its object list", async () => {
    const prisma = cleanupPrisma();
    const storage = { deleteObject: vi.fn().mockRejectedValueOnce(new Error("storage offline")) };
    const service = new TicketAttachmentCleanupService(prisma as never, storage as never);

    await expect(service.process("event-a")).resolves.toBe(false);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "event-a" },
      data: expect.objectContaining({
        status: OutboxEventStatus.FAILED,
        lastError: "storage offline",
      }),
    });
  });

  it("recovers a stale processing lease before scanning pending work", async () => {
    const prisma = cleanupPrisma();
    prisma.outboxEvent.findMany.mockResolvedValue([]);
    const service = new TicketAttachmentCleanupService(prisma as never, {} as never);

    await expect(service.processPending()).resolves.toEqual({ scanned: 0, processed: 0 });

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: OutboxEventStatus.PROCESSING }),
        data: expect.objectContaining({ status: OutboxEventStatus.FAILED, processingAt: null }),
      }),
    );
  });
});

function cleanupPrisma() {
  return {
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "event-a",
        payload: { objectKeys: ["object-a", "object-b"] },
      }),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
}
