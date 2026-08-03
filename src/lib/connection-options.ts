import type { ApiMessagingConnection } from "@/lib/nexos-api";

const SUPPORTED_PROVIDER = "evolution";
const CONNECTED_STATUS = "connected";

export function connectedEvolutionConnections(connections: ApiMessagingConnection[]) {
  return connections.filter(
    (connection) =>
      connection.providerType === SUPPORTED_PROVIDER && connection.status === CONNECTED_STATUS,
  );
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
