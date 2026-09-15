import { describe, expect, it, vi } from "vitest";
import { MessageStatus, OutboxEventStatus } from "../generated/prisma";
import { OUTBOX_MESSAGING_OUTBOUND_REQUESTED } from "./messaging-outbound.queue";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

describe("OutboxDispatcherService", () => {
  it("enqueues pending outbox events and marks them processed", async () => {
    const event = outboxEvent();
    const prisma = prismaMock();
    prisma.outboxEvent.findMany.mockResolvedValueOnce([]);
    prisma.outboxEvent.findMany.mockResolvedValue([event]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    prisma.outboxEvent.findUniqueOrThrow.mockResolvedValue(event);
    const queue = { enqueue: vi.fn().mockResolvedValue({ id: "message-message-a" }) };

    await expect(
      new OutboxDispatcherService(prisma as never, queue as never).dispatchPending(),
    ).resolves.toEqual({ scanned: 1, dispatched: 1, recovered: 0 });

    expect(queue.enqueue).toHaveBeenCalledWith({ tenantId: "tenant-a", messageId: "message-a" });
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED }),
      }),
    );
  });

  it("keeps events recoverable when Redis enqueue fails", async () => {
    const event = outboxEvent();
    const prisma = prismaMock();
    prisma.outboxEvent.findFirst.mockResolvedValue({ id: event.id });
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    prisma.outboxEvent.findUniqueOrThrow.mockResolvedValue(event);
    const queue = { enqueue: vi.fn().mockRejectedValue(new Error("Redis unavailable")) };

    await expect(
      new OutboxDispatcherService(prisma as never, queue as never).dispatchMessage("message-a"),
    ).resolves.toBe(false);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboxEventStatus.FAILED,
          lastError: "Redis unavailable",
        }),
      }),
    );
  });

  it("releases stale PROCESSING events for recovery", async () => {
    const prisma = prismaMock();
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    const service = new OutboxDispatcherService(prisma as never, { enqueue: vi.fn() } as never);

    await expect(service.releaseStaleProcessingEvents(1)).resolves.toEqual({ count: 1 });

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OutboxEventStatus.PROCESSING,
          processingAt: expect.any(Object),
        }),
        data: expect.objectContaining({ status: OutboxEventStatus.FAILED }),
      }),
    );
  });

  it("rebuilds jobs from PROCESSED outbox events when the Message is still QUEUED", async () => {
    const event = outboxEvent({ status: OutboxEventStatus.PROCESSED });
    const prisma = prismaMock();
    prisma.outboxEvent.findMany.mockResolvedValue([event]);
    prisma.message.findFirst.mockResolvedValue({ id: "message-a" });
    const queue = { enqueue: vi.fn().mockResolvedValue({ id: "message-message-a" }) };
    const service = new OutboxDispatcherService(prisma as never, queue as never);

    await expect(service.recoverQueuedMessages()).resolves.toBe(1);

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: MessageStatus.QUEUED }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith({ tenantId: "tenant-a", messageId: "message-a" });
  });
});

function prismaMock() {
  return {
    outboxEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    message: { findFirst: vi.fn() },
  };
}

function outboxEvent(overrides: Partial<{ status: OutboxEventStatus }> = {}) {
  return {
    id: "outbox-a",
    tenantId: "tenant-a",
    type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
    aggregateId: "message-a",
    payload: { tenantId: "tenant-a", messageId: "message-a" },
    status: overrides.status ?? OutboxEventStatus.PENDING,
    attempts: 0,
    processingAt: null,
    processedAt: null,
    lastError: null,
    createdAt: new Date("2026-07-30T13:00:00.000Z"),
    updatedAt: new Date("2026-07-30T13:00:00.000Z"),
  };
}
