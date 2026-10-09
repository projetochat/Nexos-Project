import type { ApiMessage } from "./trixus-api";

export function orderConversationMessages(messages: readonly ApiMessage[]) {
  return [...messages].sort((left, right) => {
    const timestampDifference =
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return timestampDifference || left.id.localeCompare(right.id);
  });
}
