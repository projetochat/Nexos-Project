import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financeSource = readFileSync(new URL("./admin.financeiro.tsx", import.meta.url), "utf8");
const tenantsSource = readFileSync(new URL("./admin.tenants.tsx", import.meta.url), "utf8");
const tenantDetailSource = readFileSync(
  new URL("./admin.tenants.$tenantId.tsx", import.meta.url),
  "utf8",
);

describe("Platform Financeiro", () => {
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
      "Possui Cupom",
      "Vlr. Líquido",
      "Vlr. Pago",
    ]) {
      expect(financeSource).toContain(label);
    }
    expect(financeSource).toContain("min-w-[1260px] table-fixed");
    expect(financeSource).toContain('className="whitespace-nowrap px-2 pb-2 text-right">Vlr. Pago');
    expect(financeSource).toContain('className="whitespace-nowrap px-2 pb-2">Status');
    expect(financeSource).toContain('className="max-w-[112rem]"');
    expect(financeSource).toContain("DASHBOARD_PERIOD_OPTIONS.map");
    expect(financeSource).toContain('useState<FinancePeriod>("all")');
    expect(financeSource).toContain('<option value="all">Todos</option>');
    expect(financeSource.match(/<DashboardDateInput/g)?.length).toBeGreaterThanOrEqual(4);
    expect(financeSource.match(/formatPlatformCurrency\(/g)?.length).toBeGreaterThanOrEqual(7);
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
    expect(tenantsSource).toContain("DASHBOARD_PERIOD_OPTIONS.map");
    expect(tenantsSource.match(/<DashboardDateInput/g)?.length).toBe(2);
    expect(tenantsSource.indexOf("Dt./Hora")).toBeLessThan(
      tenantsSource.indexOf("<th>Status</th>"),
    );
    expect(tenantsSource).toContain("tenant.responsibleEmail ?? client?.responsibleEmail");
    expect(tenantsSource).toContain('<td className="font-medium">{tenant.slug}</td>');
    expect(tenantsSource).toContain("formatTenantTableDate(tenant.createdAt)");
    expect(tenantsSource).toContain('day: "2-digit"');
    expect(tenantsSource).toContain('month: "2-digit"');
    expect(tenantsSource).toContain('year: "numeric"');
    expect(tenantsSource).toContain('hour: "2-digit"');
    expect(tenantsSource).toContain('minute: "2-digit"');
    expect(tenantsSource).toContain("Gerenciar credenciais do usuário administrador");
    expect(tenantsSource).toContain('tenant.status === "ACTIVE"');
    expect(tenantsSource).toContain("updateTenantAdministratorCredentials");
    expect(tenantsSource).toContain("Configuração da Tenant");
    expect(tenantsSource).toContain("updateTenantConfiguration");
    expect(tenantsSource).toContain("Módulo obrigatório e sempre habilitado");
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
