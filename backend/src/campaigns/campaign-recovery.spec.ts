import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { CampaignsService } from "./campaigns.service";
import { CAMPAIGN_COMMIT_OUTCOME_UNKNOWN, CAMPAIGN_RECIPIENT_CLAIMED } from "./campaigns.service";
import type { CampaignDispatchJob } from "./campaign-dispatch.queue";

type RecipientFilter = { status: string | { in: string[] } };
type ServiceInternals = {
  incrementCampaign: (id: string, data: Record<string, number>) => Promise<void>;
  createCampaignMessage: (...args: unknown[]) => Promise<string>;
};
function fixture() {
  const campaign = { id: "c", tenantId: "t", status: "RUNNING", archivedAt: null };
  const recipient = {
    id: "r",
    campaignId: "c",
    status: "PENDING",
    campaign,
    contact: { messagingPreferences: [] },
    messageId: null as string | null,
    processingAt: new Date("2026-01-01T00:00:00.000Z"),
    lastErrorCode: null as string | null,
  };
  const matches = (where: RecipientFilter) =>
    typeof where.status === "string"
      ? recipient.status === where.status
      : where.status.in.includes(recipient.status);
  const prisma = {
    $transaction: undefined as unknown,
    campaign: {
      findUnique: vi.fn(async () => campaign),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async () => campaign),
    },
    message: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => null) },
    campaignRecipient: {
      findMany: vi.fn(async ({ where }: { where: RecipientFilter }) =>
        matches(where) ? [recipient] : [],
      ),
      findFirst: vi.fn(async () => recipient),
      updateMany: vi.fn(
        async ({ where, data }: { where: RecipientFilter; data: Partial<typeof recipient> }) => {
          if (!matches(where)) return { count: 0 };
          Object.assign(recipient, data);
          return { count: 1 };
        },
      ),
      update: vi.fn(async ({ data }: { data: Partial<typeof recipient> }) => {
        Object.assign(recipient, data);
        return recipient;
      }),
    },
  };
  prisma.$transaction = vi.fn(async (action: (tx: typeof prisma) => unknown) => action(prisma));
  const jobs = new Set<string>();
  const queue = {
    enabled: vi.fn().mockReturnValue(true),
    enqueue: vi.fn(async (job: CampaignDispatchJob) => {
      if (job.kind === "campaign.recipient.send") jobs.add(job.recipientId);
      return {};
    }),
  };
  const outbox = { dispatchMessage: vi.fn(async () => undefined) };
  const service = new CampaignsService(
    prisma as never,
    { get: () => undefined } as never,
    queue as never,
    outbox as never,
    {} as never,
  );
  const internals = service as unknown as ServiceInternals;
  const count = vi.spyOn(internals, "incrementCampaign").mockResolvedValue(undefined);
  return { service, internals, queue, recipient, prisma, jobs, outbox, count };
}
const transient = () => Object.assign(new Error("transaction rolled back"), { code: "P2034" });
describe("campaign recovery without duplicate dispatch", () => {
  it("reconciles committed campaign control states with stable coordination jobs", async () => {
    const f = fixture();
    f.prisma.campaign.findMany.mockResolvedValue([
      {
        id: "scheduled",
        tenantId: "t",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 60_000),
      },
      { id: "queued", tenantId: "t", status: "QUEUED", scheduledAt: null },
      { id: "running", tenantId: "t", status: "RUNNING", scheduledAt: null },
      { id: "cancelling", tenantId: "t", status: "CANCELLING", scheduledAt: null },
    ]);

    await expect(f.service.reconcileScheduledCampaigns()).resolves.toEqual({
      scheduled: 1,
      queued: 1,
      running: 1,
      cancelling: 1,
    });

    expect(f.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "campaign.prepare", campaignId: "running" }),
      expect.objectContaining({ jobId: "campaign-reconcile-prepare-running" }),
    );
    expect(f.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "campaign.cancel", campaignId: "cancelling" }),
      expect.objectContaining({ jobId: "campaign-reconcile-cancel-cancelling" }),
    );
  });

  it("paginates through more than 100 active campaigns without starving later rows", async () => {
    const f = fixture();
    const campaigns = Array.from({ length: 205 }, (_, index) => ({
      id: `campaign-${String(index).padStart(3, "0")}`,
      tenantId: "t",
      status: "QUEUED",
      scheduledAt: null,
    }));
    f.prisma.campaign.findMany.mockImplementation(async (args: { cursor?: { id: string } }) => {
      const start = args.cursor
        ? campaigns.findIndex((campaign) => campaign.id === args.cursor?.id) + 1
        : 0;
      return campaigns.slice(start, start + 100);
    });

    await expect(f.service.reconcileScheduledCampaigns()).resolves.toEqual({
      scheduled: 0,
      queued: 205,
      running: 0,
      cancelling: 0,
    });

    expect(f.prisma.campaign.findMany).toHaveBeenCalledTimes(3);
    expect(f.queue.enqueue).toHaveBeenCalledTimes(205);
    expect(f.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "campaign-204" }),
      expect.objectContaining({ jobId: "campaign-reconcile-prepare-campaign-204" }),
    );
  });

  it.each([false, true])(
    "recovers rejected or ambiguous enqueue (accepted=%s)",
    async (accepted) => {
      const f = fixture();
      f.queue.enqueue.mockImplementationOnce(async (job) => {
        if (accepted && job.kind === "campaign.recipient.send") f.jobs.add(job.recipientId);
        throw new Error("queue timeout");
      });
      await expect(f.service.prepareDispatch("c")).rejects.toThrow("queue timeout");
      await f.service.prepareDispatch("c");
      expect(f.jobs.size).toBe(1);
      expect(
        f.queue.enqueue.mock.calls.filter(([j]) => j.kind === "campaign.recipient.send"),
      ).toHaveLength(2);
    },
  );
  it.each(["P2034", "P2024"])("retries safe failure %s then creates once", async (code) => {
    const f = fixture();
    f.recipient.status = "QUEUED";
    const create = vi
      .spyOn(f.internals, "createCampaignMessage")
      .mockRejectedValueOnce(Object.assign(transient(), { code }))
      .mockResolvedValueOnce("m");
    await expect(f.service.dispatchRecipient("c", "r", 1)).rejects.toThrow(
      "transaction rolled back",
    );
    expect(f.recipient.status).toBe("QUEUED");
    expect(f.count).not.toHaveBeenCalled();
    expect(await f.service.dispatchRecipient("c", "r", 2)).toEqual({ messageId: "m" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(f.outbox.dispatchMessage).toHaveBeenCalledTimes(1);
    expect(await f.service.dispatchRecipient("c", "r", 3)).toEqual({ skipped: true });
  });
  it("keeps a crash after claim but before the creation transaction safe to retry", async () => {
    const f = fixture();
    f.recipient.status = "QUEUED";
    const create = vi.spyOn(f.internals, "createCampaignMessage").mockRejectedValueOnce(
      Object.assign(new Error("process stopped before transaction"), {
        code: "P2034",
      }),
    );

    await expect(f.service.dispatchRecipient("c", "r", 1)).rejects.toThrow(
      "process stopped before transaction",
    );

    expect(create).toHaveBeenCalledOnce();
    expect(f.recipient.status).toBe("QUEUED");
    expect(f.recipient.lastErrorCode).not.toBe(CAMPAIGN_COMMIT_OUTCOME_UNKNOWN);
    expect(f.prisma.message.findFirst).toHaveBeenCalledOnce();
    expect(f.outbox.dispatchMessage).not.toHaveBeenCalled();
  });
  it("does not enqueue a recipient claimed concurrently for processing", async () => {
    const f = fixture();
    f.prisma.campaignRecipient.updateMany.mockImplementationOnce(async () => {
      f.recipient.status = "PROCESSING";
      return { count: 0 };
    });
    await f.service.prepareDispatch("c");
    expect(
      f.queue.enqueue.mock.calls.filter(([j]) => j.kind === "campaign.recipient.send"),
    ).toHaveLength(0);
    expect(f.recipient.status).toBe("PROCESSING");
  });
  it.each(["permanent", "last-attempt", "ambiguous"])(
    "does not reopen %s failure",
    async (kind) => {
      const f = fixture();
      f.recipient.status = "QUEUED";
      const error =
        kind === "permanent"
          ? new Error("invalid")
          : kind === "ambiguous"
            ? Object.assign(new Error("connection lost"), { code: "P1017" })
            : transient();
      vi.spyOn(f.internals, "createCampaignMessage").mockRejectedValue(error);
      await expect(
        f.service.dispatchRecipient("c", "r", kind === "last-attempt" ? 3 : 1),
      ).rejects.toThrow();
      expect(f.recipient.status).toBe("FAILED");
      expect(f.count).toHaveBeenCalledWith("c", { failedCount: 1 });
    },
  );
  it("reconciles a message committed before the recipient update without creating it again", async () => {
    const f = fixture();
    f.recipient.status = "QUEUED";
    f.prisma.message.findFirst.mockResolvedValue({ id: "already-created" });
    const create = vi
      .spyOn(f.internals, "createCampaignMessage")
      .mockRejectedValue(Object.assign(new Error("connection lost"), { code: "P1017" }));

    await expect(f.service.dispatchRecipient("c", "r", 1)).resolves.toEqual({
      messageId: "already-created",
      recovered: true,
    });

    expect(f.recipient.status).toBe("SENT");
    expect(f.recipient.messageId).toBe("already-created");
    expect(create).toHaveBeenCalledOnce();
    expect(f.outbox.dispatchMessage).toHaveBeenCalledWith("already-created");
  });
  it("never retries creation after the message was created and outbox dispatch failed", async () => {
    const f = fixture();
    f.recipient.status = "QUEUED";
    const create = vi.spyOn(f.internals, "createCampaignMessage").mockResolvedValue("m");
    f.outbox.dispatchMessage.mockRejectedValueOnce(transient());
    await expect(f.service.dispatchRecipient("c", "r", 1)).resolves.toEqual({
      messageId: "m",
      recovered: true,
    });
    expect(await f.service.dispatchRecipient("c", "r", 2)).toEqual({ skipped: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(f.outbox.dispatchMessage).toHaveBeenCalledTimes(2);
  });

  it("recovers a stale pre-commit claim and enqueues exactly one stable recipient job", async () => {
    const f = fixture();
    f.recipient.status = "PROCESSING";
    f.recipient.lastErrorCode = CAMPAIGN_RECIPIENT_CLAIMED;

    await expect(f.service.recoverStaleRecipients(1)).resolves.toMatchObject({
      safelyRequeued: 1,
      persistedReconciled: 0,
      blockedAsAmbiguous: 0,
    });

    expect(f.recipient.status).toBe("QUEUED");
    expect(
      f.queue.enqueue.mock.calls.filter(([job]) => job.kind === "campaign.recipient.send"),
    ).toHaveLength(1);
  });

  it("keeps a stale claim recoverable when queue acknowledgement fails", async () => {
    const f = fixture();
    f.recipient.status = "PROCESSING";
    f.recipient.lastErrorCode = CAMPAIGN_RECIPIENT_CLAIMED;
    f.queue.enqueue.mockRejectedValueOnce(new Error("queue timeout"));

    await expect(f.service.recoverStaleRecipients(1)).rejects.toThrow("queue timeout");

    expect(f.recipient.status).toBe("PROCESSING");
    expect(f.recipient.lastErrorCode).toBe(CAMPAIGN_RECIPIENT_CLAIMED);
  });

  it("blocks a stale ambiguous commit without creating or enqueueing a message", async () => {
    const f = fixture();
    f.recipient.status = "PROCESSING";
    f.recipient.lastErrorCode = CAMPAIGN_COMMIT_OUTCOME_UNKNOWN;

    await expect(f.service.recoverStaleRecipients(1)).resolves.toMatchObject({
      safelyRequeued: 0,
      persistedReconciled: 0,
      blockedAsAmbiguous: 1,
    });

    expect(f.recipient.status).toBe("FAILED");
    expect(f.recipient.lastErrorCode).toBe(CAMPAIGN_COMMIT_OUTCOME_UNKNOWN);
    expect(f.outbox.dispatchMessage).not.toHaveBeenCalled();
  });

  it("links a persisted message after a crash before recipient update and dispatches only it", async () => {
    const f = fixture();
    f.recipient.status = "PROCESSING";
    f.recipient.lastErrorCode = CAMPAIGN_COMMIT_OUTCOME_UNKNOWN;
    f.prisma.message.findFirst.mockResolvedValue({ id: "persisted-message" });

    await expect(f.service.recoverStaleRecipients(1)).resolves.toMatchObject({
      persistedReconciled: 1,
      blockedAsAmbiguous: 0,
    });

    expect(f.recipient.status).toBe("SENT");
    expect(f.recipient.messageId).toBe("persisted-message");
    expect(f.outbox.dispatchMessage).toHaveBeenCalledTimes(1);
    expect(f.outbox.dispatchMessage).toHaveBeenCalledWith("persisted-message");
  });
});
