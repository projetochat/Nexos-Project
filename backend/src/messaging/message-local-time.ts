export class InvalidMessageTimezoneError extends Error {
  constructor(timezone: string | null | undefined) {
    super(`Time zone da instancia ausente ou invalido: ${timezone?.trim() || "(ausente)"}.`);
    this.name = "InvalidMessageTimezoneError";
  }
}

export function requireIanaTimezone(timezone: string | null | undefined) {
  const value = timezone?.trim();
  if (!value) throw new InvalidMessageTimezoneError(timezone);
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(0);
  } catch {
    throw new InvalidMessageTimezoneError(timezone);
  }
  return value;
}

export function localDateTimeParts(at: Date, timezone: string | null | undefined) {
  const timeZone = requireIanaTimezone(timezone);
  if (Number.isNaN(at.getTime())) throw new Error("Instante invalido para mensagem.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function formatInstantInTimezone(at: Date, timezone: string | null | undefined) {
  const local = localDateTimeParts(at, timezone);
  return `${local.day}/${local.month}/${local.year} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
}
