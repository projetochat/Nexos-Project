import { describe, expect, it, vi } from "vitest";
import { CampaignDispatchQueue, campaignJobId } from "./campaign-dispatch.queue";
import { RedisConnectionFactory } from "../queue/messaging-outbound.queue";

describe("campaignJobId", () => {
  it("keeps recipient delivery idempotent", () => {
    expect(
      campaignJobId({
        kind: "campaign.recipient.send",
        tenantId: "tenant-a",
        campaignId: "campaign-a",
        recipientId: "recipient-a",
      }),
    ).toBe("campaign-recipient-recipient-a");
  });

  it("rearms a retained terminal recipient job but preserves an active one", async () => {
    const removeCompleted = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue({});
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("completed"),
        remove: removeCompleted,
      })
      .mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("active"),
        remove: vi.fn(),
      });
    const queue = new CampaignDispatchQueue({
      enabled: vi.fn().mockReturnValue(true),
      createConnection: vi.fn(),
    } as unknown as RedisConnectionFactory);
    vi.spyOn(queue, "getQueue").mockReturnValue({ add, getJob } as never);
    const job = {
      kind: "campaign.recipient.send" as const,
      tenantId: "tenant-a",
      campaignId: "campaign-a",
      recipientId: "recipient-a",
    };

    await queue.enqueue(job);
    await queue.enqueue(job);

    expect(removeCompleted).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("allows recurring preparation and finalization cycles", () => {
    expect(
      campaignJobId({ kind: "campaign.prepare", tenantId: "tenant-a", campaignId: "campaign-a" }),
    ).toBeUndefined();
    expect(
      campaignJobId({ kind: "campaign.finalize", tenantId: "tenant-a", campaignId: "campaign-a" }),
    ).toBeUndefined();
  });

  it("rearms a retained periodic reconciliation job by its explicit stable id", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue({});
    const queue = new CampaignDispatchQueue({
      enabled: vi.fn().mockReturnValue(true),
      createConnection: vi.fn(),
    } as unknown as RedisConnectionFactory);
    vi.spyOn(queue, "getQueue").mockReturnValue({
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue("completed"),
        remove,
      }),
      add,
    } as never);

    await queue.enqueue(
      { kind: "campaign.prepare", tenantId: "tenant-a", campaignId: "campaign-a" },
      { jobId: "campaign-reconcile-prepare-campaign-a" },
    );

    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      "campaign.prepare",
      expect.any(Object),
      expect.objectContaining({ jobId: "campaign-reconcile-prepare-campaign-a" }),
    );
  });
});
