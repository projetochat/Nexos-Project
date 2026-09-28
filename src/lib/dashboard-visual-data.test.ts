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
});
