import type { ApiConversation } from "./trixus-api";
import type { InboxTabId } from "./inbox-tab-state";

export type TransferQueue = "fila" | "standby";

export function availableTransferQueues<T extends { id: TransferQueue }>(
  options: T[],
  current: TransferQueue | null,
) {
  return options.filter((option) => option.id !== current);
}

export function currentTransferQueue(
  conversation: Pick<ApiConversation, "status" | "is_lead">,
  visibleTab?: InboxTabId,
): TransferQueue | null {
  if (conversation.status === "aguardando") return "standby";
  if (conversation.status === "aberta" && (visibleTab === "fila" || !conversation.is_lead)) {
    return "fila";
  }
  return null;
}
