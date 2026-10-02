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
  permissions: [],
} as AuthenticatedUser;
function setup(rows: Array<{ id: string; protocol: string | null }>) {
  const tx = {
    conversation: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
    conversationProtocolCounter: {
      upsert: vi.fn().mockResolvedValue({
        lastNumber: rows.filter((row) => !row.protocol).length,
      }),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: rows.length * 2 }),
    },
    lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: vi.fn().mockResolvedValue(rows.length),
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
          {
            AND: [
              { connectionId: { in: ["allowed"] } },
              {
                OR: [{ assignedMembershipId: "member-a" }, { assignedMembershipId: null }],
              },
            ],
          },
          {
            OR: [
              {
                status: "ABERTA",
                assignedMembershipId: null,
                lead: { is: { status: { in: ["NEW", "QUEUED"] } } },
              },
            ],
          },
        ],
      },
      select: { id: true, protocol: true },
      orderBy: { id: "asc" },
    });
    expect(tx.conversationProtocolCounter.upsert).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      update: { lastNumber: { increment: 125 } },
      create: { tenantId: "tenant-a", lastNumber: 125 },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.message.createMany).toHaveBeenCalledTimes(1);
    expect(tx.message.createMany.mock.calls[0][0].data).toHaveLength(250);
    expect(messages.createSystemMessage).not.toHaveBeenCalled();
    expect(realtime.publishConversationUpdated).toHaveBeenCalledTimes(125);
    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          conversationId: { in: rows.map((row) => row.id) },
        }),
        data: { status: "DISCARDED", discardedAt: expect.any(Date) },
      }),
    );
  });
  it("keeps existing protocol and start note, and adds the end record", async () => {
    const { controller, tx, messages } = setup([{ id: "group", protocol: "000007" }]);
    tx.message.findMany.mockResolvedValue([
      {
        conversationId: "group",
        content: "Conversa iniciada - protocolo 000007.",
      },
    ] as never);
    await controller.bulkClose({ queues: ["ativas", "standby", "fila"] }, user);
    expect(tx.conversationProtocolCounter.upsert).not.toHaveBeenCalled();
    expect(messages.createSystemMessage).not.toHaveBeenCalled();
    expect(tx.message.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        conversationId: "group",
        content: "Conversa encerrada - protocolo 000007.",
      }),
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
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
  it("keeps all writes in one transaction while chunking large volumes", async () => {
    const rows = Array.from({ length: 1_205 }, (_, index) => ({
      id: `conversation-${index}`,
      protocol: null,
    }));
    const { controller, tx, db, realtime } = setup(rows);

    expect(await controller.bulkClose({ queues: ["fila"] }, user)).toEqual({ closed: 1_205 });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.message.findMany).toHaveBeenCalledTimes(3);
    expect(tx.message.createMany).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(tx.lead.updateMany).toHaveBeenCalledTimes(3);
    expect(realtime.publishConversationUpdated).toHaveBeenCalledTimes(1_205);
  });
  it("retries P2034 twice and publishes only the committed result", async () => {
    const { controller, tx, db, realtime } = setup([{ id: "retry", protocol: null }]);
    let attempts = 0;
    db.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("serialization"), { code: "P2034" });
      return work(tx);
    });

    expect(await controller.bulkClose({ queues: ["fila"] }, user)).toEqual({ closed: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
    expect(realtime.publishConversationUpdated).toHaveBeenCalledTimes(1);
  });
});
