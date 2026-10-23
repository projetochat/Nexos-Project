import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");

describe("unificação do departamento do contato com o cliente", () => {
  it("keeps one contact department field and requires a selected company", () => {
    expect(source.match(/<Field label="Departamento do Contato">/g)).toHaveLength(1);
    expect(source).not.toContain('<Field label="Departamento do Cliente">');
    expect(source).toContain("disabled={!customerId || customerDepartments.isLoading}");
    expect(source).toContain('"Selecione uma empresa primeiro"');
    expect(source).toContain("disabled={!clienteFilter || clienteFilter === EMPTY_FILTER_VALUE}");
  });

  it("clears dependent links whenever the company changes", () => {
    expect(source).toContain('setCustomerBranchId("")');
    expect(source).toContain('setCustomerDepartmentId("")');
  });

  it("uses customer departments in bulk update and import", () => {
    expect(source).toContain('customerDepartmentId: bulkMode === "department"');
    expect(source).toContain("crmApi.createCustomerDepartment(customer.id");
    expect(source).toContain("customerDepartmentId: department?.id ?? null");
    expect(source).toContain("Empresa obrigatória para o departamento");
    expect(source).toContain("customerDepartmentId: departamentoFilter");
    expect(source).toContain("trixus.contacts.filters.v2.");
    expect(source).not.toContain("crmApi.createContactDepartment({ name: cleanName })");
  });
});
