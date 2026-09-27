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
  rows: Array<{
    day: string;
    active: boolean;
    start?: string;
    end?: string;
    periods?: Array<{ start: string; end: string }>;
  }>,
) {
  for (const row of rows) {
    if (!row.active) continue;
    const periods = row.periods?.length
      ? row.periods
      : row.start !== undefined || row.end !== undefined
        ? [{ start: row.start ?? "", end: row.end ?? "" }]
        : [];
    if (periods.length === 0) return `Inclua ao menos um horário em ${row.day}.`;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const period of periods) {
      if (!time.test(period.start) || !time.test(period.end))
        return `Informe horários válidos em ${row.day} (HH:mm).`;
      if (period.end <= period.start) return "Hora final deve ser maior que a inicial.";
    }
  }
  return "";
}

type ComparableServiceHoursRow = {
  day: string;
  active: boolean;
  start: string;
  end: string;
  periods?: Array<{ start: string; end: string }>;
};

export function sameServiceHours(
  saved: ComparableServiceHoursRow[] | null | undefined,
  expected: ComparableServiceHoursRow[],
) {
  if (!saved || saved.length !== expected.length) return false;
  return expected.every((expectedRow, index) => {
    const savedRow = saved[index];
    if (!savedRow || savedRow.day !== expectedRow.day || savedRow.active !== expectedRow.active) {
      return false;
    }
    const savedPeriods = savedRow.periods?.length
      ? savedRow.periods
      : [{ start: savedRow.start, end: savedRow.end }];
    const expectedPeriods = expectedRow.periods?.length
      ? expectedRow.periods
      : [{ start: expectedRow.start, end: expectedRow.end }];
    return (
      savedPeriods.length === expectedPeriods.length &&
      expectedPeriods.every(
        (period, periodIndex) =>
          savedPeriods[periodIndex]?.start === period.start &&
          savedPeriods[periodIndex]?.end === period.end,
      )
    );
  });
}
