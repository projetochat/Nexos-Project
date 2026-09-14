import { ConversationStatus } from "../generated/prisma";
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
      protocol: { not: null },
    });
    expect(conversationQueueScope("leads")).toEqual({
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      protocol: null,
    });
  });

  it("limits active conversations to the current attendant when required", () => {
    expect(conversationQueueScope("ativas", "membership-1")).toMatchObject({
      assignedMembershipId: "membership-1",
    });
  });
});
