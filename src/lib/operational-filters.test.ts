import { afterEach, describe, expect, it, vi } from "vitest";
import { datesForOperationalPeriod } from "./operational-filters";

afterEach(() => vi.useRealTimers());

describe("dashboard calendar periods", () => {
  it("starts this week on Sunday and ends last week on Saturday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 12));
    expect(datesForOperationalPeriod("week")).toEqual({ start: "2026-09-13", end: "2026-09-15" });
    expect(datesForOperationalPeriod("previous_week")).toEqual({
      start: "2026-09-06",
      end: "2026-09-12",
    });
    expect(datesForOperationalPeriod("previous_year")).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
    });
  });

  it("keeps Sunday in the new week across a year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 4, 12));
    expect(datesForOperationalPeriod("week")).toEqual({ start: "2026-01-04", end: "2026-01-04" });
    expect(datesForOperationalPeriod("previous_week")).toEqual({
      start: "2025-12-28",
      end: "2026-01-03",
    });
  });
});
