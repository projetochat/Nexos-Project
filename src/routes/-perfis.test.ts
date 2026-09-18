import { describe, expect, it } from "vitest";
import { normalizeWorkSchedule, workScheduleError, workShiftError } from "@/lib/work-schedule";

describe("jornada de trabalho", () => {
  it("requires the end of an active shift to be later than its start", () => {
    expect(workShiftError({ active: true, start: "08:00", end: "18:00" })).toBe("");
    expect(workShiftError({ active: true, start: "18:00", end: "18:00" })).toContain(
      "maior que a inicial",
    );
    expect(workShiftError({ active: true, start: "19:00", end: "18:00" })).toContain(
      "maior que a inicial",
    );
  });

  it("converts legacy shift columns into dynamic periods", () => {
    const schedule = normalizeWorkSchedule({
      noSchedule: false,
      days: {
        Segunda: {
          morning: { active: true, start: "08:00", end: "12:00" },
          afternoon: { active: true, start: "13:00", end: "18:00" },
          night: { active: false, start: "19:00", end: "22:00" },
        },
      },
    });

    expect(schedule.days.Segunda.periods).toMatchObject([
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ]);
    expect(workScheduleError(schedule)).toBe("");
  });
});
