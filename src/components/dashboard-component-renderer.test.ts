import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./dashboard-component-renderer.tsx", import.meta.url), "utf8");

describe("DashboardComponentRenderer height contract", () => {
  it("uses a numeric height for compact column and bar previews", () => {
    expect(source.match(/height=\{compact \? height : "100%"\}/g)).toHaveLength(2);
  });

  it("renders values inside pie slices and leaves values out of the legend", () => {
    expect(source).toContain("<DashboardPieSliceLabel");
    expect(source).toContain("if (percent < 0.055) return null");
    expect(source).not.toContain("dashboardPieLegendValue(item, valueMode)");
  });

  it("always renders column and bar values outside their shapes", () => {
    expect(source.match(/<DashboardBarValueLabel/g)).toHaveLength(2);
    expect(source).toContain('orientation="column"');
    expect(source).toContain('orientation="bar"');
    expect(source).toContain('fill="var(--foreground)"');
    expect(source).toContain("numericY - 7");
    expect(source).toContain("numericX + numericWidth + 6");
    expect(source).not.toContain("hasRoom");
  });

  it("uses the exact horizontal-bar maximum to avoid unused plot space", () => {
    expect(source).toContain('domain={[0, (dataMax: number) => Math.max(1, dataMax)]}');
  });

  it("compacts both horizontal-bar side reservations without clipping values", () => {
    expect(source).toContain("right: barValueMarginRight");
    expect(source).toContain("left: 0");
    expect(source).toContain("width={Math.min(categoryAxisLayout.width, 80)}");
    expect(source).toContain("Math.min(72, Math.max(32, longestValue * 7 + 12))");
  });

  it("enlarges and centers generic BI visualizations when maximized", () => {
    expect(source).toContain("useDashboardMaximized()");
    expect(source).toContain('maximized ? "flex items-center justify-center" : ""');
    expect(source).toContain("h-[clamp(22rem,58dvh,42rem)]");
    expect(source).toContain('height={maximized ? "70%" : height}');
    expect(source).toContain('height={maximized ? "100%" : height}');
    expect(source).toContain("max-h-[72dvh]");
    expect(source).toContain("centered={maximized}");
    expect(source).toContain("flex-wrap justify-center");
  });
});
