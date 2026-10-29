import type { ApiConversation } from "./trixus-api";
import type { InboxTabId } from "./inbox-tab-state";

type RecentConversation = Pick<ApiConversation, "id" | "status" | "is_lead">;
const tabs = new Set<InboxTabId>(["ativas", "standby", "fila", "leads"]);

export function dashboardInboxLocate(value: unknown): InboxTabId | undefined {
  return typeof value === "string" && tabs.has(value as InboxTabId)
    ? (value as InboxTabId)
    : undefined;
}

export function recentConversationDestination(conversation: RecentConversation) {
  if (conversation.status === "fechada") {
    return { to: "/historico" as const, search: { conversationId: conversation.id } };
  }
  const tab: InboxTabId =
    conversation.status === "em_andamento"
      ? "ativas"
      : conversation.status === "aguardando"
        ? "standby"
        : conversation.is_lead
          ? "leads"
          : "fila";
  return {
    to: "/inbox/$conversationId" as const,
    params: { conversationId: conversation.id },
    search: { locate: tab },
  };
}

/** A denied/unavailable detail read must not block the existing History destination. */
export async function resolveRecentConversationDestination(
  conversation: RecentConversation,
  load: (id: string) => Promise<RecentConversation>,
) {
  try {
    const current = await load(conversation.id);
    if (current.id === conversation.id) return recentConversationDestination(current);
  } catch {
    // Preserve the authorized destination's own access checks on navigation.
  }
  return recentConversationDestination(conversation);
}
