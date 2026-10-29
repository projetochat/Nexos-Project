import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CHART_MARGIN,
  DASHBOARD_CHART_TEXT_COLOR,
  dashboardCategoryAxisLayout,
  dashboardBarAxisLabelLines,
  dashboardColumnAxisLayout,
  dashboardColumnAxisLabelLines,
  dashboardLabelWidth,
  dashboardColumnLabelLines,
  dashboardColumnLabelMetrics,
  DESKTOP_MESSAGE_HOUR_TICKS,
  messageHourTicks,
  messageTrafficSummary,
  MOBILE_MESSAGE_HOUR_TICKS,
  formatDashboardAxisLabelToWidth,
} from "./dashboard-chart-layout";

describe("horizontal bar wrapping", () => {
  it("shows complete words in two lines only when the row has enough room", () => {
    expect(dashboardBarAxisLabelLines("Em Atendimento", 72, 50)).toEqual(["Em", "Atendimento"]);
    const dense = dashboardBarAxisLabelLines("Em Atendimento", 72, 12);
    expect(dense).toHaveLength(1);
    expect(dense[0]).toContain("...");
  });
  it("does not apply the column three-word limit to bar names", () => {
    expect(dashboardBarAxisLabelLines("Um Nome Com Quatro Palavras", 90, 50).join(" ")).toBe(
      "Um Nome Com Quatro Palavras",
    );
  });
});

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

  it("uses horizontal labels for up to four categories, even if their names are long", () => {
    for (const count of [2, 4])
      for (const width of [350, 1200]) {
        const layout = dashboardColumnAxisLayout(Array(count).fill("AGUARDANDO RETORNO"), width);
        expect(layout.angle).toBe(0);
        expect(layout.textAnchor).toBe("middle");
        expect(layout.minWidth).toBe(width);
        expect(layout.fontSize).toBeGreaterThanOrEqual(9);
      }
  });
  it("rotates dense columns only when names need the space", () => {
    expect(dashboardColumnAxisLayout(Array(12).fill("AGUARDANDO RETORNO"), 350).angle).toBe(-45);
    expect(dashboardColumnAxisLayout(Array(12).fill("A"), 350).angle).toBe(0);
    expect(dashboardColumnAxisLayout(Array(7).fill("AGUARDANDO RETORNO"), 1200).angle).toBe(0);
  });
  it("preserves word grouping and complete tooltip labels independently of density", () => {
    expect(dashboardColumnLabelLines("AGUARDANDO RETORNO DO CLIENTE").join(" ")).toBe(
      "AGUARDANDO RETORNO DO",
    );
    expect(dashboardColumnLabelLines("AGUARDANDO DO FIM")).toEqual(["AGUARDANDO", "DO FIM"]);
    expect(dashboardColumnLabelLines("DO FIM AGUARDANDO")).toEqual(["DO FIM", "AGUARDANDO"]);
    expect(dashboardColumnLabelLines("DO AGUARDANDO FIM CLIENTE")).toEqual(["DO", "AGUARDANDO"]);
  });
  it("abbreviates only when required by available width and keeps a legible font", () => {
    const name = "PALAVRAINDIVISIVEL".repeat(20);
    for (const count of [2, 4, 7, 12])
      for (const width of [350, 1200]) {
        const layout = dashboardColumnAxisLayout(Array(count).fill(name), width);
        const lines = dashboardColumnAxisLabelLines(name, layout);
        expect(lines.join(" ")).not.toBe(name);
        expect(layout.fontSize).toBeGreaterThanOrEqual(9);
        for (const line of lines)
          expect((dashboardLabelWidth(line) * layout.fontSize) / 10).toBeLessThanOrEqual(
            layout.maxLabelWidth + 0.1,
          );
        expect(layout.minWidth).toBe(width);
      }
  });
  it("fits ordinary labels within the available width", () => {
    for (const count of [2, 4, 7, 12])
      for (const width of [350, 1200]) {
        const labels = Array.from({ length: count }, (_, i) => `A${i}`);
        const layout = dashboardColumnAxisLayout(labels, width);
        const slot = (width - 36 - layout.marginLeft - layout.marginRight) / count;
        expect(layout.minWidth).toBe(width);
        expect(layout.slotWidth).toBeCloseTo(slot);
        labels.forEach((label, index) => {
          const tickX = layout.marginLeft + 36 + (index + 0.5) * slot;
          const halfWidth = dashboardColumnLabelMetrics(label).width / 2;
          expect(tickX - halfWidth).toBeGreaterThanOrEqual(4);
          expect(tickX + halfWidth).toBeLessThanOrEqual(width - 4);
        });
      }
  });
});
