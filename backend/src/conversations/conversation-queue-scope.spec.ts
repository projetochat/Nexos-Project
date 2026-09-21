import { ConversationStatus, LeadStatus } from "../generated/prisma";
import { describe, expect, it } from "vitest";
import {
  conversationQueueScope,
  conversationQueueForNotification,
} from "./conversation-queue-scope";

describe("conversationQueueScope", () => {
  it("classifies notifications consistently with Inbox queues", () => {
    const conversation = { status: ConversationStatus.ABERTA, assignedMembershipId: null };
    expect(conversationQueueForNotification(conversation)).toBe("fila");
    for (const leadStatus of [LeadStatus.NEW, LeadStatus.QUEUED]) {
      expect(conversationQueueForNotification({ ...conversation, leadStatus })).toBe("leads");
      expect(
        conversationQueueForNotification({
          ...conversation,
          leadStatus,
          assignedMembershipId: "agent",
        }),
      ).toBe("ativas");
      expect(
        conversationQueueForNotification({
          ...conversation,
          leadStatus,
          assignedMembershipId: "agent",
          status: ConversationStatus.AGUARDANDO,
        }),
      ).toBe("standby");
    }
    expect(
      conversationQueueForNotification({ ...conversation, status: ConversationStatus.FECHADA }),
    ).toBeNull();
  });
  it("keeps the Inbox queues mutually exclusive", () => {
    expect(conversationQueueScope("ativas")).toEqual({
      assignedMembershipId: { not: null },
      status: { notIn: [ConversationStatus.FECHADA, ConversationStatus.AGUARDANDO] },
    });
    expect(conversationQueueScope("standby")).toEqual({ status: ConversationStatus.AGUARDANDO });
    expect(conversationQueueScope("fila")).toEqual({
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      OR: [
        { lead: { is: null } },
        {
          lead: {
            is: { status: { notIn: [LeadStatus.NEW, LeadStatus.QUEUED] } },
          },
        },
      ],
    });
    expect(conversationQueueScope("leads")).toEqual({
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      lead: {
        is: { status: { in: [LeadStatus.NEW, LeadStatus.QUEUED] } },
      },
    });
  });

  it("limits active conversations to the current attendant when required", () => {
    expect(conversationQueueScope("ativas", "membership-1")).toMatchObject({
      assignedMembershipId: "membership-1",
    });
  });
});
