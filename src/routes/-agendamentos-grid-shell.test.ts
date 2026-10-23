import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./agendamentos.tsx", import.meta.url), "utf8");

describe("Agendamentos grid shell", () => {
  it("usa o cabeçalho padronizado dentro de um card sem padding", () => {
    expect(source).toContain('aria-label="Visualização dos agendamentos"');
    expect(source).toContain('aria-label="Visualizar agendamentos em cards"');
    expect(source).toContain('aria-label="Visualizar agendamentos em lista"');
    expect(source).toContain('viewMode === "list" ? "hidden overflow-hidden md:block" : "hidden"');
    expect(source).toContain(
      '<thead className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-widest text-muted-foreground">',
    );
  });

  it("permite alternar entre cards e lista no desktop e mantém cards no mobile", () => {
    expect(source).toContain("useIsMobile");
    expect(source).toContain('setViewMode("cards")');
    expect(source).toContain('<LayoutGrid className="h-4 w-4" />');
    expect(source).toContain('<List className="h-4 w-4" />');
    expect(source).toContain('className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"');
  });

  it("usa rodapé independente e compacto com contagem, lista e paginação", () => {
    expect(source).toContain("data-schedules-grid-footer");
    expect(source).toContain(
      'className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4"',
    );
    expect(source).toContain("{num(shown)} de {num(total)}");
    expect(source).toContain(
      'className="!h-6 !min-h-6 !w-16 !rounded-md !px-2 !py-0 !pr-6 text-xs"',
    );
    expect(source.match(/className="!h-7 !min-h-7 !w-7 !p-0"/g)).toHaveLength(2);
    expect(source).toContain('<div className="overflow-hidden rounded-xl border border-border">');
  });

  it("omite os detalhes técnicos do registro no aviso de exclusão", () => {
    expect(source).toContain("showRecordDetails={false}");
  });
});
