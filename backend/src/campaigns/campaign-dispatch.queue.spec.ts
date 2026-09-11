import { describe, expect, it } from "vitest";
import { campaignJobId } from "./campaign-dispatch.queue";

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

  it("allows recurring preparation and finalization cycles", () => {
    expect(
      campaignJobId({ kind: "campaign.prepare", tenantId: "tenant-a", campaignId: "campaign-a" }),
    ).toBeUndefined();
    expect(
      campaignJobId({ kind: "campaign.finalize", tenantId: "tenant-a", campaignId: "campaign-a" }),
    ).toBeUndefined();
  });
});
