import type { ApiMessagingConnection } from "./trixus-api";

export function canEditInstance(connection: ApiMessagingConnection) {
  const hasWhatsAppNumber = Boolean(connection.ownerPhone || connection.ownerPhoneMasked);
  return (
    hasWhatsAppNumber && (connection.status === "connected" || connection.status === "disconnected")
  );
}

export function instanceEditUnavailableReason(connection: ApiMessagingConnection) {
  if (!connection.ownerPhone && !connection.ownerPhoneMasked) {
    return "Conecte a instância ao WhatsApp para cadastrar o número antes de editá-la.";
  }
  if (connection.status === "connecting") return "Aguarde a conexão da instância para editá-la.";
  return "Esta instância não está disponível para edição.";
}

export function normalizeInstanceName(name: string) {
  return name.trim().toLocaleLowerCase("pt-BR");
}

export function instanceNameAlreadyExists(
  name: string,
  connections: ApiMessagingConnection[],
  excludeConnectionId?: string,
) {
  const normalizedName = normalizeInstanceName(name);
  if (!normalizedName) return false;
  return connections.some(
    (connection) =>
      connection.id !== excludeConnectionId &&
      connection.status !== "removed" &&
      normalizeInstanceName(connection.name) === normalizedName,
  );
}

export function serviceHoursError(
  rows: Array<{ day: string; active: boolean; start: string; end: string }>,
) {
  for (const row of rows) {
    if (!row.active) continue;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(row.start) || !time.test(row.end))
      return `Informe horários válidos em ${row.day} (HH:mm).`;
    if (row.end <= row.start) return "Hora final deve ser maior que a inicial.";
  }
  return "";
}
