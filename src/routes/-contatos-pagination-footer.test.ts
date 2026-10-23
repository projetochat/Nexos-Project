import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");
const footerStart = source.lastIndexOf("data-contacts-list-footer");
const footer = source.slice(footerStart, source.indexOf("</Card>", footerStart));

describe("rodapé da grade de contatos", () => {
  it("mantém seletor e navegação compactos sem alterar a paginação", () => {
    expect(footer).toContain("px-3 py-1.5 text-xs");
    expect(footer).not.toContain("sm:py-3");
    expect(footer).toContain('className="w-16 shrink-0"');
    expect(footer).toContain(
      'className="!h-6 !min-h-6 !w-full !rounded-md !px-2 !py-0 !pr-6 !text-xs"',
    );
    expect(footer.match(/!h-7 !min-h-7 !w-7 !p-0/g)).toHaveLength(2);
    expect(footer).toContain("PAGE_SIZE_OPTIONS.map");
    expect(footer).toContain("setPageSize(Number(event.target.value))");
  });

  it("mantém o rodapé separado do balão dos cards", () => {
    expect(footer).toContain('viewMode === "cards"');
    expect(footer).toContain('"mt-3 overflow-hidden rounded-xl border border-border"');
    expect(source).toContain('className="hidden gap-3 md:grid md:grid-cols-3"');
    expect(source).not.toContain('className="hidden gap-3 p-4 md:grid md:grid-cols-3"');
  });

  it("oferece até 5.000 registros sem manter a opção antiga de 10.000", () => {
    expect(source).toContain("const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000, 5000] as const;");
    expect(source).not.toContain(
      "const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000, 10000] as const;",
    );
  });
});
