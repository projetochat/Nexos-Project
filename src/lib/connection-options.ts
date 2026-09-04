import type { ApiMessagingConnection } from "@/lib/nexos-api";
import { sortByOptionLabel } from "@/lib/sort-options";

const SUPPORTED_PROVIDER = "evolution";
const CONNECTED_STATUS = "connected";
export const EXAMPLE_INSTANCE_NAMES = ["ENORE", "FLOWID", "ZYVO"] as const;

export type ConnectedConnectionOption = {
  id: string;
  value: string;
  label: string;
  connection: ApiMessagingConnection;
};

export function connectedEvolutionConnections(connections: ApiMessagingConnection[]) {
  return connections.filter(
    (connection) =>
      connection.providerType === SUPPORTED_PROVIDER && connection.status === CONNECTED_STATUS,
  );
}

export function connectedConnectionOptions(connections: ApiMessagingConnection[]) {
  return sortByOptionLabel(connectedEvolutionConnections(connections), connectionDisplayLabel).map((connection) => ({
    id: connection.id,
    value: connectionInstanceValue(connection),
    label: connectionDisplayLabel(connection),
    connection,
  }));
}

export function connectionDisplayLabel(connection: ApiMessagingConnection) {
  const parts = [
    connection.name,
    connection.ownerPhoneMasked,
    providerLabel(connection.providerType),
    statusLabel(connection.status),
  ].filter(Boolean);
  return parts.join(" - ");
}

export function connectionPrimaryLabel(connection: ApiMessagingConnection) {
  return connection.name;
}

export function connectionInstanceValue(connection: ApiMessagingConnection) {
  return connection.externalReference ?? connection.name;
}

export function hasExampleInstanceName(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return EXAMPLE_INSTANCE_NAMES.some((name) => name === normalized);
}

function providerLabel(provider: ApiMessagingConnection["providerType"]) {
  if (provider === "evolution") return "Evolution";
  if (provider === "meta_cloud") return "Meta Cloud";
  return "Development";
}

function statusLabel(status: ApiMessagingConnection["status"]) {
  if (status === "connected") return "conectada";
  if (status === "connecting") return "conectando";
  if (status === "disconnected") return "desconectada";
  return "erro";
}
