import { describe, expect, it, vi } from "vitest";
import { ScheduleExecutorService } from "./schedule-executor.service";
import { ScheduledMessagePermanentError } from "../messaging/messaging-outbound.service";

const due = new Date("2026-09-27T10:00:00.000Z");
const row = {
  id: "schedule-a",
  tenantId: "tenant-a",
  connectionId: "connection-a",
  payload: {
    type: "message",
    conversationId: "conversation-a",
    recurrence: "once",
    recipientIds: [],
    content: "Olá, {{nome}}",
    status: "pending",
  },
  dueAt: due,
  executionStatus: "PENDING",
  claimedAt: null,
  messageId: null,
  attempts: 0,
  lastError: null,
  completedAt: null,
  createdByMembershipId: "membership-a",
  nextAttemptAt: null,
  version: 2,
  createdAt: due,
  updatedAt: due,
};

function service(prisma: object, outbound: object = { queueScheduledMessage: vi.fn() }) {
  const realtime = { publish: vi.fn() };
  return {
    executor: new ScheduleExecutorService(
      prisma as never,
      outbound as never,
      realtime as never,
      { get: vi.fn() } as never,
    ),
    realtime,
  };
}

describe("ScheduleExecutorService", () => {
  it("claims a due one-shot conversation message with CAS and materializes it once", async () => {
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),
        findFirst: vi.fn().mockResolvedValue({ payload: row.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = { queueScheduledMessage: vi.fn().mockResolvedValue({ created: true }) };
    const { executor } = service(prisma, outbound);

    await expect(executor.runOnce(new Date("2026-09-27T10:01:00.000Z"))).resolves.toEqual({
      scanned: 1,
      claimed: 1,
    });

    expect(prisma.schedule.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executionStatus: "PENDING",
          dueAt: { lte: expect.any(Date) },
        }),
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          tenantId: true,
          dueAt: true,
          attempts: true,
          version: true,
          createdByMembershipId: true,
        },
        take: 25,
      }),
    );
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        id: "schedule-a",
        executionStatus: "CLAIMED",
        version: 3,
      },
      select: { payload: true },
    });
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          id: "schedule-a",
          executionStatus: "PENDING",
          version: 2,
        }),
      }),
    );
    expect(outbound.queueScheduledMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "schedule-a",
        claimedVersion: 3,
        conversationId: "conversation-a",
        occurrenceAt: due,
      }),
    );
  });

  it("materializes an attachment-only scheduled message", async () => {
    const attachmentOnly = {
      ...row,
      payload: {
        ...row.payload,
        content: "",
        attachment: {
          fileName: "audio.ogg",
          mimeType: "audio/ogg",
          size: 4,
          dataUrl: "data:audio/ogg;base64,T2dnUw==",
        },
      },
    };
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([attachmentOnly]),
        findFirst: vi.fn().mockResolvedValue({ payload: attachmentOnly.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = { queueScheduledMessage: vi.fn().mockResolvedValue({ created: true }) };
    const { executor } = service(prisma, outbound);

    await executor.runOnce(new Date("2026-09-27T10:01:00.000Z"));

    expect(outbound.queueScheduledMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "",
        attachment: expect.objectContaining({ mimeType: "audio/ogg" }),
      }),
    );
  });

  it("does not materialize when another poller wins the conditional claim", async () => {
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const outbound = { queueScheduledMessage: vi.fn() };
    const { executor } = service(prisma, outbound);

    await expect(executor.runOnce(due)).resolves.toEqual({ scanned: 1, claimed: 0 });
    expect(outbound.queueScheduledMessage).not.toHaveBeenCalled();
  });

  it("returns transient materialization failures to PENDING with exponential backoff", async () => {
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),
        findFirst: vi.fn().mockResolvedValue({ payload: row.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = {
      queueScheduledMessage: vi.fn().mockRejectedValue(new Error("storage down")),
    };
    const { executor } = service(prisma, outbound);
    const now = new Date("2026-09-27T10:01:00.000Z");

    await executor.runOnce(now);

    expect(prisma.schedule.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ executionStatus: "CLAIMED", version: 3 }),
        data: expect.objectContaining({
          executionStatus: "PENDING",
          nextAttemptAt: new Date("2026-09-27T10:01:30.000Z"),
          lastError: "storage down",
        }),
      }),
    );
  });

  it("keeps permanent authorization failures terminal and observable", async () => {
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),
        findFirst: vi.fn().mockResolvedValue({ payload: row.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = {
      queueScheduledMessage: vi
        .fn()
        .mockRejectedValue(new ScheduledMessagePermanentError("scope revoked")),
    };
    const { executor } = service(prisma, outbound);

    await executor.runOnce(due);

    expect(prisma.schedule.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStatus: "FAILED",
          nextAttemptAt: null,
          lastError: "scope revoked",
        }),
      }),
    );
  });

  it("stops retrying an infrastructure failure at the configured attempt limit", async () => {
    const finalAttempt = { ...row, attempts: 4 };
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([finalAttempt]),
        findFirst: vi.fn().mockResolvedValue({ payload: row.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = { queueScheduledMessage: vi.fn().mockRejectedValue(new Error("infra down")) };
    const { executor } = service(prisma, outbound);

    await executor.runOnce(due);

    expect(prisma.schedule.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStatus: "FAILED",
          nextAttemptAt: null,
          lastError: "infra down",
        }),
      }),
    );
  });

  it("recovers stale claims with a version bump so an old worker cannot finalize", async () => {
    const prisma = {
      schedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const { executor } = service(prisma);
    const now = new Date("2026-09-27T12:00:00.000Z");

    await executor.recoverStaleClaims(now);

    expect(prisma.schedule.updateMany).toHaveBeenCalledWith({
      where: {
        executionStatus: "CLAIMED",
        claimedAt: { lt: new Date("2026-09-27T11:59:00.000Z") },
        messageId: null,
      },
      data: expect.objectContaining({
        executionStatus: "PENDING",
        claimedAt: null,
        nextAttemptAt: now,
        version: { increment: 1 },
      }),
    });
  });

  it("marks a queued schedule SENT only after observing terminal message success", async () => {
    const queued = { ...row, executionStatus: "QUEUED", messageId: "message-a", version: 4 };
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValue([queued]),
        findUnique: vi.fn().mockResolvedValue({ payload: queued.payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "message-a", tenantId: "tenant-a", status: "SENT" }]),
      },
    };
    const { executor, realtime } = service(prisma);

    await expect(executor.reconcileQueued(due)).resolves.toEqual({
      scanned: 1,
      completed: 1,
      failed: 0,
    });
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStatus: "SENT",
          completedAt: due,
          payload: expect.objectContaining({ status: "completed" }),
        }),
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith({ tenantId: "tenant-a" }, "schedule.updated", {
      scheduleId: "schedule-a",
    });
    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, tenantId: true, messageId: true, version: true },
        take: 25,
      }),
    );
  });

  it("loads a large attachment only after claiming its lightweight row", async () => {
    const largeDataUrl = `data:application/octet-stream;base64,${"A".repeat(4 * 1024 * 1024)}`;
    const payload = {
      ...row.payload,
      content: "Arquivo grande",
      attachment: {
        fileName: "arquivo.bin",
        mimeType: "application/octet-stream",
        size: 3 * 1024 * 1024,
        dataUrl: largeDataUrl,
      },
    };
    const lightweightRow = {
      id: row.id,
      tenantId: row.tenantId,
      dueAt: row.dueAt,
      attempts: row.attempts,
      version: row.version,
      createdByMembershipId: row.createdByMembershipId,
    };
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([lightweightRow]),
        findFirst: vi.fn().mockResolvedValue({ payload }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const outbound = { queueScheduledMessage: vi.fn().mockResolvedValue({ created: true }) };
    const { executor } = service(prisma, outbound);

    await expect(executor.runOnce(due)).resolves.toEqual({ scanned: 1, claimed: 1 });

    expect(prisma.schedule.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ payload: expect.anything() }),
        take: 25,
      }),
    );
    expect(prisma.schedule.findFirst).toHaveBeenCalledTimes(1);
    expect(outbound.queueScheduledMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({ dataUrl: largeDataUrl }),
      }),
    );
  });

  it("keeps final failures observable on the schedule", async () => {
    const queued = { ...row, executionStatus: "QUEUED", messageId: "message-a", version: 4 };
    const prisma = {
      schedule: {
        findMany: vi.fn().mockResolvedValue([queued]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "message-a",
            tenantId: "tenant-a",
            status: "FAILED",
            providerErrorMessage: "Instância desconectada",
          },
        ]),
      },
    };
    const { executor } = service(prisma);

    await expect(executor.reconcileQueued(due)).resolves.toEqual({
      scanned: 1,
      completed: 0,
      failed: 1,
    });
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionStatus: "FAILED",
          lastError: "Instância desconectada",
        }),
      }),
    );
  });
});
