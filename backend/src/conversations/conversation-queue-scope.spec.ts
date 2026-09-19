import { ConversationStatus, LeadStatus } from "../generated/prisma";
import { describe, expect, it } from "vitest";
import { conversationQueueScope } from "./conversation-queue-scope";

describe("conversationQueueScope", () => {
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
