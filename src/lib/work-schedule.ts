export const WEEK_DAYS = [
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
  "Domingo",
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type WorkPeriod = { id: string; start: string; end: string };
export type WorkDaySchedule = { active: boolean; periods: WorkPeriod[] };
export type WorkSchedule = {
  noSchedule: boolean;
  days: Record<WeekDay, WorkDaySchedule>;
};

type LegacyShift = { active?: boolean; start?: string; end?: string };
type LegacyDay = Record<string, LegacyShift>;

function periodId() {
  return `period-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createWorkPeriod(start = "08:00", end = "18:00"): WorkPeriod {
  return { id: periodId(), start, end };
}

export function normalizeWorkSchedule(value: unknown): WorkSchedule {
  const source = (value && typeof value === "object" ? value : {}) as {
    noSchedule?: unknown;
    days?: Partial<Record<WeekDay, unknown>>;
  };
  const days = {} as WorkSchedule["days"];

  for (const day of WEEK_DAYS) {
    const raw = source.days?.[day] as
      | { active?: unknown; periods?: unknown }
      | LegacyDay
      | undefined;
    const weekday = !["Sabado", "Domingo"].includes(day);
    const rawPeriods = raw && "periods" in raw && Array.isArray(raw.periods) ? raw.periods : null;

    if (rawPeriods) {
      const periods = rawPeriods
        .filter((period): period is Record<string, unknown> => !!period && typeof period === "object")
        .map((period) => ({
          id: typeof period.id === "string" && period.id ? period.id : periodId(),
          start: typeof period.start === "string" ? period.start : "",
          end: typeof period.end === "string" ? period.end : "",
        }));
      days[day] = {
        active: raw && typeof raw.active === "boolean" ? raw.active : weekday,
        periods: periods.length ? periods : [createWorkPeriod()],
      };
      continue;
    }

    const legacy = raw && typeof raw === "object" ? (raw as LegacyDay) : {};
    const periods = Object.values(legacy)
      .filter((shift) => shift?.active)
      .map((shift) => createWorkPeriod(shift.start || "08:00", shift.end || "18:00"));
    days[day] = {
      active: raw ? periods.length > 0 : weekday,
      periods: periods.length ? periods : [createWorkPeriod()],
    };
  }

  return { noSchedule: Boolean(source.noSchedule), days };
}

export function workPeriodError(period: Pick<WorkPeriod, "start" | "end">) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(period.start) || !time.test(period.end)) return "Informe horários válidos (HH:mm).";
  if (period.end <= period.start) return "Hora final deve ser maior que a inicial.";
  return "";
}

export function workShiftError(
  shift: Pick<WorkPeriod, "start" | "end"> & { active?: boolean },
) {
  return workPeriodError(shift);
}

export function workScheduleError(schedule: WorkSchedule) {
  if (schedule.noSchedule) return "";
  for (const day of WEEK_DAYS) {
    const item = schedule.days[day];
    if (!item.active) continue;
    for (const period of item.periods) {
      const error = workPeriodError(period);
      if (error) return `${day}: ${error}`;
    }
  }
  return "";
}
