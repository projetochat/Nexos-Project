import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.assinaturas.tsx", import.meta.url), "utf8");
const listSource = source.slice(0, source.indexOf("function CreateForm"));

describe("tela administrativa de assinaturas", () => {
  it("usa o placeholder minúsculo nas datas mobile quando o período é Todos", () => {
    expect(
      source.match(/mobilePlaceholder=\{period === "all" \? "dd\/mm\/aaaa" : undefined\}/g),
    ).toHaveLength(2);
  });

  it("apresenta os filtros antes dos cards de indicadores", () => {
    const filterCard = source.indexOf('<Card className="p-4 sm:p-4">');
    const statusCardsGrid = source.indexOf(
      '<div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">',
    );

    expect(filterCard).toBeGreaterThan(-1);
    expect(statusCardsGrid).toBeGreaterThan(filterCard);
    expect(source).toContain("xl:grid-cols-[minmax(220px,2.2fr)_1fr_.7fr_1.1fr_1fr_1fr_1fr_auto]");
    expect(source).toContain("data-platform-filter-grid");
    expect(source).toContain('className="col-span-2 flex justify-end xl:col-span-1 xl:items-end"');
  });

  it("unifica cadastro e espera financeira no card Em andamento sem perder os filtros", () => {
    const cardsSource = source.slice(
      source.indexOf("const statusCards"),
      source.indexOf("function AssinaturasAdmin"),
    );
    const cards = [
      "Trial",
      "Em andamento",
      "Financeiro liberado",
      "Ativo",
      "Suspensa",
      "Canceladas",
    ];
    let cursor = 0;
    for (const card of cards) {
      const next = cardsSource.indexOf(`label: "${card}"`, cursor);
      expect(next).toBeGreaterThan(cursor - 1);
      cursor = next + 1;
    }

    expect(cardsSource).toContain('statuses: ["DRAFT", "PENDING_FINANCE"]');
    expect(cardsSource).not.toContain('label: "Em cadastro"');
    expect(cardsSource).not.toContain('label: "Aguardando financeiro"');
    expect(source).toContain("const statusFilterOptions");
    expect(source).toContain('{ status: "DRAFT", label: "Em cadastro" }');
    expect(source).toContain('{ status: "PENDING_FINANCE", label: "Aguardando financeiro" }');
    expect(source).toContain("statusFilterOptions.map");
    expect(source).toContain("item.statuses.includes(normalized)");
    expect(source).toContain("counts.get(card.key)");
  });

  it("mantém as colunas definidas para a listagem", () => {
    for (const column of [
      "Cliente",
      "Contato responsável",
      "Plano",
      "Tipo",
      "Vlr. mensal (bruto)",
      "Vlr. desconto",
      "Vlr. líquido",
      "Dt./Hr.",
      "Status",
      "Ações",
    ]) {
      expect(source).toContain(`>${column}</th>`);
    }

    expect(source).toContain('className="w-full min-w-[1100px] table-fixed text-xs xl:text-sm"');
    expect(source).toContain('<th className="px-4 py-3">Cliente</th>');
    expect(source).toContain('<td className="truncate px-4 py-3 font-medium" title={client.name}>');
    expect(listSource).toContain(
      'className={viewMode === "list" ? "mt-4 overflow-hidden" : "hidden"}',
    );
    expect(listSource).toContain('data-platform-desktop-table className="overflow-x-auto"');
    expect(source).toContain("min-w-[1100px]");
    expect(source).not.toContain("min-w-[1500px]");
    expect(source).toContain('className="max-w-[112rem]"');
    expect(source).toContain("h-8 w-8 shrink-0");
    expect(source).toContain(
      'className="w-full text-xs uppercase tracking-widest text-muted-foreground"',
    );
    expect(source).not.toContain(
      'className="w-full text-[11px] font-medium leading-tight text-muted-foreground"',
    );
    expect(source).not.toContain("truncate text-xs font-medium text-muted-foreground");
    expect(source).not.toContain(">Cidade</th>");
    expect(source).not.toContain(">UF</th>");
    expect(source).toContain("formatSubscriptionDate(row.startsAt ?? row.currentPeriodStart)");
    expect(source.match(/formatPlatformCurrency\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('className="w-[12%]"');
    expect(source).toContain('className="w-[9%]"');
    expect(source).toContain('className="w-[5%]"');
    expect(source).toContain('className="px-2 py-3 text-center leading-tight">Dt./Hr.');
    expect(source).toContain('hour: "2-digit"');
    expect(source).toContain('minute: "2-digit"');
    expect(source).toContain("createPortal(menu, document.body)");
    expect(source).toContain('className="fixed z-[100] w-56');
  });

  it("mantém cards obrigatórios no mobile e permite alternar no desktop", () => {
    expect(source).toContain(
      'const [viewMode, setViewMode] = React.useState<"cards" | "list">("list")',
    );
    expect(source).toContain('if (isMobile) {\n      setViewMode("cards");\n      return;');
    expect(source).toContain('className="mt-3 hidden justify-end gap-1 md:flex"');
    expect(source).toContain('aria-label="Visualização das assinaturas"');
    expect(source).toContain('aria-label="Visualizar assinaturas em cards"');
    expect(source).toContain('aria-label="Visualizar assinaturas em lista"');
    expect(source).toContain('viewMode === "cards"');
    expect(source).toContain('viewMode === "list"');
    expect(source).toContain("sm:grid-cols-2 md:p-4 xl:grid-cols-3");
  });

  it("aplica o mesmo rodapé integrado à grade e aos cards", () => {
    expect(source).toContain('<thead className="bg-surface-2">');
    expect(source).toContain("<GridPaginationFooter");
    expect(source).toContain("visible={visibleRows.length}");
    expect(source).toContain("total={filtered.length}");
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
    expect(source).toContain("{visibleRows.map((row) => {");
    expect(source).toContain("{visibleRows.map((row) => (");
    expect(source).toContain("data-platform-card-shell");
    expect(source).toContain(
      '? "mt-4 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-card"',
    );
  });

  it("cria a assinatura sem permitir que o usuário envie um status manual", () => {
    const createCall = source.slice(
      source.indexOf("platformApi.createClientSubscription"),
      source.indexOf('toast.success("Assinatura cadastrada.")'),
    );
    expect(createCall).not.toContain("status:");
    expect(source).toContain('<StatusBadge status="REGISTERING" />');
    expect(source).not.toContain("setStatus(initial");
  });

  it("oferece somente as ações que controlam o fluxo e protege repetição", () => {
    expect(source).toContain('label="Detalhar"');
    expect(source).toContain('label="Gerar financeiro"');
    expect(source).toContain('status === "SUSPENDED" || status === "CANCELLED"');
    expect(source).toContain('"FINANCE_RELEASED", "SUSPENDED", "CANCELLED"');
    expect(source).toContain(': "Ativar assinatura"');
    expect(source).toContain("disabled={disabled || !canGenerateFinance}");
    expect(source).toContain("disabled={disabled || !canActivate}");
    expect(source).toContain('label="Suspender assinatura"');
    expect(source).toContain('label="Cancelar assinatura"');
    expect(source).toContain("Financeiro já gerado.");
    expect(source).toContain("Financeiro ainda não gerado.");
    expect(source).toContain("A assinatura já está ativa e não pode ser ativada novamente.");
    expect(source).toContain('if (status === "SUSPENDED" || status === "CANCELLED") return null;');
    expect(source).toContain("O registro já se encontra suspenso");
    expect(source).toContain("O registro já se encontra cancelado");
    expect(source).toContain('title={reactivating ? "Reativar assinatura" : "Ativar assinatura"}');
    expect(source).toContain("setActivationTarget(row)");
    expect(source).toContain("toast.error(apiErrorMessageWithRequestId(actionError))");
    expect(source).toContain(".subscription(value.id)");
    for (const section of ["Cliente", "Plano", "Assinatura"]) {
      expect(source).toContain(`title="${section}"`);
    }
    expect(source).toContain(">Financeiro</h3>");
    expect(source).toContain(">Histórico</h3>");
  });

  it("exibe ações separadas por ícone nos cards e mantém o menu na lista", () => {
    expect(source.match(/<SubscriptionCardActions/g)).toHaveLength(1);
    expect(source.match(/<Actions/g)).toHaveLength(1);
    expect(source).toContain('aria-label="Ações da assinatura"');
    for (const label of [
      "Detalhar",
      "Gerar financeiro",
      "Suspender assinatura",
      "Cancelar assinatura",
    ]) {
      expect(source).toContain(`label="${label}"`);
    }
    expect(source).toContain("title={label}");
    expect(source).toContain("aria-label={label}");
  });

  it("calcula o líquido e aplica as regras condicionais de desconto e período", () => {
    expect(source).toContain("Math.max(0, grossCents - discountCents)");
    expect(source).toContain("O desconto não pode ser maior que o valor mensal.");
    expect(source).toContain("Informe o fim do período ou marque Indeterminado.");
    expect(source).toContain("disabled={!coupon}");
    expect(source).toContain("readOnly={indefinite}");
  });

  it("diferencia cancelamento e suspensão com alertas vermelhos", () => {
    expect(source).toContain('CANCELLED: { label: "Cancelada", tone: "destructive" }');
    expect(source).toContain('value === "SUSPENDED"');
    expect(source).toContain("bg-red-600/25 text-red-700");
  });

  it("mantém textos longos de status dentro da borda do selo", () => {
    const badgeSource = source.slice(
      source.indexOf("function StatusBadge"),
      source.indexOf("function Filter"),
    );

    expect(badgeSource).toContain("whitespace-normal");
    expect(badgeSource).not.toContain("whitespace-nowrap");
    expect(badgeSource).toContain('className="min-w-0 text-center leading-tight"');
  });

  it("explica a exclusão da tenant e a recriação do zero ao reativar", () => {
    expect(source).toContain("A Tenant vinculada e todos os seus dados");
    expect(source).toContain("excluídos definitivamente");
    expect(source).toContain("Uma nova Tenant será criada e configurada do zero");
    expect(source).toContain("Os dados da Tenant excluída não serão recuperados");
    expect(source).toContain('"Excluída após cancelamento"');
    expect(source).not.toContain("seus dados serão preservados para consulta e auditoria");
  });
});
