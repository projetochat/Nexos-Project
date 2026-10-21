import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profilesSource = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
const departmentsSource = readFileSync(new URL("./departamentos.tsx", import.meta.url), "utf8");
const uiKitSource = readFileSync(new URL("../components/ui-kit.tsx", import.meta.url), "utf8");
const messageEditorSource = readFileSync(
  new URL("../components/greeting-message-editor.tsx", import.meta.url),
  "utf8",
);

describe("visualização protegida do perfil Administrador", () => {
  it("apresenta todo o catálogo e todos os escopos elegíveis como selecionados", () => {
    const administratorScopes = profilesSource.slice(
      profilesSource.indexOf("function administratorChatScopes"),
      profilesSource.indexOf("function duplicateRoleDraft"),
    );

    expect(administratorScopes).toContain('connection.status === "connected"');
    expect(administratorScopes).toContain('connection.status === "disconnected"');
    expect(administratorScopes).toContain(
      "connection.departments.map((department) => department.id)",
    );
    expect(profilesSource).toContain("initial && !clone && isAdministratorRole(initial)");
    expect(profilesSource).toContain("permissionGroups.flatMap((group)");
    expect(profilesSource).toContain("chatScopes: visibleChatScopes");
    expect(profilesSource).toContain("active: isAdministrator || clone ? true");
  });
});

describe("encerramento por inatividade do Departamento", () => {
  it("usa o editor de mensagens, sinaliza a obrigatoriedade na borda e simplifica o texto", () => {
    expect(departmentsSource).toContain("<GreetingMessageEditor");
    expect(departmentsSource).toContain("showAttachment={false}");
    expect(departmentsSource).toContain("showEmoji");
    expect(departmentsSource).toContain("maxLength={4000}");
    expect(departmentsSource).not.toContain(
      "Encerra o atendimento quando o cliente não responde ao atendente.",
    );

    const editorPosition = departmentsSource.indexOf("<GreetingMessageEditor");
    const invalidPosition = departmentsSource.indexOf(
      "invalid={inactivityErrors.message}",
      editorPosition,
    );
    expect(invalidPosition).toBeGreaterThan(editorPosition);
    expect(departmentsSource).not.toContain('role="alert"');
  });

  it("mantém o relógio em azul escuro e o editor configurável sem alterar o padrão existente", () => {
    expect(departmentsSource).toContain(
      '<Clock3 className="h-5 w-5 text-blue-700 dark:text-blue-300" />',
    );
    expect(messageEditorSource).toContain("maxLength = 1000");
    expect(messageEditorSource).toContain("rows = 6");
    expect(messageEditorSource).toContain("maxLength={maxLength}");
    expect(messageEditorSource).toContain("rows={rows}");
  });

  it("marca os campos condicionais como obrigatórios e mantém o aviso azul do prazo", () => {
    expect(departmentsSource).toContain('<Field label="Tempo sem resposta do cliente *">');
    expect(departmentsSource).toContain('<Field label="Mensagem *">');
    expect(departmentsSource).toContain("data-department-inactivity-notice");
    expect(departmentsSource).toContain(
      "O prazo começa após a mensagem do atendente. Se o cliente responder, a contagem é",
    );
    expect(departmentsSource).toContain("bg-blue-50");
  });
});

describe("padding dos cards", () => {
  it("usa 16px nos quatro lados e mantém as ações do Departamento acima do rodapé", () => {
    expect(uiKitSource).toContain('${padding ? "p-4" : ""}');
    expect(uiKitSource).not.toContain('padding ? "p-4 sm:p-6"');
    expect(departmentsSource).toContain(
      'className="mt-auto flex min-h-11 items-end justify-end border-t border-border pt-3"',
    );
  });
});
