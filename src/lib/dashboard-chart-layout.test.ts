import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CHART_MARGIN,
  DASHBOARD_CHART_TEXT_COLOR,
  DESKTOP_MESSAGE_HOUR_TICKS,
  messageHourTicks,
  messageTrafficSummary,
  MOBILE_MESSAGE_HOUR_TICKS,
} from "./dashboard-chart-layout";

describe("dashboard chart layout", () => {
  it("uses the theme foreground for readable labels in light and dark modes", () => {
    expect(DASHBOARD_CHART_TEXT_COLOR).toBe("var(--foreground)");
  });

  it("keeps a non-negative left margin so axis labels remain visible", () => {
    expect(DASHBOARD_CHART_MARGIN).toEqual({ top: 4, right: 4, bottom: 0, left: 0 });
  });

  it("shows every hour from 00h through 23h on desktop", () => {
    expect(DESKTOP_MESSAGE_HOUR_TICKS).toHaveLength(24);
    expect(messageHourTicks(false)).toEqual(
      Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}h`),
    );
  });

  it("shows every hour from 00h through 23h on mobile", () => {
    expect(MOBILE_MESSAGE_HOUR_TICKS).toHaveLength(24);
    expect(messageHourTicks(true)).toEqual(DESKTOP_MESSAGE_HOUR_TICKS);
  });

  it("uses the unique period contact total instead of adding hourly duplicates", () => {
    expect(
      messageTrafficSummary(
        [
          { recebidas: 8, enviadas: 2, total: 10 },
          { recebidas: 4, enviadas: 1, total: 5 },
        ],
        1,
      ),
    ).toEqual({ recebidas: 12, enviadas: 3, total: 15, contatos: 1 });
  });
});
