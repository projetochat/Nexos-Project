import { ConversationStatus, Prisma } from "../generated/prisma";

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
      protocol: { not: null },
    };
  }
  if (tab === "leads") {
    return {
      status: ConversationStatus.ABERTA,
      assignedMembershipId: null,
      protocol: null,
    };
  }
  return {};
}
