import { describe, expect, it, vi } from "vitest";
import { ConversationsController } from "./conversations.controller";
import { MessagesService } from "./messages.service";

const current = { tenantId: "tenant-a", roleKey: "agent", membershipId: "member-a", connectionIds: ["vocical"], permissions: ["chat.conversations.view_all_active"] };

describe("chat instance isolation", () => {
  it("applies the same instance scope to all Inbox queues and counts without hiding archived chats", async () => {
    const controller = new ConversationsController({} as never, {} as never, {} as never, {} as never);
    const buildWhere = (controller as any).buildWhere.bind(controller);
    for (const tab of ["ativas", "standby", "fila", "leads"]) {
      const where = await buildWhere(current, { tab });
      expect(where.AND).toContainEqual({ connectionId: { in: ["vocical"] } });
      expect(JSON.stringify(where)).not.toContain("inboxArchivedAt");
      expect(JSON.stringify(where)).not.toContain("member-a");
    }
    const counts = await buildWhere(current, {}, { omitTab: true });
    expect(counts.AND).toContainEqual({ connectionId: { in: ["vocical"] } });
  });
  it("rejects reading messages outside the selected instance", async () => {
    const db = { conversation: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = Object.create(MessagesService.prototype) as MessagesService;
    await expect(service.findVisibleConversation(db as never, "other-chat", current as never)).rejects.toThrow("Conversa não encontrada");
    expect(db.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      AND: [{ id: "other-chat", tenantId: "tenant-a", archivedAt: null }, { connectionId: { in: ["vocical"] } }],
    } }));
  });
});
