import { describe, expect, it } from "vitest";
import type { ApiContact, ApiCustomerBranch, ApiCustomerDepartment } from "@/lib/trixus-api";
import { ticketContactRequirements } from "@/lib/ticket-contact-readiness";

const contact = {
  id: "contact-1",
  nome: "Douglas Rezende",
  active: true,
  customer_id: "customer-1",
  customer: { id: "customer-1", nome: "Cliente Exemplo", cor: "#000000" },
  customerBranchId: "branch-1",
  customerDepartmentId: "department-1",
} as ApiContact;

const branch = {
  id: "branch-1",
  customerId: "customer-1",
  name: "Matriz",
  status: "ACTIVE",
} as ApiCustomerBranch;

const department = {
  id: "department-1",
  customerId: "customer-1",
  name: "Tecnologia",
  active: true,
} as ApiCustomerDepartment;

describe("verificação do contato antes da abertura de chamado", () => {
  it("aprova somente quando cliente, departamento, filial e solicitante estão válidos", () => {
    const requirements = ticketContactRequirements(contact, [branch], [department]);

    expect(requirements.map((item) => item.label)).toEqual([
      "Cliente",
      "Departamento",
      "Filial",
      "Solicitante",
    ]);
    expect(requirements.every((item) => item.complete)).toBe(true);
  });

  it("bloqueia departamento e filial inativos ou pertencentes a outro cliente", () => {
    const requirements = ticketContactRequirements(
      contact,
      [{ ...branch, status: "INACTIVE" }],
      [{ ...department, customerId: "customer-2" }],
    );

    expect(requirements.find((item) => item.key === "department")?.complete).toBe(false);
    expect(requirements.find((item) => item.key === "branch")?.complete).toBe(false);
  });
});
