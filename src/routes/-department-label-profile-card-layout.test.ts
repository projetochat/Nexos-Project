import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const departments = readFileSync(new URL("./departamentos.tsx", import.meta.url), "utf8");
const labels = readFileSync(new URL("./etiquetas.tsx", import.meta.url), "utf8");
const profiles = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
const quickReplies = readFileSync(new URL("./mensagens-rapidas.tsx", import.meta.url), "utf8");
const attendants = readFileSync(new URL("./atendentes.tsx", import.meta.url), "utf8");

describe("cards de Departamentos e Etiquetas", () => {
  it.each([
    ["Departamentos", departments],
    ["Etiquetas", labels],
  ])("segue o padrão do Perfil de Acesso em %s", (_name, source) => {
    expect(source).toContain("flex min-h-[148px]");
    expect(source).toContain('className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"');
    if (_name === "Departamentos") {
      expect(source).toContain("d.description?.trim() && (");
      expect(source).toContain("{d.description.trim()}");
      expect(source).not.toContain('|| "Sem descrição"');
    } else {
      expect(source).toContain('|| "Sem descrição"');
    }
    expect(source).toContain(
      'className="mt-auto flex min-h-11 items-end justify-end border-t border-border pt-3"',
    );
    expect(source).toContain('className="flex shrink-0 gap-1.5"');
  });

  it("preserva as quatro ações de Departamentos", () => {
    for (const action of [
      "Visualizar departamento",
      "Duplicar departamento",
      "Editar departamento",
      "Excluir departamento",
    ]) {
      expect(departments).toContain(action);
    }
  });

  it("mostra o encerramento por inatividade somente quando configurado", () => {
    expect(departments).toContain("d.inactivityClosureEnabled && d.inactivityTimeoutMinutes");
    expect(departments).toContain("Encerramento por inatividade:");
    expect(departments).toContain('d.inactivityTimeoutMinutes === 1 ? "minuto" : "minutos"');
    expect(departments).toContain('<Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" />');
  });

  it("preserva as quatro ações de Etiquetas", () => {
    for (const action of [
      'title="Visualizar"',
      'title="Duplicar"',
      'title="Editar"',
      'title="Excluir"',
    ]) {
      expect(labels).toContain(action);
    }
  });

  it.each([
    ["Departamentos", departments],
    ["Perfis de Acesso", profiles],
    ["Etiquetas", labels],
    ["Mensagens Rápidas", quickReplies],
    ["Atendentes", attendants],
  ])("mostra Ativo/Inativo no canto superior direito em %s", (_name, source) => {
    expect(source).toContain('className="ml-auto shrink-0 self-start"');
    expect(source).toContain('"success" : "destructive"');
    expect(source).toContain('"Ativo" : "Inativo"');
  });

  it("bloqueia a lista de ícones ao visualizar um Departamento", () => {
    expect(departments).toContain("disabled={readOnly}");
  });
});
