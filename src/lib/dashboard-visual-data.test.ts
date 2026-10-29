import { describe, expect, it } from "vitest";
import { normalizeDashboardData } from "./dashboard-visual-data";

describe("normalizeDashboardData", () => {
  it("limits tables to seven rows without aggregating the remainder", () => {
    const data = Array.from({ length: 9 }, (_, index) => ({
      nome: `Item ${index + 1}`,
      total: 9 - index,
    }));

    const result = normalizeDashboardData(data, "count", 4, "table");

    expect(result).toHaveLength(7);
    expect(result.map((item) => item.nome)).toEqual(data.slice(0, 7).map((item) => item.nome));
    expect(result.some((item) => item.nome === "Outros")).toBe(false);
  });

  it("keeps recent activity in API order when requested", () => {
    const result = normalizeDashboardData(
      [
        { nome: "Mais recente", total: 1 },
        { nome: "Anterior", total: 1 },
      ],
      "count",
      4,
      "table",
      true,
    );

    expect(result.map((item) => item.nome)).toEqual(["Mais recente", "Anterior"]);
  });

  it("preserves every platform client without Top N or an Outros bucket", () => {
    const data = Array.from({ length: 25 }, (_, index) => ({
      nome: `Cliente ${index + 1}`,
      total: 25 - index,
    }));

    const result = normalizeDashboardData(data, "count", 2, "columns", false, true);

    expect(result).toHaveLength(25);
    expect(result.some((item) => item.nome === "Outros")).toBe(false);
  });
});

describe("shared column and bar capacity", () => {
  it.each(["columns", "bars"] as const)(
    "uses 5/15/25/all categories by card size for %s, preserving totals",
    (visualization) => {
      const data = Array.from({ length: 31 }, (_, index) => ({
        nome: `Item ${index}`,
        total: index + 1,
      }));
      for (const [columns, count] of [
        [1, 5],
        [2, 15],
        [3, 25],
        [4, 31],
      ] as const) {
        const visible = normalizeDashboardData(data, "count", columns, visualization);
        expect(visible).toHaveLength(count);
        expect(visible.reduce((sum, item) => sum + item.total, 0)).toBe(
          data.reduce((sum, item) => sum + item.total, 0),
        );
        expect(visible.some((item) => item.nome === "Outros")).toBe(columns !== 4);
      }
    },
  );
});
