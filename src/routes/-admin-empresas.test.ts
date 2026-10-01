import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.empresas.tsx", import.meta.url), "utf8");

describe("cadastro administrativo de clientes", () => {
  it("torna o CNPJ opcional somente durante a prospecção", () => {
    expect(source).toContain('const requiresDocument = form.status !== "PROSPECTING";');
    expect(source).toContain("(requiresDocument && document.length !== 14)");
    expect(source).toContain('form.status === "PROSPECTING" ? "" : " *"');
  });

  it("exclui definitivamente apenas clientes nunca usados e cancela os que têm histórico", () => {
    expect(source).toContain("client._count?.subscriptions ?? 0");
    expect(source).toContain('kind: "delete"');
    expect(source).toContain('kind: "cancel"');
    expect(source).toContain("platformApi.deleteClient(clientAction.client.id)");
    expect(source).toContain("platformApi.cancelClient(clientAction.client.id)");
    expect(source).toContain("Esta exclusão é definitiva");
    expect(source).toContain("Tenants e assinaturas existentes não serão apagados");
  });

  it("aplica o padrão destrutivo às ações de excluir e cancelar", () => {
    expect(source).toContain('label.includes("Excluir") || label.includes("Cancelar")');
    expect(source).toContain("action-hover-destructive");
  });
});
