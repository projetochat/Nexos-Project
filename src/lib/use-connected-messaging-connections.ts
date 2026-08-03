import { useQuery } from "@tanstack/react-query";
import {
  connectedConnectionOptions,
  connectedEvolutionConnections,
} from "@/lib/connection-options";
import { connectionsApi } from "@/lib/nexos-api";

export const MESSAGING_CONNECTIONS_QUERY_KEY = ["nexos", "messaging-connections"] as const;

export function useConnectedMessagingConnections(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: MESSAGING_CONNECTIONS_QUERY_KEY,
    queryFn: connectionsApi.list,
    enabled: options.enabled ?? true,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const allConnections = query.data ?? [];

  return {
    ...query,
    allConnections,
    connectedConnections: connectedEvolutionConnections(allConnections),
    connectionOptions: connectedConnectionOptions(allConnections),
  };
}
