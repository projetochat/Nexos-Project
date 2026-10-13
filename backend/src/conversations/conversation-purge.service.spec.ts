import { describe, expect, it, vi } from "vitest";
import { CampaignRecipientStatus, OutboxEventStatus } from "../generated/prisma";
import { ConversationPurgeService } from "./conversation-purge.service";

const updatedAt = new Date("2026-10-08T18:00:00.000Z");

function conversationRecord() {
  return {
    id: "conversation-a",
    contactId: "contact-a",
    protocol: "2026-0001",
    groupName: null,
    externalChatId: "5511999999999@s.whatsapp.net",
    conversationType: "DIRECT",
    updatedAt,
    messages: [{ id: "message-a", mediaStorageKey: "tenants/a/media.jpg", updatedAt }],
    contact: { name: "Ana", phone: "+5511999999999" },
    _count: { participants: 0, tickets: 1 },
  };
}

function conversationDb() {
  const tx = {
    conversation: {
      findMany: vi.fn().mockResolvedValue([conversationRecord()]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "outbox-a",
          aggregateId: "message-a",
          type: "message.send",
          status: OutboxEventStatus.PENDING,
          updatedAt,
        },
      ]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignRecipient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ticket: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
}

describe("ConversationPurgeService", () => {
  it("unlinks tickets and campaign recipients before deleting the conversation, then cleans media", async () => {
    const { prisma, tx } = conversationDb();
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const service = new ConversationPurgeService(prisma as never, storage as never);
    const impact = await service.conversationImpact("conversation-a", "tenant-a");

    expect(impact.confirmation).toEqual({ level: "standard", confirmLabel: "Confirmar" });

    await expect(
      service.purgeConversation("conversation-a", impact.snapshotToken, "tenant-a"),
    ).resolves.toEqual({ status: "deleted", cleanup: "completed" });

    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", conversationId: { in: ["conversation-a"] } },
      data: { conversationId: null },
    });
    expect(tx.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", messageId: { in: ["message-a"] } },
      data: { messageId: null },
    });
    expect(tx.conversation.deleteMany).toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledWith("tenants/a/media.jpg");
  });

  it("revalidates the snapshot and does not delete when dependencies changed", async () => {
    const { prisma, tx } = conversationDb();
    const storage = { deleteObject: vi.fn() };
    const service = new ConversationPurgeService(prisma as never, storage as never);

    const result = await service.purgeConversation(
      "conversation-a",
      "0".repeat(64),
      "tenant-a",
    );

    expect(result.status).toBe("changed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.conversation.deleteMany).not.toHaveBeenCalled();
  });

  it("reports media cleanup as pending without rolling back the committed database deletion", async () => {
    const { prisma } = conversationDb();
    const storage = { deleteObject: vi.fn().mockRejectedValue(new Error("storage offline")) };
    const service = new ConversationPurgeService(prisma as never, storage as never);
    const impact = await service.conversationImpact("conversation-a", "tenant-a");

    await expect(
      service.purgeConversation("conversation-a", impact.snapshotToken, "tenant-a"),
    ).resolves.toEqual({ status: "deleted", cleanup: "pending" });
  });

  it("blocks contact deletion while a campaign recipient is active", async () => {
    const db = {
      contact: {
        findFirst: vi.fn().mockResolvedValue({
          id: "contact-a",
          name: "Ana",
          phone: "+5511999999999",
          normalizedPhone: "5511999999999",
          updatedAt,
        }),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([]) },
      campaignRecipient: {
        findMany: vi.fn().mockResolvedValue([
          { id: "recipient-a", status: CampaignRecipientStatus.PROCESSING, updatedAt },
        ]),
      },
      ticket: { count: vi.fn().mockResolvedValue(0) },
      contactCustomFieldValue: { count: vi.fn().mockResolvedValue(0) },
      contactTag: { count: vi.fn().mockResolvedValue(0) },
      contactMessagingPreference: { count: vi.fn().mockResolvedValue(0) },
      lead: { count: vi.fn().mockResolvedValue(0) },
      outboxEvent: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ConversationPurgeService(db as never, { deleteObject: vi.fn() } as never);

    const impact = await service.contactImpact("contact-a", "tenant-a");

    expect(impact.blockedReason).toContain("campanha pendente ou em processamento");
    expect(impact.confirmation).toEqual({ level: "standard", confirmLabel: "Confirmar" });
  });
});
