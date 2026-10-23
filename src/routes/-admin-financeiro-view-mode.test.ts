import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.financeiro.tsx", import.meta.url), "utf8");

describe("visualização card/lista do Financeiro Platform", () => {
  it("mantém cards obrigatórios no mobile e oferece os dois modos no desktop", () => {
    expect(source).toContain(
      'const [viewMode, setViewMode] = React.useState<"cards" | "list">("list")',
    );
    expect(source).toContain('if (isMobile) {\n      setViewMode("cards");\n      return;');
    expect(source).toContain('className="mt-3 hidden justify-end gap-1 md:flex"');
    expect(source).toContain('aria-label="Visualização das faturas"');
    expect(source).toContain('aria-label="Visualizar faturas em cards"');
    expect(source).toContain('aria-label="Visualizar faturas em lista"');
    expect(source).toContain("data-platform-card-shell");
    expect(source).toContain('? "mt-4 space-y-3"');
    expect(source).toContain('className={viewMode === "list" ? "mt-4" : "hidden"}');
    expect(source).toContain("sm:grid-cols-2 xl:grid-cols-3");
  });

  it("remove os checkboxes dos cards e da tabela sem alterar as ações", () => {
    expect(source).not.toContain("Selecionar todas as faturas visíveis");
    expect(source).not.toContain("toggleAllVisible");
    expect(source).not.toContain("selectedIds");
    expect(source.match(/<InvoiceActions/g)).toHaveLength(2);
    expect(source).not.toContain("aria-label={`Selecionar fatura ${row.number}`}");

    const tableStart = source.indexOf("data-platform-desktop-table");
    const tableEnd = source.indexOf("<InvoiceForm", tableStart);
    const tableSource = source.slice(tableStart, tableEnd);
    expect(tableSource).not.toContain('type="checkbox"');
    expect(tableSource).not.toContain("Selecionar todas as faturas visíveis");
  });

  it("apresenta o vencimento no padrão dd/mm/aaaa sem alterar o valor do formulário", () => {
    expect(source.match(/formatInvoiceDueDate\(row\.dueAt\)/g)).toHaveLength(2);
    expect(source).toContain("formatInvoiceDueDate(invoice.dueAt)");
    expect(source).toContain("value={dueAt} readOnly={false} onChange={setDueAt}");
    expect(source).toContain("dueAt: new Date(`${dueAt}T12:00:00`).toISOString()");
    expect(source).toContain("return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`");
  });

  it("padroniza a grade sem balão externo e mantém o rodapé separado", () => {
    expect(source).toContain('<thead className="bg-surface-2">');
    expect(source).toContain("<GridPaginationFooter");
    expect(source).toContain("visible={pagedRows.length}");
    expect(source).toContain("total={filtered.length}");
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
    expect(source.match(/pagedRows\.map/g)).toHaveLength(2);
    expect(source).toContain('className="overflow-hidden rounded-xl border border-border"');
    expect(source).not.toContain("md:bg-card md:shadow-card");
    expect(source).toContain('<col className="w-[13%]" />');
    expect(source).toContain('<col className="w-[12%]" />');
    expect(source.match(/<col className="w-\[/g)).toHaveLength(9);
    expect(source).not.toContain("Possui Cupom");
    expect(source).not.toContain('row.discountCents > 0 ? "Sim" : "Não"');
    expect(source).toContain('className="truncate px-2 py-3 text-muted-foreground"');
    expect(source).toContain('className="whitespace-nowrap px-2 py-3"');
    expect(source).toContain(
      ': "mt-3 flex min-w-max justify-end gap-1.5 md:mt-0 md:justify-center"',
    );
    expect(source).toContain("flex h-9 w-9 shrink-0 items-center justify-center");
  });

  it("alinha as ações dos cards à direita sem alterar a tabela", () => {
    expect(source).toContain('placement="card"');
    expect(source).toContain('? "mt-3 flex justify-end gap-1.5"');
    expect(source).toContain(
      ': "mt-3 flex min-w-max justify-end gap-1.5 md:mt-0 md:justify-center"',
    );
  });
});
