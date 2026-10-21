import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const readRoute = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");

describe("padrão de campos obrigatórios no Platform", () => {
  const cases = [
    ["admin.empresas", "Nome do cliente"],
    ["admin.planos", "Nome do plano"],
    ["admin.assinaturas", "Início do período"],
    ["admin.financeiro", "Data de vencimento"],
    ["admin.tenants", "Nome do responsável"],
  ] as const;

  for (const [route, label] of cases) {
    it(`${route} usa lista compartilhada, borda e limpeza em tempo real`, () => {
      const source = readRoute(route);
      expect(source).toContain("showRequiredFieldsToast");
      expect(source).toContain("requiredFieldClassName");
      expect(source).toContain("setErrors");
      expect(source).toContain(label);
      expect(source).toContain("aria-invalid");
    });
  }

  it("mantém validações condicionais na assinatura", () => {
    const source = readRoute("admin.assinaturas");
    expect(source).toContain('["endsAt", "Fim do período"]');
    expect(source).toContain('showRequiredFieldsToast(["Motivo da suspensão"])');
    expect(source).toContain("if (grossCents <= 0)");
  });

  it("mantém as validações de domínio financeiro separadas", () => {
    const source = readRoute("admin.financeiro");
    expect(source).toContain('toast.error("Informe um valor original válido.")');
    expect(source).toContain('toast.error("Informe valores válidos para desconto e pagamento.")');
  });
});
