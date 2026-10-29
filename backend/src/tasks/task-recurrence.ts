export type TaskRecurrenceConfig = {
  frequency: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  unit?: "day" | "week" | "month" | "year";
  weekdays: number[];
  monthDays: number[];
  startAt: string;
  timezone: string;
  endAt?: string;
  maxOccurrences?: number;
};

type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};
type ValidationOptions = { now?: Date; requireFuture?: boolean };
export class TaskRecurrenceError extends Error {
  constructor(
    public readonly code: "TASK_RECURRENCE_INVALID" | "TASK_RECURRENCE_SEARCH_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "TaskRecurrenceError";
  }
}
function invalid(message: string): never {
  throw new TaskRecurrenceError("TASK_RECURRENCE_INVALID", message);
}
function instant(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
    invalid("Informe uma data ISO UTC válida.");
  const result = new Date(value);
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().replace(/\.000Z$/, "Z") !==
      value
        .replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, "0")}Z`)
        .replace(/\.000Z$/, "Z")
  )
    invalid("Informe uma data ISO UTC válida.");
  return result;
}
function formatter(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return invalid("Informe um fuso horário IANA válido.");
  }
}
export function validateTaskRecurrence(
  config: TaskRecurrenceConfig,
  options: ValidationOptions = {},
): void {
  if (!config || typeof config !== "object" || Array.isArray(config))
    invalid("Recorrência inválida.");
  if (!["once", "daily", "weekly", "monthly", "yearly", "custom"].includes(config.frequency))
    invalid("Frequência inválida.");
  if (!Number.isInteger(config.interval) || config.interval < 1 || config.interval > 10000)
    invalid("O intervalo deve estar entre 1 e 10000.");
  if (config.frequency === "once" && config.interval !== 1)
    invalid("Uma tarefa única exige intervalo 1.");
  if (
    config.frequency === "custom" &&
    !["day", "week", "month", "year"].includes(config.unit ?? "")
  )
    invalid("Selecione a unidade do intervalo personalizado.");
  if (config.unit !== undefined && !["day", "week", "month", "year"].includes(config.unit))
    invalid("Unidade inválida.");
  for (const [values, min, max] of [
    [config.weekdays, 0, 6],
    [config.monthDays, 1, 31],
  ] as const) {
    if (
      !Array.isArray(values) ||
      values.some((value) => !Number.isInteger(value) || value < min || value > max) ||
      new Set(values).size !== values.length
    )
      invalid("Dias da recorrência inválidos ou repetidos.");
  }
  if (typeof config.timezone !== "string" || !config.timezone.trim())
    invalid("Informe o fuso horário.");
  formatter(config.timezone);
  const start = instant(config.startAt);
  if (config.endAt !== undefined && instant(config.endAt) < start)
    invalid("O término não pode anteceder o início.");
  if (
    config.maxOccurrences !== undefined &&
    (!Number.isInteger(config.maxOccurrences) ||
      config.maxOccurrences < 1 ||
      config.maxOccurrences > 1000000)
  )
    invalid("O número de ocorrências deve estar entre 1 e 1000000.");
  if (options.now !== undefined && !Number.isFinite(options.now.getTime()))
    invalid("Relógio inválido.");
  if ((options.requireFuture || options.now !== undefined) && start <= (options.now ?? new Date()))
    invalid("A primeira execução deve estar no futuro.");
}
function civilAt(date: Date, format: Intl.DateTimeFormat): Civil {
  const parts = Object.fromEntries(
    format.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: date.getUTCMilliseconds(),
  };
}
function epoch(civil: Civil) {
  const date = new Date(0);
  date.setUTCFullYear(civil.year, civil.month - 1, civil.day);
  date.setUTCHours(civil.hour, civil.minute, civil.second, civil.millisecond);
  return date.getTime();
}
function sameCivil(a: Civil, b: Civil) {
  return Object.keys(a).every((key) => a[key as keyof Civil] === b[key as keyof Civil]);
}
/** Resolve real instants rather than assuming a fixed UTC offset. Gaps are skipped; folds choose the first instant. */
function resolveCivil(civil: Civil, format: Intl.DateTimeFormat): Date | null {
  const naive = epoch(civil);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = new Date(naive + hours * 3600000);
    offsets.add(epoch(civilAt(probe, format)) - probe.getTime());
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((date) => sameCivil(civilAt(date, format), civil));
  return matches.length ? new Date(Math.min(...matches.map((date) => date.getTime()))) : null;
}
function calendarDate(base: Civil, dayOffset: number): Civil {
  const date = new Date(epoch({ ...base, hour: 12, minute: 0, second: 0, millisecond: 0 }));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return {
    ...base,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
function validDay(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}
export function nextTaskOccurrences(
  config: TaskRecurrenceConfig,
  options: { after?: Date; limit?: number; now?: Date } = {},
): string[] {
  validateTaskRecurrence(config, { now: options.now });
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    invalid("O limite de prévia deve estar entre 1 e 10.");
  if (options.after !== undefined && !Number.isFinite(options.after.getTime()))
    invalid("Data de referência inválida.");
  const start = instant(config.startAt),
    end = config.endAt ? instant(config.endAt) : null;
  const format = formatter(config.timezone),
    base = civilAt(start, format);
  const unit =
    config.frequency === "custom"
      ? config.unit!
      : ({ daily: "day", weekly: "week", monthly: "month", yearly: "year", once: "once" } as const)[
          config.frequency
        ];
  const weekdays = config.weekdays.length
    ? [...config.weekdays].sort((a, b) => a - b)
    : [new Date(epoch(base)).getUTCDay()];
  const monthDays = config.monthDays.length
    ? [...config.monthDays].sort((a, b) => a - b)
    : [base.day];
  const output: string[] = [];
  let occurred = 0;
  for (let period = 0; period < 10000; period++) {
    let candidates: Civil[];
    if (unit === "once") candidates = period === 0 ? [base] : [];
    else if (unit === "day") candidates = [calendarDate(base, period * config.interval)];
    else if (unit === "week")
      candidates = weekdays.map((day) =>
        calendarDate(base, period * config.interval * 7 - new Date(epoch(base)).getUTCDay() + day),
      );
    else if (unit === "month") {
      const monthIndex = base.year * 12 + base.month - 1 + period * config.interval;
      const year = Math.floor(monthIndex / 12),
        month = (monthIndex % 12) + 1;
      candidates = monthDays
        .filter((day) => validDay(year, month, day))
        .map((day) => ({ ...base, year, month, day }));
    } else {
      const year = base.year + period * config.interval;
      candidates = validDay(year, base.month, base.day) ? [{ ...base, year }] : [];
    }
    if (unit === "once" && period > 0) return output;
    for (const candidate of candidates) {
      if (candidate.year > 9999 || !Number.isFinite(epoch(candidate))) return output;
      const date =
        unit === "once" || sameCivil(candidate, base) ? start : resolveCivil(candidate, format);
      if (!date || date < start) continue;
      if (end && date > end) return output;
      occurred++;
      if (options.after === undefined || date > options.after) output.push(date.toISOString());
      if (
        output.length >= limit ||
        (config.maxOccurrences !== undefined && occurred >= config.maxOccurrences)
      )
        return output;
    }
  }
  throw new TaskRecurrenceError(
    "TASK_RECURRENCE_SEARCH_LIMIT",
    "A recorrência excede o limite seguro de busca.",
  );
}
