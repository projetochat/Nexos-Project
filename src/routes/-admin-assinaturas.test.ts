import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.assinaturas.tsx", import.meta.url), "utf8");
const listSource = source.slice(0, source.indexOf("function CreateForm"));

describe("tela administrativa de assinaturas", () => {
  it("mantém a ordem dos cards e as colunas definidas para a listagem", () => {
    const cards = [
      "Trial",
      "Em cadastro",
      "Aguardando financeiro",
      "Financeiro liberado",
      "Ativo",
      "Suspensa",
      "Canceladas",
    ];
    let cursor = 0;
    for (const card of cards) {
      const next = source.indexOf(`label: "${card}"`, cursor);
      expect(next).toBeGreaterThan(cursor - 1);
      cursor = next + 1;
    }

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

    expect(source).toContain('className="w-full table-fixed text-xs xl:text-sm"');
    expect(listSource).not.toContain('className="overflow-x-auto"');
    expect(source).not.toContain("min-w-[1500px]");
    expect(source).toContain('className="max-w-[112rem]"');
    expect(source).toContain("h-8 w-8 shrink-0");
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
    expect(source).toContain('status === "SUSPENDED" ? "Reativar assinatura"');
    expect(source).toContain(': "Ativar assinatura"');
    expect(source).toContain("disabled={disabled || !canGenerateFinance}");
    expect(source).toContain("disabled={disabled || !canActivate}");
    expect(source).toContain('label="Suspender assinatura"');
    expect(source).toContain('label="Cancelar assinatura"');
    expect(source).toContain("Financeiro já gerado.");
    expect(source).toContain("Financeiro ainda não gerado.");
    expect(source).toContain("A assinatura já está ativa e não pode ser ativada novamente.");
    expect(source).toContain('if (status === "SUSPENDED") return null;');
    expect(source).toContain("O registro já se encontra suspenso");
    expect(source).toContain("O registro já se encontra cancelado");
    expect(source).toContain('title={reactivating ? "Reativar assinatura" : "Ativar assinatura"}');
    expect(source).toContain("setActivationTarget(row)");
    expect(source).toContain(".subscription(value.id)");
    for (const section of ["Cliente", "Plano", "Assinatura"]) {
      expect(source).toContain(`title="${section}"`);
    }
    expect(source).toContain(">Financeiro</h3>");
    expect(source).toContain(">Histórico</h3>");
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
});
