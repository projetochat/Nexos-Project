import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientsSource = readFileSync(new URL("./admin.empresas.tsx", import.meta.url), "utf8");
const plansSource = readFileSync(new URL("./admin.planos.tsx", import.meta.url), "utf8");

describe("contratos visuais de clientes da plataforma", () => {
  it("mantém situação ao lado do nome e registra data e hora", () => {
    const namePosition = clientsSource.indexOf('label="Nome do cliente *"');
    const statusPosition = clientsSource.indexOf('label="Situação *"', namePosition);
    const documentPosition = clientsSource.indexOf(
      'label={`CNPJ${form.status === "PROSPECTING" ? "" : " *"}`}',
      namePosition,
    );

    expect(namePosition).toBeGreaterThan(-1);
    expect(statusPosition).toBeGreaterThan(namePosition);
    expect(statusPosition).toBeLessThan(documentPosition);
    expect(documentPosition).toBeGreaterThan(statusPosition);
    expect(clientsSource).toContain('title={isEditing ? "Editar Cliente" : "Novo Cliente"}');
    expect(clientsSource).toContain('type="datetime-local"');
  });

  it("oferece prospecção no filtro, formulário e badge", () => {
    expect(clientsSource.match(/value="PROSPECTING"/g)).toHaveLength(2);
    expect(clientsSource).toContain('["warning", "PROSPECÇÃO"]');
  });
});

describe("contratos visuais de planos da plataforma", () => {
  it("organiza os campos principais e deixa o código automático", () => {
    const statusPosition = plansSource.indexOf('label="Status *"');
    const namePosition = plansSource.indexOf('label="Nome do plano *"');
    const codePosition = plansSource.indexOf('label="Código"');
    const trialPosition = plansSource.indexOf('label="Dias de trial"');

    expect(statusPosition).toBeGreaterThan(-1);
    expect(statusPosition).toBeLessThan(namePosition);
    expect(namePosition).toBeLessThan(codePosition);
    expect(codePosition).toBeLessThan(trialPosition);
    expect(plansSource).toContain(
      'title={initial && !forceCreate ? "Editar Plano" : "Novo Plano"}',
    );
    expect(plansSource).toContain('placeholder="ID gerado automaticamente"');
  });

  it("expõe somente os três limites e módulos solicitados", () => {
    const formSource = plansSource.slice(plansSource.indexOf("function PlanForm"));

    expect(formSource).toContain('label="Usuários"');
    expect(formSource).toContain('label="Instâncias"');
    expect(formSource).toContain('label="Campanhas"');
    expect(formSource).not.toContain('label="Departamentos"');
    expect(plansSource).toContain('label: "Chat"');
    expect(plansSource).toContain('label: "Campanhas"');
    expect(plansSource).toContain('label: "Chamados"');
    expect(plansSource).not.toContain('label: "Contatos"');
    expect(plansSource).not.toContain('label: "Gerenciar Grupos"');
    expect(plansSource).not.toContain('label: "Histórico de Conversas"');
    expect(plansSource).not.toContain('label: "Mensagens Rápidas"');
    expect(plansSource).not.toContain('label: "Agendamentos"');
  });
});
