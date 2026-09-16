import { describe, expect, it } from "vitest";
import { workShiftError } from "@/lib/work-schedule";

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
});
