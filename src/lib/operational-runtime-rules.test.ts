import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("operational runtime rules", () => {
  it("keeps history rendering closed conversations only", () => {
    const history = source("src/routes/historico.tsx");
    expect(history).toContain('status: "fechada"');
    expect(history).not.toContain('value="aberta"');
    expect(history).not.toContain('value="em_andamento"');
    expect(history).not.toContain('value="aguardando"');
  });

  it("keeps reports on realtime invalidation without polling", () => {
    const reports = source("src/routes/relatorios.tsx");
    expect(reports).toContain("onRealtimeEvent");
    expect(reports).toContain('queryKey: ["operations", "reports"');
    expect(reports).not.toContain("refetchInterval");
  });

  it("exports attendance from the operations API result path", () => {
    const reports = source("src/routes/relatorios.tsx");
    expect(reports).toContain("operationsApi.report");
    expect(reports).toContain("operationsApi.exportAttendance");
  });

  it("does not ship the removed simulator route", () => {
    expect(existsSync(resolve(root, "src/routes/simulador.tsx"))).toBe(false);
  });

  it("keeps the ghost department out of operational screens", () => {
    const operationalSources = [
      source("src/routes/index.tsx"),
      source("src/routes/historico.tsx"),
      source("src/routes/relatorios.tsx"),
      source("src/routes/filas.tsx"),
    ].join("\n");
    expect(operationalSources).not.toMatch(/Departamento\s+Teste|["']Teste["']/i);
  });
});
