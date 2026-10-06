export type AutomaticReplyKind = "welcome" | "absence";

import { InvalidMessageTimezoneError, localDateTimeParts } from "./message-local-time";

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

  try {
    localDayAndMinutes(input.at, input.timezone);
  } catch (error) {
    if (error instanceof InvalidMessageTimezoneError) return null;
    throw error;
  }

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

export function isWithinServiceHours(
  serviceHours: unknown,
  timezone: string | null | undefined,
  at: Date,
) {
  const local = localDayAndMinutes(at, timezone);
  const rows = Array.isArray(serviceHours) ? serviceHours : [];
  const current = rows.find((value) => isActiveDay(value, local.day));
  const previous = rows.find((value) => isActiveDay(value, previousDay(local.day)));
  return (
    (current
      ? periodsFor(current as Record<string, unknown>).some((period) =>
          period.end > period.start
            ? local.minutes >= period.start && local.minutes < period.end
            : local.minutes >= period.start,
        )
      : false) ||
    (previous
      ? periodsFor(previous as Record<string, unknown>).some(
          (period) => period.end < period.start && local.minutes < period.end,
        )
      : false)
  );
}

function periodsFor(row: Record<string, unknown>) {
  const periods = Array.isArray(row.periods) ? row.periods : [row];
  return periods.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const period = value as Record<string, unknown>;
    const start = minutesOf(period.start);
    const end = minutesOf(period.end);
    return start !== null && end !== null && end !== start ? [{ start, end }] : [];
  });
}

function localDayAndMinutes(at: Date, timezone: string | null | undefined) {
  const local = localDateTimeParts(at, timezone);
  const day = (
    {
      Mon: "Segunda",
      Tue: "Terça",
      Wed: "Quarta",
      Thu: "Quinta",
      Fri: "Sexta",
      Sat: "Sábado",
      Sun: "Domingo",
    } as Record<string, string>
  )[local.weekday];
  if (!day || !Number.isInteger(local.hour) || !Number.isInteger(local.minute)) {
    throw new Error("Nao foi possivel converter o horario local da instancia.");
  }
  return { day, minutes: local.hour * 60 + local.minute };
}

function isActiveDay(value: unknown, day: string) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as any).day === day &&
    (value as any).active === true,
  );
}

function previousDay(day: string) {
  const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const index = days.indexOf(day);
  return days[(index + days.length - 1) % days.length];
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
