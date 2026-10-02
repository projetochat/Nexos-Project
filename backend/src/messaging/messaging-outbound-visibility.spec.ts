import { describe, expect, it, vi } from "vitest";
import { MessagingOutboundService } from "./messaging-outbound.service";

describe("outbound conversation visibility", () => {
  it("does not resolve another attendant's conversation without view-all", async () => {
    const db = { conversation: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = Object.create(MessagingOutboundService.prototype) as MessagingOutboundService;

    await expect(
      service.findVisibleConversation(db as never, "conversation-b", {
        tenantId: "tenant-a",
        membershipId: "membership-a",
        roleKey: "agent",
        connectionIds: ["connection-a"],
        chatDepartmentIds: ["department-a"],
        permissions: [],
      } as never),
    ).rejects.toThrow("Conversa não encontrada");

    expect(db.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: "conversation-b", tenantId: "tenant-a", archivedAt: null },
          {
            AND: [
              { connectionId: { in: ["connection-a"] } },
              { departmentId: { in: ["department-a"] } },
              {
                OR: [{ assignedMembershipId: "membership-a" }, { assignedMembershipId: null }],
              },
            ],
          },
        ],
      },
      include: {},
    });
  });
});
