import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("padrão de campos obrigatórios nas telas operacionais", () => {
  it.each([
    "./contatos.tsx",
    "./atendentes.tsx",
    "./departamentos.tsx",
    "./etiquetas.tsx",
    "./mensagens-rapidas.tsx",
    "./agendamentos.tsx",
  ])("usa o aviso compartilhado e a borda padronizada em %s", (file) => {
    const contents = source(file);
    expect(contents).toContain("showRequiredFieldsToast");
    expect(contents).toContain("requiredFieldClassName");
    expect(contents).toContain("aria-invalid");
  });

  it("lista os campos fixos e adicionais obrigatórios de contatos", () => {
    const contents = source("./contatos.tsx");
    expect(contents).toContain('requiredFields.push("Nome")');
    expect(contents).toContain('requiredFields.push("WhatsApp")');
    expect(contents).toContain("requiredFields.push(field.label)");
    expect(contents).not.toContain('toast.error("Preencha os campos obrigatórios.")');
  });

  it("preserva duplicidades de atendente fora da lista de obrigatórios", () => {
    const contents = source("./atendentes.tsx");
    expect(contents).toContain('errs.nome = "Já existe um atendente com este nome."');
    expect(contents).toContain('errs.email = "Já existe um atendente com este e-mail."');
    expect(contents).toContain("showRequiredFieldsToast(requiredFields)");
  });

  it("valida em conjunto os campos condicionais do departamento", () => {
    const contents = source("./departamentos.tsx");
    expect(contents).toContain('requiredFields.push("Tempo sem resposta do cliente")');
    expect(contents).toContain('requiredFields.push("Mensagem")');
    expect(contents).toContain("inactivityErrors.timeout");
    expect(contents).toContain("inactivityErrors.message");
  });

  it("marca cada mensagem rápida vazia e limpa a borda ao corrigir", () => {
    const contents = source("./mensagens-rapidas.tsx");
    expect(contents).toContain("missingMessageIndexes");
    expect(contents).toContain("requiredErrors.messageIndexes.includes(index)");
    expect(contents).toContain("messageIndexes: current.messageIndexes.filter");
  });

  it("reúne todas as pendências condicionais de um agendamento", () => {
    const contents = source("./agendamentos.tsx");
    expect(contents).toContain('requiredFields.push("Identificador")');
    expect(contents).toContain('requiredFields.push("Contato destinatário")');
    expect(contents).toContain('requiredFields.push("Dias da semana")');
    expect(contents).toContain("setErrors(nextErrors)");
  });
});
