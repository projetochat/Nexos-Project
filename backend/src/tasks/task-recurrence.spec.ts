import { describe, expect, it } from "vitest";
import {
  nextTaskOccurrences,
  validateTaskRecurrence,
  type TaskRecurrenceConfig,
} from "./task-recurrence";
const base: TaskRecurrenceConfig = {
  frequency: "daily",
  interval: 1,
  weekdays: [],
  monthDays: [],
  startAt: "2026-10-28T11:00:00.000Z",
  timezone: "America/Sao_Paulo",
};
describe("task recurrence civil calendar", () => {
  it("keeps a one-time instant and filters after exclusively without changing input", () => {
    const config = { ...base, frequency: "once" as const };
    expect(nextTaskOccurrences(config)).toEqual([base.startAt]);
    expect(nextTaskOccurrences(config, { after: new Date(base.startAt) })).toEqual([]);
    expect(config).toEqual({ ...base, frequency: "once" });
  });
  it("returns ten by default and respects requested limit", () => {
    expect(nextTaskOccurrences(base)).toHaveLength(10);
    expect(nextTaskOccurrences(base, { limit: 2 })).toEqual([
      "2026-10-28T11:00:00.000Z",
      "2026-10-29T11:00:00.000Z",
    ]);
  });
  it("preserves local hour across DST rather than adding 24 hours", () => {
    expect(
      nextTaskOccurrences(
        { ...base, startAt: "2026-03-07T13:00:00Z", timezone: "America/New_York" },
        { limit: 3 },
      ),
    ).toEqual(["2026-03-07T13:00:00.000Z", "2026-03-08T12:00:00.000Z", "2026-03-09T12:00:00.000Z"]);
  });
  it("skips a nonexistent local time during the DST gap", () => {
    expect(
      nextTaskOccurrences(
        { ...base, startAt: "2026-03-07T07:30:00Z", timezone: "America/New_York" },
        { limit: 2 },
      ),
    ).toEqual(["2026-03-07T07:30:00.000Z", "2026-03-09T06:30:00.000Z"]);
  });
  it("chooses the earlier fold instant but preserves an explicit later-fold start", () => {
    expect(
      nextTaskOccurrences(
        { ...base, startAt: "2026-10-31T05:30:00Z", timezone: "America/New_York" },
        { limit: 2 },
      ),
    ).toEqual(["2026-10-31T05:30:00.000Z", "2026-11-01T05:30:00.000Z"]);
    expect(
      nextTaskOccurrences(
        { ...base, startAt: "2026-11-01T06:30:00Z", timezone: "America/New_York" },
        { limit: 2 },
      ),
    ).toEqual(["2026-11-01T06:30:00.000Z", "2026-11-02T06:30:00.000Z"]);
  });
  it("supports a timezone with a thirty-minute DST transition", () => {
    expect(
      nextTaskOccurrences(
        { ...base, startAt: "2026-10-02T22:00:00Z", timezone: "Australia/Lord_Howe" },
        { limit: 2 },
      ),
    ).toEqual(["2026-10-02T22:00:00.000Z", "2026-10-03T21:30:00.000Z"]);
  });
  it("uses start-week anchored Sunday weeks with multiple ordered days", () => {
    expect(
      nextTaskOccurrences(
        { ...base, frequency: "weekly", interval: 2, weekdays: [5, 1] },
        { limit: 4 },
      ),
    ).toEqual([
      "2026-10-30T11:00:00.000Z",
      "2026-11-09T11:00:00.000Z",
      "2026-11-13T11:00:00.000Z",
      "2026-11-23T11:00:00.000Z",
    ]);
  });
  it("skips invalid monthly days without drifting into the next month", () => {
    expect(
      nextTaskOccurrences(
        { ...base, frequency: "monthly", startAt: "2026-01-31T11:00:00Z" },
        { limit: 3 },
      ),
    ).toEqual(["2026-01-31T11:00:00.000Z", "2026-03-31T11:00:00.000Z", "2026-05-31T11:00:00.000Z"]);
    expect(
      nextTaskOccurrences({ ...base, frequency: "monthly", monthDays: [31, 1] }, { limit: 3 }),
    ).toEqual(["2026-10-31T11:00:00.000Z", "2026-11-01T11:00:00.000Z", "2026-12-01T11:00:00.000Z"]);
  });
  it("skips non-leap years including the century exception", () => {
    expect(
      nextTaskOccurrences(
        { ...base, frequency: "yearly", startAt: "2096-02-29T11:00:00Z" },
        { limit: 3 },
      ),
    ).toEqual(["2096-02-29T11:00:00.000Z", "2104-02-29T11:00:00.000Z", "2108-02-29T11:00:00.000Z"]);
  });
  it.each(["day", "week", "month", "year"] as const)(
    "supports a custom interval unit %s",
    (unit) => {
      const config = { ...base, frequency: "custom" as const, unit, interval: 2 };
      const dates = nextTaskOccurrences(config, { limit: 2 });
      expect(dates[0]).toBe(base.startAt);
      expect(new Date(dates[1]).getTime()).toBeGreaterThan(new Date(dates[0]).getTime());
    },
  );
  it("counts maxOccurrences globally before applying after and includes endAt", () => {
    expect(
      nextTaskOccurrences(
        { ...base, maxOccurrences: 2 },
        { after: new Date("2026-10-29T11:00:00Z") },
      ),
    ).toEqual([]);
    expect(nextTaskOccurrences({ ...base, endAt: "2026-10-29T11:00:00Z" })).toHaveLength(2);
  });
  it("requires a future first execution only when explicitly validating creation", () => {
    expect(() => validateTaskRecurrence(base, { now: new Date(base.startAt) })).toThrow("futuro");
    expect(() =>
      validateTaskRecurrence(base, { now: new Date("2026-10-28T10:59:59Z") }),
    ).not.toThrow();
    expect(() =>
      nextTaskOccurrences(base, { after: new Date("2026-10-30T00:00:00Z"), limit: 1 }),
    ).not.toThrow();
  });
  it.each([
    { interval: 0 },
    { interval: 1.5 },
    { frequency: "custom", unit: undefined },
    { weekdays: [1, 1] },
    { weekdays: [7] },
    { monthDays: [0] },
    { timezone: "invalid/timezone" },
    { startAt: "2026-02-30T11:00:00Z" },
    { endAt: "2026-10-27T11:00:00Z" },
    { maxOccurrences: 0 },
  ])("rejects malformed configuration %j", (patch) => {
    expect(() => validateTaskRecurrence({ ...base, ...patch } as TaskRecurrenceConfig)).toThrow();
  });
  it("bounds pathological searches rather than hanging", () => {
    expect(() =>
      nextTaskOccurrences(base, { after: new Date("9999-12-31T23:59:59Z"), limit: 1 }),
    ).toThrow("limite seguro");
  });
});
