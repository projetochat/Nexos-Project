import { describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConversationsController } from "./conversations.controller";
import { BulkCloseConversationsDto } from "./dto/bulk-close-conversations.dto";
import type { AuthenticatedUser } from "../auth/auth.types";

const user = {
  tenantId: "tenant-a",
  membershipId: "member-a",
  roleKey: "agent",
  connectionIds: ["allowed"],
} as AuthenticatedUser;
function setup(rows: Array<{ id: string; protocol: string | null }>) {
  const tx = {
    conversation: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
    conversationProtocolCounter: { upsert: vi.fn().mockResolvedValue({ lastNumber: 42 }) },
    message: { findFirst: vi.fn().mockResolvedValue(null) },
    lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = { $transaction: vi.fn(async (work: (tx: unknown) => unknown) => work(tx)) };
  const messages = { createSystemMessage: vi.fn().mockResolvedValue(undefined) };
  const realtime = { publishConversationUpdated: vi.fn() };
  const controller = new ConversationsController(
    db as never,
    messages as never,
    realtime as never,
    {} as never,
  );
  return { controller, tx, db, messages, realtime };
}

describe("bulk closing conversations", () => {
  it("rejects empty, duplicate and unknown queues and accepts the four queues", async () => {
    for (const queues of [[], ["ativas", "ativas"], ["fechada"], "ativas"]) {
      expect(
        await validate(plainToInstance(BulkCloseConversationsDto, { queues })),
      ).not.toHaveLength(0);
    }
    expect(
      await validate(
        plainToInstance(BulkCloseConversationsDto, {
          queues: ["ativas", "standby", "fila", "leads"],
        }),
      ),
    ).toHaveLength(0);
  });
  it("closes beyond one UI page, scopes tenant and connections, and includes groups", async () => {
    const rows = Array.from({ length: 125 }, (_, i) => ({
      id: `conversation-${i}`,
      protocol: null,
    }));
    const { controller, tx, messages, realtime } = setup(rows);
    expect(await controller.bulkClose({ queues: ["leads"] }, user)).toEqual({ closed: 125 });
    expect(tx.conversation.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { tenantId: "tenant-a", archivedAt: null, status: { not: "FECHADA" } },
          { connectionId: { in: ["allowed"] } },
          { OR: [{ status: "ABERTA", assignedMembershipId: null, protocol: null }] },
        ],
      },
      select: { id: true, protocol: true },
      orderBy: { id: "asc" },
    });
    expect(tx.conversation.update).toHaveBeenCalledTimes(125);
    expect(messages.createSystemMessage).toHaveBeenCalledTimes(250);
    expect(realtime.publishConversationUpdated).toHaveBeenCalledTimes(125);
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DISCARDED", discardedAt: expect.any(Date) } }),
    );
  });
  it("keeps existing protocol and start note, and adds the end record", async () => {
    const { controller, tx, messages } = setup([{ id: "group", protocol: "000007" }]);
    tx.message.findFirst.mockResolvedValue({ id: "existing-start" } as never);
    await controller.bulkClose({ queues: ["ativas", "standby", "fila"] }, user);
    expect(tx.conversationProtocolCounter.upsert).not.toHaveBeenCalled();
    expect(messages.createSystemMessage).toHaveBeenCalledTimes(1);
    expect(messages.createSystemMessage.mock.calls[0].slice(1, 4)).toEqual([
      "group",
      user,
      "Conversa encerrada - protocolo 000007.",
    ]);
    expect(tx.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FECHADA", protocol: "000007", unreadCount: 0 }),
      }),
    );
  });
  it("does not publish changes if the transaction fails, and tolerates repeat requests", async () => {
    const { controller, db, realtime } = setup([]);
    expect(await controller.bulkClose({ queues: ["leads"] }, user)).toEqual({ closed: 0 });
    db.$transaction.mockRejectedValueOnce(new Error("database failure"));
    await expect(controller.bulkClose({ queues: ["leads"] }, user)).rejects.toThrow(
      "database failure",
    );
    expect(realtime.publishConversationUpdated).not.toHaveBeenCalled();
  });
});
