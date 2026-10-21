import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expectedOccurrences = new Map([
  ["admin.assinaturas.tsx", 1],
  ["admin.configuracoes.tsx", 1],
  ["admin.empresas.tsx", 1],
  ["admin.financeiro.tsx", 1],
  ["admin.planos.tsx", 1],
  ["admin.tenants.tsx", 2],
  ["atendentes.tsx", 1],
  ["automacoes.tsx", 1],
  ["agendamentos.tsx", 1],
  ["chamados.tsx", 2],
  ["clientes.tsx", 4],
  ["contatos.tsx", 3],
  ["configuracoes.campos-contato.tsx", 1],
  ["configuracoes.empresa.tsx", 2],
  ["configuracoes.geral.tsx", 1],
  ["departamentos.tsx", 1],
  ["etiquetas.tsx", 1],
  ["instancias.tsx", 1],
  ["login.tsx", 1],
  ["mensagens-rapidas.tsx", 1],
  ["perfil.tsx", 2],
  ["perfis.tsx", 1],
  ["../components/dashboard-editor-modal.tsx", 2],
  ["../components/message-actions-menu.tsx", 1],
  ["../components/schedule-message-modal.tsx", 1],
  ["../components/tenant-onboarding-boundary.tsx", 2],
]);

describe("padrão global dos botões Salvar", () => {
  it.each([...expectedOccurrences])("aplica a classe de tamanho em %s", (file, count) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source.match(/save-action-button/g)).toHaveLength(count);
  });

  it("define altura, largura mínima e bordas sem alterar cores", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const rule = styles.match(/button\.save-action-button \{[\s\S]*?\}/)?.[0] ?? "";

    expect(rule).toContain("height: 2rem");
    expect(rule).toContain("min-height: 2rem");
    expect(rule).toContain("min-width: 5rem");
    expect(rule).toContain("border-radius: 0.5rem");
    expect(rule).not.toMatch(/color|background|border-color/);
  });
});
