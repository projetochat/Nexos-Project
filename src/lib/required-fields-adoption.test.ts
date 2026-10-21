import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("padrão compartilhado de campos obrigatórios", () => {
  it("agrega nome e aba no cadastro de campos adicionais", () => {
    const content = source("../routes/configuracoes.campos-contato.tsx");
    expect(content).toContain("showRequiredFieldsToast([");
    expect(content).toContain('...(nextRequiredErrors.label ? ["Nome"] : [])');
    expect(content).toContain('...(nextRequiredErrors.tabName ? ["Aba"] : [])');
    expect(content).toContain("requiredFieldClassName(requiredErrors.tabName)");
  });

  it("agrega credenciais obrigatórias da empresa e do perfil", () => {
    const company = source("../routes/configuracoes.empresa.tsx");
    const profile = source("../routes/perfil.tsx");
    expect(company).toContain('showRequiredFieldsToast(["Senha atual"])');
    expect(company).toContain("requiredFieldClassName(requiredErrors.presentationName)");
    expect(profile).toContain("setRequiredPasswordErrors(nextRequiredErrors)");
    expect(profile).toContain('...(nextRequiredErrors.confirmPassword ? ["Confirmar senha"] : [])');
  });

  it("marca título, agendamento e transferência com o mesmo padrão", () => {
    const dashboard = source("../components/dashboard-editor-modal.tsx");
    const schedule = source("../components/schedule-message-modal.tsx");
    const bulk = source("../components/bulk-conversation-action-modal.tsx");
    expect(dashboard).toContain('showRequiredFieldsToast(["Título do componente"])');
    expect(schedule).toContain('...(nextRequiredErrors.message ? ["Mensagem ou anexo"] : [])');
    expect(schedule).toContain("requiredFieldClassName(requiredErrors.scheduleAt)");
    expect(bulk).toContain("setTargetRequired(true)");
    expect(bulk).toContain("requiredFieldClassName(targetRequired)");
  });

  it("habilita a validação visível nos modais do onboarding", () => {
    const onboarding = source("../components/tenant-onboarding-boundary.tsx");
    expect(onboarding).toContain("const submitCreate = () => {");
    expect(onboarding).toContain('...(nextRequiredErrors.roleId ? ["Perfil"] : [])');
    expect(onboarding).toContain("disabled={create.isPending}");
    expect(onboarding).toContain("showRequiredFieldsToast([");
    expect(onboarding).toContain("requiredFieldClassName(requiredErrors.detail)");
  });

  it("padroniza o modal de senha da administração Platform", () => {
    const adminShell = source("../components/admin-shell.tsx");
    expect(adminShell).toContain("setRequiredErrors(nextRequiredErrors)");
    expect(adminShell).toContain('...(nextRequiredErrors.currentPassword ? ["Senha atual"] : [])');
    expect(adminShell).toContain("noValidate");
    expect(adminShell).toContain("requiredFieldClassName(invalid)");
  });
});
