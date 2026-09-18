import type { QueryClient } from "@tanstack/react-query";

// Lifecycle actions persist system messages as well as conversation metadata.
// Refresh both after the transaction, including when the socket is unavailable.
export async function invalidateConversationQueries(
  queryClient: QueryClient,
  conversationId?: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["trixus", "conversations"] }),
    ...(conversationId
      ? [queryClient.invalidateQueries({ queryKey: ["trixus", "messages", conversationId] })]
      : []),
  ]);
}
