import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./login.tsx", import.meta.url), "utf8");

describe("fluxos obrigatórios após autenticação", () => {
  it("preserva o login administrativo exclusivo por e-mail", () => {
    expect(source).toContain(">\n                    E-mail\n                  </label>");
    expect(source).toContain('type="email"');
    expect(source).toContain('placeholder="email@exemplo.com"');
    expect(source).toContain('autoComplete="email"');
    expect(source).not.toContain('placeholder="email@exemplo.com ou nome.sobrenome"');
  });

  it("mantém a troca inicial sem fechamento e valida senha e confirmação", () => {
    expect(source).toContain('title="Defina uma nova senha"');
    expect(source).toContain("dismissible={false}");
    expect(source).toContain('newPassword === "Trixus@2026"');
    expect(source).toContain("newPassword !== confirmNewPassword");
    expect(source).toContain("completeRequiredPasswordChange");
  });

  it("exige a seleção do acesso antes de navegar para o ambiente", () => {
    expect(source).toContain('title="Selecione o acesso"');
    expect(source).toContain("tenantSelection.tenantSelectionToken");
    expect(source).toContain("selectionId: selectedAccessId");
    expect(source).toContain("tenantId: selectedAccessId");
    expect(source).toContain("Portal do Cliente");
    expect(source).toContain("Acesso interno");
    expect(source).toContain("selectTenant");
  });

  it("aplica ao convite do Portal do Cliente a referência visual de ativação", () => {
    expect(source).toContain('const isCustomerPortalInvitation = Boolean(invitationPreview?.contact) || String(portal) === "1"');
    expect(source).toContain('className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-white');
    expect(source).toContain('src="/trixus-logo.png"');
    expect(source).toContain("Ativar meu acesso");
    expect(source).toContain('label: "Departamento"');
    expect(source).toContain('label: "Filial"');
    expect(source).toContain("Criar senha");
    expect(source).toContain('placeholder="Digite sua senha novamente"');
    expect(source).toContain("showPasswordConfirmation");
    expect(source).toContain("Após ativar, você poderá abrir e acompanhar seus chamados.");
  });
});
