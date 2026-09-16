import { describe, expect, it, vi } from "vitest";
import { MessagesService } from "./messages.service";

describe("message status access", () => {
  it("checks tenant and allowed instances before looking up a sequence message", async () => {
    const prisma = {
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
      message: { findFirst: vi.fn() },
    };
    const service = new MessagesService(prisma as never, {} as never, {} as never);
    await expect(
      service.get("conversation", "message", {
        tenantId: "tenant",
        roleKey: "agent",
        connectionIds: ["allowed"],
      } as never),
    ).rejects.toThrow("Conversa não encontrada");
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: "conversation", tenantId: "tenant", archivedAt: null },
            { connectionId: { in: ["allowed"] } },
          ],
        },
      }),
    );
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it("restricts the message lookup to the selected conversation and tenant", async () => {
    const prisma = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation" }) },
      message: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new MessagesService(prisma as never, {} as never, {} as never);
    await expect(
      service.get("conversation", "message", {
        tenantId: "tenant",
        roleKey: "tenant_admin",
      } as never),
    ).rejects.toThrow("Mensagem não encontrada");
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "message", conversationId: "conversation", tenantId: "tenant" },
      }),
    );
  });
});
