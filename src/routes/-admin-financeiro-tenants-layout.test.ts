import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financeSource = readFileSync(new URL("./admin.financeiro.tsx", import.meta.url), "utf8");
const tenantsSource = readFileSync(new URL("./admin.tenants.tsx", import.meta.url), "utf8");
const tenantDetailSource = readFileSync(
  new URL("./admin.tenants.$tenantId.tsx", import.meta.url),
  "utf8",
);

describe("Platform Financeiro", () => {
  it("usa o placeholder minúsculo nas datas mobile quando o período é Todos", () => {
    expect(
      financeSource.match(/mobilePlaceholder=\{period === "all" \? "dd\/mm\/aaaa" : undefined\}/g),
    ).toHaveLength(2);
  });

  it("mantém filtros, resumo e colunas financeiras solicitados", () => {
    for (const label of [
      "Nº da Fatura",
      "Situação",
      "Período",
      "Dt. Inicial",
      "Dt. Final",
      "Total de faturas",
      "Em aberto",
      "Pagas",
      "Vencidas",
      "Canceladas",
      "Vlr. Bruto",
      "Vlr. Líquido",
      "Vlr. Pago",
    ]) {
      expect(financeSource).toContain(label);
    }
    expect(financeSource).toContain("min-w-[1260px] table-fixed");
    expect(financeSource).toContain('<th className="px-4 py-3">Número</th>');
    expect(financeSource).toContain(
      '<td className="truncate px-4 py-3 font-mono" title={row.number}>',
    );
    expect(financeSource).toContain('className="whitespace-nowrap px-2 py-3 text-right">Vlr. Pago');
    expect(financeSource).toContain('className="whitespace-nowrap px-2 py-3 text-center">Status');
    expect(financeSource).toContain('className="max-w-[112rem]"');
    expect(financeSource).not.toContain("Possui Cupom");
    expect(financeSource).toContain("DASHBOARD_PERIOD_OPTIONS.map");
    expect(financeSource).toContain('useState<FinancePeriod>("all")');
    expect(financeSource).toContain('<option value="all">Todos</option>');
    expect(financeSource).toContain('className="hidden md:block"');
    expect(financeSource.match(/className="grid grid-cols-2 gap-3 md:contents"/g)).toHaveLength(2);
    expect(financeSource).toContain('"xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]"');
    expect(financeSource).toContain("data-platform-filter-grid");
    expect(financeSource).toContain(
      'className="col-span-2 flex justify-end xl:col-span-1 xl:items-end"',
    );
    expect(financeSource.match(/<DashboardDateInput/g)?.length).toBeGreaterThanOrEqual(4);
    expect(financeSource.match(/formatPlatformCurrency\(/g)?.length).toBeGreaterThanOrEqual(7);
    expect(financeSource).toContain('className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5"');
    expect(financeSource).toContain("grid h-8 w-8 shrink-0 place-items-center rounded-lg");
    expect(financeSource).toContain('<Icon className="h-4 w-4" />');
  });

  it("oferece visualização, edição, exclusão confirmada e os novos dados da fatura", () => {
    expect(financeSource).toContain('label="Visualizar"');
    expect(financeSource).toContain('label="Editar"');
    expect(financeSource).toContain('title="Excluir fatura"');
    expect(financeSource).toContain("Tem cupom de desconto?");
    expect(financeSource).toContain("paidCents");
    expect(financeSource).toContain("released");
    expect(financeSource).not.toContain("released && paidCents < totalCents");
  });
});

describe("Platform Tenants", () => {
  it("preserva a consulta e oferece credenciais e configuração individual da tenant", () => {
    expect(tenantsSource).toContain("Consulta das tenants cadastradas.");
    expect(tenantsSource).toContain("Visualizar");
    expect(tenantsSource).not.toContain("Novo tenant");
    expect(tenantsSource).not.toContain("createTenant");
    expect(tenantsSource).not.toContain("terminateTenant");
    expect(tenantsSource).not.toContain("DASHBOARD_PERIOD_OPTIONS.map");
    expect(tenantsSource).not.toContain("<DashboardDateInput");
    expect(tenantsSource).not.toContain('label="Período"');
    expect(tenantsSource).not.toContain('label="Dt. Inicial"');
    expect(tenantsSource).not.toContain('label="Dt. Final"');
    expect(tenantsSource).not.toContain("dateFrom:");
    expect(tenantsSource).not.toContain("dateTo:");
    expect(tenantsSource).toContain('className="col-span-2 min-w-0 md:col-span-1 xl:col-span-4"');
    expect(tenantsSource).toContain('"xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]"');
    expect(tenantsSource).toContain("data-platform-filter-grid");
    expect(tenantsSource).toContain('<Field label="Busca">');
    expect(tenantsSource.indexOf("Dt./Hora")).toBeLessThan(
      tenantsSource.indexOf("<th>Status</th>"),
    );
    expect(tenantsSource).toContain("tenant.responsibleEmail ?? client?.responsibleEmail");
    expect(tenantsSource).toContain('<th className="!px-4 py-3 font-medium">Cliente</th>');
    expect(tenantsSource).toContain(
      '<td className="!px-4 py-3 font-medium">{client?.name ?? tenant.name}</td>',
    );
    expect(tenantsSource).toContain('<td className="font-medium">{tenant.slug}</td>');
    expect(tenantsSource).toContain("formatTenantTableDate(tenant.createdAt)");
    expect(tenantsSource).toContain('day: "2-digit"');
    expect(tenantsSource).toContain('month: "2-digit"');
    expect(tenantsSource).toContain('year: "numeric"');
    expect(tenantsSource).toContain('hour: "2-digit"');
    expect(tenantsSource).toContain('minute: "2-digit"');
    expect(tenantsSource).toContain("Gerenciar credenciais do usuário administrador");
    expect(tenantsSource).toContain(
      "Se o primeiro acesso ainda estiver pendente, esta senha será temporária",
    );
    expect(tenantsSource).toContain('tenant.status === "ACTIVE"');
    expect(tenantsSource).toContain("updateTenantAdministratorCredentials");
    expect(tenantsSource).toContain("Configuração da Tenant");
    expect(tenantsSource).toContain("updateTenantConfiguration");
    // D-014: o usuário autorizou Chat opcional por tenant no Platform.
    expect(tenantsSource).toContain("Controla menu, permissões e operações do Chat.");
    expect(tenantsSource).toContain("checked={modules.chat}");
    expect(tenantsSource).toContain("Deixe vazio para herdar o limite atual do plano contratado");
    expect(tenantsSource).toContain("hover:text-blue-600");
    expect(tenantsSource).toContain("hover:text-red-600");
  });

  it("abre um resumo somente leitura sem remover a navegação para os detalhes", () => {
    expect(tenantsSource).toContain("setSelectedTenant(tenant)");
    expect(tenantsSource).toContain('title="Resumo da tenant"');
    expect(tenantsSource).toContain('description="Consulta em modo somente leitura."');
    expect(tenantsSource).toContain("Ver detalhes completos");
    expect(tenantsSource).toContain('to="/admin/tenants/$tenantId"');
  });

  it("não expõe mutações nem impersonação nos detalhes", () => {
    expect(tenantDetailSource).toContain("Consulta em modo somente leitura");
    expect(tenantDetailSource).not.toContain("suspendTenant");
    expect(tenantDetailSource).not.toContain("reactivateTenant");
    expect(tenantDetailSource).not.toContain("terminateTenant");
    expect(tenantDetailSource).not.toContain("startImpersonation");
  });
});
