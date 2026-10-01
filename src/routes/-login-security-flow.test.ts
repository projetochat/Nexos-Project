import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./login.tsx", import.meta.url), "utf8");

describe("fluxos obrigatórios após autenticação", () => {
  it("mantém a troca inicial sem fechamento e valida senha e confirmação", () => {
    expect(source).toContain('title="Defina uma nova senha"');
    expect(source).toContain("dismissible={false}");
    expect(source).toContain('newPassword === "Trixus@2026"');
    expect(source).toContain("newPassword !== confirmNewPassword");
    expect(source).toContain("completeRequiredPasswordChange");
  });

  it("exige a seleção da Tenant antes de navegar para o ambiente", () => {
    expect(source).toContain('title="Selecione a organização"');
    expect(source).toContain("tenantSelection.tenantSelectionToken");
    expect(source).toContain("tenantId: selectedTenantId");
    expect(source).toContain("selectTenant");
  });
});
