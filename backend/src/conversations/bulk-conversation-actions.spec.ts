import { describe, expect, it, vi } from "vitest";
import { ConversationsController } from "./conversations.controller";
import type { AuthenticatedUser } from "../auth/auth.types";

const user = {
  tenantId: "tenant-a",
  membershipId: "member-a",
  roleKey: "agent",
  permissions: ["chat.bulk_actions.execute"],
} as AuthenticatedUser;

function controller() {
  return new ConversationsController({} as never, {} as never, {} as never, {} as never);
}

describe("bulk conversation actions", () => {
  it("resolves every visible conversation in the chosen tab with the current filters", async () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({ id: `conversation-${index}` }));
    const findMany = vi.fn().mockResolvedValue(rows);
    const subject = new ConversationsController(
      { conversation: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const assign = vi.spyOn(subject, "assign").mockResolvedValue({} as never);
    const customerId = "00000000-0000-4000-8000-000000000001";

    await expect(
      subject.bulkStart(
        {
          tabs: ["fila", "standby"],
          q: "Maria",
          source: "privado",
          onlyUnread: true,
          customerIds: [customerId],
          instances: ["instance-a"],
        },
        user,
      ),
    ).resolves.toEqual({
      succeeded: rows.map((row) => row.id),
      failed: [],
    });

    expect(assign).toHaveBeenCalledTimes(125);
    expect(findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const where = JSON.stringify(findMany.mock.calls[0][0].where);
    expect(where).toContain('"tenantId":"tenant-a"');
    expect(where).toContain('"status":"ABERTA"');
    expect(where).toContain('"status":"AGUARDANDO"');
    expect(where).toContain('"unreadCount":{"gt":0}');
    expect(where).toContain('"isGroup":false');
    expect(where).toContain(customerId);
    expect(where).toContain("instance-a");
    expect(where).toContain("Maria");
  });

  it("starts each selected conversation through the existing assignment validation", async () => {
    const subject = controller();
    const assign = vi.spyOn(subject, "assign").mockResolvedValue({} as never);

    await expect(
      subject.bulkStart(
        { conversationIds: ["conversation-a", "conversation-b"], departmentId: "department-a" },
        user,
      ),
    ).resolves.toEqual({
      succeeded: ["conversation-a", "conversation-b"],
      failed: [],
    });
    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith(
      "conversation-a",
      { self: true, departmentId: "department-a" },
      user,
      "bulk",
    );
  });

  it("returns per-conversation failures without retrying successful items", async () => {
    const subject = new ConversationsController(
      {
        conversation: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "conversation-a" }, { id: "conversation-b" }]),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(subject, "assign")
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("Destino incompatível com a instância."));

    await expect(
      subject.bulkTransfer(
        {
          conversationIds: ["conversation-a", "conversation-b"],
          mode: "agent",
          targetId: "membership-a",
        },
        user,
      ),
    ).resolves.toEqual({
      succeeded: ["conversation-a"],
      failed: [
        {
          conversationId: "conversation-b",
          message: "Destino incompatível com a instância.",
        },
      ],
    });
  });

  it("requires a destination before processing a bulk transfer", async () => {
    const subject = controller();
    await expect(
      subject.bulkTransfer({ conversationIds: ["conversation-a"], mode: "department" }, user),
    ).rejects.toThrow("Selecione o destino da transferência.");
  });
});
