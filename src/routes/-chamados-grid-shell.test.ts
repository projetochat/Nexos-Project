import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");

describe("Grade de Chamados", () => {
  it("usa o cabeçalho e o rodapé compactos do padrão de grades", () => {
    expect(source).toContain('<thead className="bg-surface-2">');
    expect(source).toContain(
      "text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
    );
    expect(source).toContain("<GridPaginationFooter");
    expect(source).toContain("visible={tickets.data.items.length}");
    expect(source).toContain("total={tickets.data.total}");
    expect(source).toContain('ariaLabelPrefix="chamados"');
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
  });

  it("pagina a consulta e integra o rodapé também aos cards", () => {
    expect(source).toContain("const [page, setPage] = React.useState(1)");
    expect(source).toContain("const [pageSize, setPageSize] = React.useState(25)");
    expect(source).toContain("tickets.data?.totalPages ?? page");
    expect(source).toContain("page,\n    pageSize,");
    expect(source).toContain('viewMode === "cards"');
    expect(source).toContain('className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"');
    expect(source).toContain('className="mt-3 overflow-hidden rounded-xl border border-border"');
    expect(source).not.toContain("Ordenar por");
    expect(source).not.toContain("text-muted-foreground md:hidden");
    expect(source).not.toContain("chamados encontrados");
  });

  it("usa olho e remove Departamento apenas da tabela desktop", () => {
    const listStart = source.indexOf('className={viewMode === "list"');
    const listEnd = source.indexOf("{paginationFooter}", listStart);
    const desktopList = source.slice(listStart, listEnd);

    expect(desktopList).toContain('<Eye className="h-4 w-4" />');
    expect(desktopList).not.toContain('<MoreHorizontal className="h-4 w-4" />');
    expect(desktopList).not.toContain(">Departamento</th>");
    expect(desktopList).not.toContain('ticket.department?.name ?? "Sem departamento"');
    expect(source.slice(0, listStart)).toContain('label="Departamento"');
  });

  it("exibe data e hora sem vírgula entre os valores", () => {
    expect(source).toContain('.replace(",", "")');
  });

  it("reserva espaço para o protocolo completo e compacta as demais colunas", () => {
    expect(source).toContain('<th className="w-32 px-3 py-3">ID</th>');
    expect(source).toContain('<th className="w-[260px] px-3 py-3">Título</th>');
    expect(source).toContain('<th className="w-16 px-3 py-3 text-center">Ações</th>');
    expect(source).toContain('<td className="whitespace-nowrap px-3 py-3 font-mono text-xs">');
    expect(source).toContain("max-w-[260px] truncate px-3 py-3");
  });
});
