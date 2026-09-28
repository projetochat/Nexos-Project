import type { QueryClient } from "@tanstack/react-query";
export async function refreshInboxData(
  queryClient: QueryClient,
  listQueryKey: readonly unknown[],
  activeId?: string,
) {
  await Promise.all([
    queryClient.refetchQueries(
      {
        queryKey: listQueryKey,
        exact: true,
        type: "active",
      },
      { throwOnError: true },
    ),
    ...(activeId
      ? [
          queryClient.refetchQueries(
            {
              queryKey: ["trixus", "conversations", activeId],
              exact: true,
              type: "active",
            },
            { throwOnError: true },
          ),
          queryClient.refetchQueries(
            {
              queryKey: ["trixus", "messages", activeId],
              exact: true,
              type: "active",
            },
            { throwOnError: true },
          ),
        ]
      : []),
  ]);
}
