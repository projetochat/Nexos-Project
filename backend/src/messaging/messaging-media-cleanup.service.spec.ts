import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxEventStatus } from "../generated/prisma";
import {
  MESSAGING_MEDIA_CLEANUP_REQUESTED,
  MessagingMediaCleanupService,
} from "./messaging-media-cleanup.service";

describe("MessagingMediaCleanupService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("marks a durable cleanup event as processed after deleting every object", async () => {
    const prisma = prismaMock();
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const service = new MessagingMediaCleanupService(prisma as never, storage as never);

    await expect(service.process("cleanup-a")).resolves.toBe(true);

    expect(storage.deleteObject).toHaveBeenCalledWith("tenants/tenant-a/messages/a.jpg");
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "cleanup-a" },
      data: expect.objectContaining({
        status: OutboxEventStatus.PROCESSED,
        processingAt: null,
        lastError: null,
      }),
    });
  });

  it("keeps a failed cleanup event available for a later retry", async () => {
    const prisma = prismaMock();
    const storage = { deleteObject: vi.fn().mockRejectedValue(new Error("storage unavailable")) };
    const service = new MessagingMediaCleanupService(prisma as never, storage as never);

    await expect(service.process("cleanup-a")).resolves.toBe(false);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "cleanup-a" },
      data: {
        status: OutboxEventStatus.FAILED,
        processingAt: null,
        lastError: "storage unavailable",
      },
    });
  });
});

function prismaMock() {
  return {
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "cleanup-a",
        payload: { objectKeys: ["tenants/tenant-a/messages/a.jpg"] },
      }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}
