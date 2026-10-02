import { describe, expect, it, vi } from "vitest";
import { ConversationsController } from "./conversations.controller";
import { MessagesService } from "./messages.service";
import type { AuthenticatedUser } from "../auth/auth.types";

const current: AuthenticatedUser = {
  userId: "user-a",
  roleId: "role-a",
  platformRole: "USER",
  tenantId: "tenant-a",
  roleKey: "agent",
  membershipId: "member-a",
  connectionIds: ["vocical"],
  chatDepartmentIds: ["department-a"],
  permissions: ["chat.conversations.view_all_active"],
};

describe("chat instance isolation", () => {
  it("applies the same instance scope to all Inbox queues and counts without hiding archived chats", async () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const buildWhere = controller["buildWhere"].bind(controller);
    for (const tab of ["ativas", "standby", "fila", "leads"] as const) {
      const where = await buildWhere(current, { tab });
      expect(JSON.stringify(where)).toContain('"connectionId":{"in":["vocical"]}');
      expect(JSON.stringify(where)).toContain('"departmentId":{"in":["department-a"]}');
      expect(JSON.stringify(where)).not.toContain("inboxArchivedAt");
      expect(JSON.stringify(where)).not.toContain("member-a");
    }
    const counts = await buildWhere(current, {}, { omitTab: true });
    expect(JSON.stringify(counts)).toContain('"connectionId":{"in":["vocical"]}');
    expect(JSON.stringify(counts)).toContain('"departmentId":{"in":["department-a"]}');
  });
  it("limits an attendant without view-all to their conversations and the unassigned queue", async () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const where = await controller["buildWhere"](
      { ...current, permissions: [] },
      { tab: "ativas" },
    );
    expect(where.AND).toContainEqual({
      AND: [
        { connectionId: { in: ["vocical"] } },
        { departmentId: { in: ["department-a"] } },
        {
          OR: [{ assignedMembershipId: "member-a" }, { assignedMembershipId: null }],
        },
      ],
    });
  });
  it("rejects reading messages outside the selected instance", async () => {
    const db = { conversation: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = Object.create(MessagesService.prototype) as MessagesService;
    await expect(
      service.findVisibleConversation(db as never, "other-chat", current as never),
    ).rejects.toThrow("Conversa não encontrada");
    expect(db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: "other-chat", tenantId: "tenant-a", archivedAt: null },
            {
              connectionId: { in: ["vocical"] },
              departmentId: { in: ["department-a"] },
            },
          ],
        },
      }),
    );
  });
});
