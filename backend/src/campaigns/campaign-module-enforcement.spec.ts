import { describe, expect, it, vi } from "vitest";
import { CampaignStatus } from "../generated/prisma";
import { CampaignsService } from "./campaigns.service";

describe("CampaignsService tenant module enforcement", () => {
  it("does not prepare or enqueue an existing campaign while the tenant module is disabled", async () => {
    const prisma = {
      campaign: {
        findUnique: vi.fn().mockResolvedValue({
          id: "campaign-1",
          tenantId: "tenant-disabled",
          archivedAt: null,
          status: CampaignStatus.QUEUED,
          scheduledAt: null,
        }),
        updateMany: vi.fn(),
      },
      campaignRecipient: { findMany: vi.fn() },
    };
    const queue = { enqueue: vi.fn() };
    const entitlements = {
      getEntitlements: vi.fn().mockResolvedValue({ features: { campaigns: false } }),
    };
    const service = new CampaignsService(
      prisma as never,
      {} as never,
      queue as never,
      {} as never,
      entitlements as never,
    );

    await expect(service.prepareDispatch("campaign-1")).resolves.toEqual({
      skipped: true,
      reason: "CAMPAIGNS_MODULE_DISABLED",
    });
    expect(entitlements.getEntitlements).toHaveBeenCalledWith("tenant-disabled");
    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    expect(prisma.campaignRecipient.findMany).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not recover or dispatch stale recipients while the tenant module is disabled", async () => {
    const prisma = {
      campaignRecipient: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "recipient-1",
            tenantId: "tenant-disabled",
            campaignId: "campaign-1",
            lastErrorCode: "CAMPAIGN_RECIPIENT_CLAIMED",
            processingAt: new Date("2026-10-06T12:00:00.000Z"),
          },
        ]),
        updateMany: vi.fn(),
      },
      message: { findFirst: vi.fn() },
    };
    const queue = { enqueue: vi.fn() };
    const outbox = { dispatchMessage: vi.fn() };
    const entitlements = {
      getEntitlements: vi.fn().mockResolvedValue({ features: { campaigns: false } }),
    };
    const service = new CampaignsService(
      prisma as never,
      {} as never,
      queue as never,
      outbox as never,
      entitlements as never,
    );

    await expect(service.recoverStaleRecipients()).resolves.toEqual({
      scanned: 1,
      safelyRequeued: 0,
      persistedReconciled: 0,
      blockedAsAmbiguous: 0,
    });
    expect(entitlements.getEntitlements).toHaveBeenCalledWith("tenant-disabled");
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.campaignRecipient.updateMany).not.toHaveBeenCalled();
    expect(outbox.dispatchMessage).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
