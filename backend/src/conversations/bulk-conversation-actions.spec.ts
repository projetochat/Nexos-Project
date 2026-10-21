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
    const subject = controller();
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
