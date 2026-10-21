import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("padrão sistêmico de campos obrigatórios", () => {
  it("centraliza o aviso e o alinhamento no helper compartilhado", () => {
    const helper = source("../lib/required-fields.tsx");
    expect(helper).toContain('toast.error("Preencha os campos obrigatórios:", {');
    expect(helper).toContain('className="m-0 list-disc space-y-0.5 pl-5 text-left"');
    expect(helper).toContain('position: "top-right"');
  });

  it("faz os componentes básicos respeitarem aria-invalid", () => {
    const uiKit = source("../components/ui-kit.tsx");
    const input = source("../components/ui/input.tsx");
    const textarea = source("../components/ui/textarea.tsx");
    const select = source("../components/ui/select.tsx");
    for (const content of [uiKit, input, textarea, select]) {
      expect(content).toContain("aria-invalid");
      expect(content).toContain("border-destructive");
    }
  });

  it("aplica a lista e as bordas nos fluxos restantes", () => {
    for (const relativePath of [
      "./campanhas.tsx",
      "./chamados.tsx",
      "./grupos.tsx",
      "./instancias.tsx",
      "./perfis.tsx",
    ]) {
      const content = source(relativePath);
      expect(content).toContain("showRequiredFieldsToast");
      expect(content).toContain("aria-invalid");
    }
  });

  it("remove os avisos unitários de obrigatoriedade dos fluxos convertidos", () => {
    expect(source("./chamados.tsx")).not.toContain('toast.error("Informe o título.")');
    expect(source("./grupos.tsx")).not.toContain('toast.error("Informe o nome do grupo.")');
    expect(source("./instancias.tsx")).toContain('pendingFields.push("Nome da instância")');
  });
});
