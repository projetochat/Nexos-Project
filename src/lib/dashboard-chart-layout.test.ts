import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CHART_MARGIN,
  DASHBOARD_CHART_TEXT_COLOR,
  dashboardCategoryAxisLayout,
  dashboardColumnAxisLayout,
  DESKTOP_MESSAGE_HOUR_TICKS,
  messageHourTicks,
  messageTrafficSummary,
  MOBILE_MESSAGE_HOUR_TICKS,
  formatDashboardAxisLabelToWidth,
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

  it("reserves more category-axis space for long labels without hiding the beginning", () => {
    const compact = dashboardCategoryAxisLayout(["Cliente com um nome muito extenso"], 320);
    const desktop = dashboardCategoryAxisLayout(["Cliente com um nome muito extenso"], 900);

    expect(compact.maxLabelWidth).toBeGreaterThanOrEqual(58);
    expect(desktop.width).toBeGreaterThan(compact.width);
    expect(desktop.width).toBeLessThanOrEqual(202);
  });

  it("does not reserve a wide category axis for a single short bar label", () => {
    const layout = dashboardCategoryAxisLayout(["DIPS"], 370);

    expect(layout.width).toBeGreaterThanOrEqual(40);
    expect(layout.width).toBeLessThan(60);
    expect(formatDashboardAxisLabelToWidth("DIPS", layout.maxLabelWidth)).toBe("DIPS");
  });

  it("keeps complete column labels whenever their measured slot has room", () => {
    const layout = dashboardColumnAxisLayout(["VOCICAL", "FLOWID"], 640);

    expect(layout.angle).toBe(0);
    expect(formatDashboardAxisLabelToWidth("VOCICAL", layout.maxLabelWidth)).toBe("VOCICAL");
  });

  it("adapts column labels to width and category count while preserving the prefix", () => {
    const label = "GV/ROBRACON SINOP 10/60";
    const spacious = dashboardColumnAxisLayout([label, "VOCICAL"], 900);
    const crowded = dashboardColumnAxisLayout(
      Array.from({ length: 10 }, () => label),
      320,
    );

    expect(spacious.maxLabelWidth).toBeGreaterThan(crowded.maxLabelWidth);
    expect(crowded.angle).toBe(-35);
    expect(formatDashboardAxisLabelToWidth(label, crowded.maxLabelWidth)).toMatch(/^GV\/.+\.\.\.$/);
  });
});
