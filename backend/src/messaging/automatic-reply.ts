export type AutomaticReplyKind = "welcome" | "absence";

type AutomaticReplyInput = {
  createdConversation: boolean;
  isGroup: boolean;
  fromMe: boolean;
  welcomeEnabled: boolean;
  welcomeTemplate: string | null | undefined;
  absenceEnabled: boolean;
  absenceTemplate: string | null | undefined;
  serviceHours: unknown;
  timezone: string | null | undefined;
  at: Date;
};

/**
 * Picks one automatic reply for the first external message in a conversation.
 * Absence has priority only while it is enabled and the configured schedule is closed.
 */
export function selectAutomaticReply(input: AutomaticReplyInput): {
  kind: AutomaticReplyKind;
  template: string;
} | null {
  if (!input.createdConversation || input.isGroup || input.fromMe) return null;

  const absenceShouldSend =
    input.absenceEnabled &&
    hasText(input.absenceTemplate) &&
    !isWithinServiceHours(input.serviceHours, input.timezone, input.at);
  if (absenceShouldSend) return { kind: "absence", template: input.absenceTemplate!.trim() };

  if (input.welcomeEnabled && hasText(input.welcomeTemplate)) {
    return { kind: "welcome", template: input.welcomeTemplate!.trim() };
  }
  return null;
}

export function isWithinServiceHours(serviceHours: unknown, timezone: string | null | undefined, at: Date) {
  const local = localDayAndMinutes(at, timezone ?? "America/Sao_Paulo");
  if (!local) return false;
  const rows = Array.isArray(serviceHours) ? serviceHours : [];
  return rows.some((value) => {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    if (row.day !== local.day || row.active !== true) return false;
    return periodsFor(row).some(
      (period) => local.minutes >= period.start && local.minutes < period.end,
    );
  });
}

function periodsFor(row: Record<string, unknown>) {
  const periods = Array.isArray(row.periods) ? row.periods : [row];
  return periods.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const period = value as Record<string, unknown>;
    const start = minutesOf(period.start);
    const end = minutesOf(period.end);
    return start !== null && end !== null && end > start ? [{ start, end }] : [];
  });
}

function localDayAndMinutes(at: Date, timezone: string) {
  try {
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: timezone })
      .format(at)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace("-feira", "");
    const day =
      {
        segunda: "Segunda",
        terca: "Terça",
        quarta: "Quarta",
        quinta: "Quinta",
        sexta: "Sexta",
        sabado: "Sábado",
        domingo: "Domingo",
      }[weekday] ?? null;
    if (!day) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? { day, minutes: hour * 60 + minute } : null;
  } catch {
    return null;
  }
}

function minutesOf(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
