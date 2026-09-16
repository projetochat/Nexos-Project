export const WEEK_DAYS = [
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
  "Domingo",
] as const;
export const SHIFT_LABELS = {
  morning: "Turno manha",
  afternoon: "Turno tarde",
  night: "Turno noite",
} as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type ShiftKey = keyof typeof SHIFT_LABELS;
export type WorkShift = { active: boolean; start: string; end: string };
export type WorkSchedule = {
  noSchedule: boolean;
  days: Record<WeekDay, Record<ShiftKey, WorkShift>>;
};

export function workShiftError(shift: WorkShift) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(shift.start) || !time.test(shift.end)) return "Informe horários válidos (HH:mm).";
  if (shift.end <= shift.start) return "Hora final deve ser maior que a inicial.";
  return "";
}

export function workScheduleError(schedule: WorkSchedule) {
  if (schedule.noSchedule) return "";
  for (const day of WEEK_DAYS) {
    for (const shift of Object.keys(SHIFT_LABELS) as ShiftKey[]) {
      const error = schedule.days[day][shift].active
        ? workShiftError(schedule.days[day][shift])
        : "";
      if (error) return `${SHIFT_LABELS[shift]} de ${day}: ${error}`;
    }
  }
  return "";
}
