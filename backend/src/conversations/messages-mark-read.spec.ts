import { describe, expect, it, vi } from "vitest";
import { MessageDirection } from "../generated/prisma";
import { MessagesService } from "./messages.service";

describe("MessagesService.markRead", () => {
  it("preserves the existing Trixus reply behavior by clearing pending inbound messages", async () => {
    const prisma = {
      message: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      conversation: { update: vi.fn().mockResolvedValue({ unreadCount: 0 }) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const realtime = { publishUnreadUpdated: vi.fn() };
    const service = new MessagesService(
      prisma as never,
      {} as never,
      {} as never,
      realtime as never,
    );
    vi.spyOn(service, "findVisibleConversation").mockResolvedValue({ id: "conversation-a" } as never);

    const result = await service.markRead("conversation-a", {
      tenantId: "tenant-a",
      membershipId: "membership-a",
    } as never);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        direction: MessageDirection.INBOUND,
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "conversation-a" } },
      data: { unreadCount: 0 },
    });
    expect(realtime.publishUnreadUpdated).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      unreadCount: 0,
    });
    expect(result).toMatchObject({ unreadCount: 0, readAt: expect.any(Date) });
  });
});
