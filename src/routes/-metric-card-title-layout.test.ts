import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const platformDashboard = readFileSync(new URL("./admin.index.tsx", import.meta.url), "utf8");
const platformFinance = readFileSync(new URL("./admin.financeiro.tsx", import.meta.url), "utf8");
const platformSubscriptions = readFileSync(
  new URL("./admin.assinaturas.tsx", import.meta.url),
  "utf8",
);
const bi = readFileSync(new URL("./bi.tsx", import.meta.url), "utf8");
const queues = readFileSync(new URL("./filas.tsx", import.meta.url), "utf8");

describe("Layout dos cards de indicadores", () => {
  it.each([
    ["Dashboard Platform", platformDashboard, "flex min-h-24 flex-col"],
    ["Financeiro Platform", platformFinance, "flex min-h-28 flex-col"],
    ["Assinaturas Platform", platformSubscriptions, "flex min-h-24 flex-col"],
    ["BI", bi, "flex min-h-24 flex-col"],
    ["Filas", queues, "flex min-h-20 flex-col"],
  ])("reserva o título e alinha valor e ícone em %s", (_name, source, cardClass) => {
    expect(source).toContain(cardClass);
    expect(source).toContain("mt-auto flex items-center justify-between");
  });

  it("usa cores semânticas nos ícones do Financeiro Platform", () => {
    for (const tone of ["primary", "info", "success", "warning", "destructive"]) {
      expect(platformFinance).toContain(`tone="${tone}"`);
    }
    expect(platformFinance).toContain("bg-primary/10 text-primary");
    expect(platformFinance).toContain("bg-success/15 text-success");
    expect(platformFinance).toContain("bg-destructive/10 text-destructive");
  });
});
