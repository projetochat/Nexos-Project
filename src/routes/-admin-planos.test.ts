import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.planos.tsx", import.meta.url), "utf8");

describe("regras administrativas dos planos", () => {
  it("remove o filtro Tipo e mostra somente Busca e Status", () => {
    expect(source).not.toContain("const [typeFilter");
    expect(source).not.toContain('<Field label="Tipo">');
    expect(source).not.toContain("TYPE_LABELS");
    expect(source).toContain("sm:grid-cols-[minmax(0,1fr)_220px]");
  });

  it("mantém todos os status disponíveis no filtro mesmo sem registros", () => {
    expect(source).toContain(
      'const PLAN_STATUS_OPTIONS = ["ACTIVE", "SUSPENDED", "INACTIVE", "ARCHIVED", "DRAFT"]',
    );
    expect(source).toContain("PLAN_STATUS_OPTIONS.map");
    expect(source).not.toContain("new Set(plans.map((plan) => plan.status))");
  });

  it("permite ativar novamente um plano inativo", () => {
    expect(source).toContain('plan.status === "INACTIVE"');
    expect(source).toContain('kind: "activate"');
    expect(source).toContain("platformApi.activatePlan(planAction.plan.id)");
    expect(source).toContain("Plano ativado.");
  });

  it("apresenta Instâncias antes de Usuários nos cards e no formulário", () => {
    const cardLimits = source.slice(source.indexOf('<div className="mt-5 space-y-2.5'));
    expect(cardLimits.indexOf('label="Instâncias"')).toBeLessThan(
      cardLimits.indexOf('label="Usuários"'),
    );

    const formLimits = source.slice(source.indexOf("Defina os limites de uso para este plano."));
    expect(formLimits.indexOf('label="Instâncias"')).toBeLessThan(
      formLimits.indexOf('label="Usuários"'),
    );
  });

  it("permite excluir somente planos sem assinaturas", () => {
    expect(source).toContain("(plan._count?.subscriptions ?? 0) === 0 &&");
    expect(source).toContain("platformApi.deletePlan(planAction.plan.id)");
    expect(source).toContain("Plano excluído.");
  });

  it("oferece um único botão de desabilitação para planos usados sem alterar os vínculos", () => {
    expect(source).toContain("(plan._count?.subscriptions ?? 0) > 0 &&");
    expect(source).toContain('kind: "deactivate"');
    expect(source).toContain("platformApi.deactivatePlan(planAction.plan.id)");
    expect(source).toContain("Assinaturas e Tenants existentes não serão alterados.");
    expect(source).toContain("Desabilitar");
  });

  it("não permite que o usuário informe o identificador interno na criação", () => {
    expect(source).toContain('placeholder="ID gerado automaticamente"');
    expect(source).not.toContain("createPlanCode");
    expect(source).not.toContain("code: normalizedCode");
  });

  it("troca a ação de planos arquivados por desarquivar", () => {
    expect(source).toContain('plan.status === "ARCHIVED"');
    expect(source).toContain('kind: "unarchive"');
    expect(source).toContain("Desarquivar");
  });

  it("duplica como novo cadastro e permite configurar antes de salvar", () => {
    expect(source).toContain("setDuplicating(plan)");
    expect(source).toContain("forceCreate={Boolean(duplicating)}");
    expect(source).toContain("`${initial.name} - Cópia`");
    expect(source).toContain("if (initial && !forceCreate)");
    expect(source).toContain('className="action-hover-success"');
  });
});
