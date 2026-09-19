import type { QueryClient } from "@tanstack/react-query";
import type { ApiConversation } from "@/lib/trixus-api";

export async function refreshInboxData(queryClient: QueryClient, activeId?: string) {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["trixus", "conversations"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["trixus", "customers", "all"], type: "all" }),
    ...(activeId
      ? [
          queryClient.refetchQueries({
            queryKey: ["trixus", "messages", activeId],
            type: "all",
          }),
        ]
      : []),
  ]);
  return activeId
    ? queryClient.getQueryData<ApiConversation>(["trixus", "conversations", activeId])
    : undefined;
}
