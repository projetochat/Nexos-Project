import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./clientes.tsx", import.meta.url), "utf8");

describe("Clientes do módulo Chamados — PACK 11", () => {
  it("usa o catálogo CRM existente e não redireciona para Contatos", () => {
    expect(source).toContain("crmApi.listCustomers");
    expect(source).toContain("crmApi.createCustomer");
    expect(source).toContain("crmApi.updateCustomer");
    expect(source).toContain("crmApi.deleteCustomer");
    expect(source).not.toContain('redirect({ to: "/contatos" })');
  });

  it("entrega filtros, lista, cards, paginação e as quatro ações", () => {
    expect(source).toContain("Buscar por nome, CNPJ, CPF ou responsável...");
    expect(source).toContain('type ViewMode = "list" | "cards"');
    expect(source).toContain("Tipo de pessoa");
    expect(source).toContain("Situação");
    expect(source).toContain('label="Ver"');
    expect(source).toContain('label="Duplicar"');
    expect(source).toContain('label="Editar"');
    expect(source).toContain('label="Excluir"');
    expect(source).toContain("data-customers-list-footer");
    expect(source).toContain("{visible} de {total}");
    expect(source).toContain('className="h-8 w-20 text-xs sm:w-24"');
    expect(source).toContain('variant="ghost"');
  });

  it("mantém o cadastro responsivo com Geral, Filiais, Departamentos e Contatos", () => {
    expect(source).toContain('["general", "Geral"]');
    expect(source).toContain('["branches", "Filiais"]');
    expect(source).toContain('["departments", "Departamentos"]');
    expect(source).toContain('["contacts", "Contatos"]');
    expect(source).toContain("Adicionar endereço completo");
    expect(source).toContain("<CountryCodeSelect");
    expect(source).toContain('className="sm:col-span-2"');
    expect(source).toContain("https://viacep.com.br/ws/");
    expect(source).toContain('aria-label="Buscar CEP"');
    expect(source).toContain("Visualizar Cliente");
    expect(source).toContain("crmApi.listCustomerContacts");
    expect(source).toContain("crmApi.createCustomerBranch");
    expect(source).toContain("crmApi.updateCustomerBranch");
    expect(source).toContain("deleteCustomerBranch");
    expect(source).toContain("crmApi.createCustomerDepartment");
    expect(source).toContain("crmApi.updateCustomerDepartment");
    expect(source).toContain("deleteCustomerDepartment");
    expect(source).toContain("Selecione o gestor do departamento.");
  });

  it("permite criar, editar e convidar contatos do cliente", () => {
    expect(source).toContain("crmApi.createContact");
    expect(source).toContain("crmApi.updateContact");
    expect(source).toContain("inviteCustomerContact");
    expect(source).toContain("Salvar e enviar acesso");
    expect(source).toContain("{initial ? (");
    expect(source).toContain('className="justify-self-start"');
    expect(source).toContain('value: "COLLABORATOR"');
    expect(source).toContain('value: "MANAGER"');
    expect(source).toContain('value: "FULL_ACCESS"');
    expect(source).toContain('label="WhatsApp *"');
    expect(source).toContain('label="Filial"');
    expect(source).toContain('label="Departamento"');
  });
});
