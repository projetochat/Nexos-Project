import { describe, expect, it } from "vitest";
import {
  dashboardPieLegendItems,
  dashboardPieLegendValue,
  normalizeDashboardData,
} from "@/lib/dashboard-visual-data";

describe("normalizeDashboardData", () => {
  it("preserves the source order for line charts", () => {
    const result = normalizeDashboardData(
      [
        { nome: "08h", total: 2 },
        { nome: "09h", total: 12 },
        { nome: "10h", total: 4 },
      ],
      "count",
      1,
      "line",
    );

    expect(result.map((item) => item.nome)).toEqual(["08h", "09h", "10h"]);
  });

  it("groups categories outside the visible limit instead of discarding their totals", () => {
    const result = normalizeDashboardData(
      Array.from({ length: 9 }, (_, index) => ({
        nome: `Categoria ${index + 1}`,
        total: 9 - index,
      })),
      "percentage",
      1,
      "donut",
    );

    expect(result).toHaveLength(7);
    expect(result.at(-1)).toMatchObject({ nome: "Outros", total: 6 });
    expect(result.reduce((total, item) => total + item.valor, 0)).toBe(100);
  });
});

describe("dashboardPieLegendItems", () => {
  it("shows labels with their percentages for pie and donut legends", () => {
    const result = dashboardPieLegendItems([
      { nome: "Site / Internet", total: 320, valor: 320, cor: "#2563eb" },
      { nome: "Instagram", total: 240, valor: 240, cor: "#7c3aed" },
      { nome: "Outros", total: 440, valor: 440, cor: "#64748b" },
    ]);

    expect(result.map(({ nome, percentageLabel }) => [nome, percentageLabel])).toEqual([
      ["Site / Internet", "32%"],
      ["Instagram", "24%"],
      ["Outros", "44%"],
    ]);
  });

  it("shows absolute totals in quantity mode and percentages only in percentage mode", () => {
    const [item] = dashboardPieLegendItems([
      { nome: "Site / Internet", total: 320, valor: 320, cor: "#2563eb" },
      { nome: "Instagram", total: 680, valor: 680, cor: "#7c3aed" },
    ]);

    expect(dashboardPieLegendValue(item, "count")).toBe("320");
    expect(dashboardPieLegendValue(item, "percentage")).toBe("32%");
  });
});
