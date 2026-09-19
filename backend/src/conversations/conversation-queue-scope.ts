import { ConversationStatus, LeadStatus, Prisma } from "../generated/prisma";

export type ConversationQueueTab = "ativas" | "standby" | "fila" | "leads";

/**
 * Defines the mutually exclusive Inbox queues. Keeping this in one place makes
 * the Inbox counters and the Dashboard describe the same conversations.
 */
export function conversationQueueScope(
  tab: ConversationQueueTab | undefined,
  assignedMembershipId?: string,
): Prisma.ConversationWhereInput {
  if (tab === "ativas") {
    return {
      assignedMembershipId: assignedMembershipId ?? { not: null },
      status: { notIn: [ConversationStatus.FECHADA, ConversationStatus.AGUARDANDO] },
    };
  }
  if (tab === "standby") return { status: ConversationStatus.AGUARDANDO };
  if (tab === "fila") {
    return {
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
    };
  }
  if (tab === "leads") {
    return {
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      lead: {
        is: { status: { in: [LeadStatus.NEW, LeadStatus.QUEUED] } },
      },
    };
  }
  return {};
}
