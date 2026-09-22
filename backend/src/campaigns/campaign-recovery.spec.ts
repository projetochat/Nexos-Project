import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { CampaignsService } from "./campaigns.service";
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
  };
  const matches = (where: RecipientFilter) =>
    typeof where.status === "string"
      ? recipient.status === where.status
      : where.status.in.includes(recipient.status);
  const prisma = {
    campaign: { findUnique: vi.fn(async () => campaign) },
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
  const jobs = new Set<string>();
  const queue = {
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
  it.each(["permanent", "last-attempt", "persisted", "ambiguous"])(
    "does not reopen %s failure",
    async (kind) => {
      const f = fixture();
      f.recipient.status = "QUEUED";
      if (kind === "persisted")
        f.prisma.message.findFirst.mockResolvedValue({ id: "already-created" });
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
  it("never retries creation after the message was created and outbox dispatch failed", async () => {
    const f = fixture();
    f.recipient.status = "QUEUED";
    const create = vi.spyOn(f.internals, "createCampaignMessage").mockResolvedValue("m");
    f.outbox.dispatchMessage.mockRejectedValueOnce(transient());
    await expect(f.service.dispatchRecipient("c", "r", 1)).rejects.toThrow();
    expect(await f.service.dispatchRecipient("c", "r", 2)).toEqual({ skipped: true });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
