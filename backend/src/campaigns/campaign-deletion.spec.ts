import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { CampaignRecipientStatus, CampaignStatus } from "../generated/prisma";
import { CampaignsService } from "./campaigns.service";

function fixture(options: { activeRecipients?: number } = {}) {
  const campaign = {
    id: "campaign-a",
    tenantId: "tenant-a",
    name: "Campanha de teste",
    status: CampaignStatus.COMPLETED,
    version: 3,
    updatedAt: new Date("2026-10-08T18:00:00.000Z"),
    archivedAt: null,
    connection: { name: "WhatsApp principal" },
  };
  const prisma = {
    campaign: {
      findFirst: vi.fn(async () => campaign),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignRecipient: {
      count: vi.fn(async ({ where }) => (where.status ? (options.activeRecipients ?? 0) : 2)),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "recipient-a",
          displayName: "Contato A",
          normalizedPhone: "5562999999999",
          status: CampaignRecipientStatus.SENT,
        },
      ]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    message: {
      count: vi.fn().mockResolvedValue(3),
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    outboxEvent: {
      count: vi.fn().mockResolvedValue(1),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (operation) => operation(prisma)),
  };
  const service = new CampaignsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const current = { tenantId: "tenant-a", membershipId: "membership-a" } as never;
  return { campaign, current, prisma, service };
}

describe("campaign physical deletion", () => {
  it("previews current dependencies and preserves messages while deleting campaign data", async () => {
    const { current, prisma, service } = fixture();
    const impact = await service.deletionImpact("campaign-a", current);

    expect(impact.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "recipients", count: 2, operation: "delete" }),
        expect.objectContaining({ id: "messages", count: 3, operation: "unlink" }),
        expect.objectContaining({ id: "outbox", count: 1, operation: "delete" }),
      ]),
    );
    expect(impact.confirmation).toEqual({ level: "standard", confirmLabel: "Confirmar" });
    await expect(service.remove("campaign-a", impact.snapshotToken, current)).resolves.toEqual({
      status: "deleted",
    });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", campaignId: "campaign-a" },
      data: { campaignId: null, campaignRecipientId: null },
    });
    expect(prisma.campaignRecipient.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", campaignId: "campaign-a" },
    });
    expect(prisma.outboxEvent.deleteMany).toHaveBeenCalled();
    expect(prisma.campaign.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "campaign-a",
        tenantId: "tenant-a",
        version: 3,
        status: CampaignStatus.COMPLETED,
      }),
    });
  });

  it("returns the refreshed impact when the campaign changed after preview", async () => {
    const { campaign, current, prisma, service } = fixture();
    const impact = await service.deletionImpact("campaign-a", current);
    campaign.version += 1;
    campaign.updatedAt = new Date("2026-10-08T18:01:00.000Z");

    const result = await service.remove("campaign-a", impact.snapshotToken, current);

    expect(result).toMatchObject({ status: "changed" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.campaign.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks deletion while any recipient is still active", async () => {
    const { current, prisma, service } = fixture({ activeRecipients: 1 });

    await expect(service.deletionImpact("campaign-a", current)).rejects.toThrow(
      "destinatários em processamento",
    );
    expect(prisma.campaign.deleteMany).not.toHaveBeenCalled();
  });
});
