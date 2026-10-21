import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "admin.empresas.tsx",
  "admin.assinaturas.tsx",
  "admin.financeiro.tsx",
  "admin.tenants.tsx",
  "contatos.tsx",
  "clientes.tsx",
  "chamados.tsx",
  "agendamentos.tsx",
  "atendentes.tsx",
] as const;

describe("cor dos rodapés integrados de grade", () => {
  const sharedFooterSource = readFileSync(
    new URL("../components/grid-pagination-footer.tsx", import.meta.url),
    "utf8",
  );

  for (const routeFile of routeFiles) {
    it(`usa o fundo do cabeçalho em ${routeFile}`, () => {
      const source = readFileSync(new URL(`./${routeFile}`, import.meta.url), "utf8");

      const effectiveSource = source.includes("GridPaginationFooter")
        ? `${source}\n${sharedFooterSource}`
        : source;

      expect(effectiveSource).toContain("border-t border-border bg-surface-2 px-3 py-1.5");
      expect(effectiveSource).not.toContain("border-t border-border bg-surface-1 px-3 py-1.5");
    });
  }
});
