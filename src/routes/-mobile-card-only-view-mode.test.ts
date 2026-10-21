import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "admin.empresas.tsx",
  "admin.assinaturas.tsx",
  "admin.financeiro.tsx",
  "admin.tenants.tsx",
  "chamados.tsx",
  "agendamentos.tsx",
  "clientes.tsx",
  "contatos.tsx",
].map((file) => ({ file, source: readFileSync(new URL(`./${file}`, import.meta.url), "utf8") }));

describe("visualizações responsivas em cards", () => {
  it.each(routes)("não mantém a lista ativa ao entrar no mobile em $file", ({ source }) => {
    expect(source).toContain("useIsMobile");
    expect(source).toMatch(/if \(isMobile\)(?: \{| )/);
    expect(source).toContain('setViewMode("cards")');
  });

  it.each(routes)("não exibe o seletor card/lista no mobile em $file", ({ source }) => {
    const visualizationLabel = source.indexOf('aria-label="Visualização');
    expect(visualizationLabel).toBeGreaterThan(-1);
    const selectorStart = source.lastIndexOf("<div", visualizationLabel);
    const selectorOpening = source.slice(selectorStart, visualizationLabel);
    expect(selectorOpening).toContain("hidden");
    expect(selectorOpening).toContain("md:flex");
  });

  it("não exibe o subtítulo descritivo do dashboard", () => {
    const dashboard = readFileSync(new URL("./admin.index.tsx", import.meta.url), "utf8");
    expect(dashboard).not.toContain(
      'subtitle="Métricas reais da API Trixus. Cobrança manual, sem gateway integrado."',
    );
    expect(dashboard).not.toContain("subtitleClassName=");
  });
});
