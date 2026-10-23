import type { ApiContact, ApiCustomerBranch, ApiCustomerDepartment } from "@/lib/trixus-api";

export type TicketContactRequirement = {
  key: "customer" | "department" | "branch" | "requester";
  label: "Cliente" | "Departamento" | "Filial" | "Solicitante";
  complete: boolean;
  value: string;
};

export function ticketContactRequirements(
  contact: ApiContact | null | undefined,
  branches: ApiCustomerBranch[] = [],
  departments: ApiCustomerDepartment[] = [],
): TicketContactRequirement[] {
  const branch = branches.find(
    (item) => item.id === contact?.customerBranchId && item.customerId === contact?.customer_id,
  );
  const department = departments.find(
    (item) => item.id === contact?.customerDepartmentId && item.customerId === contact?.customer_id,
  );

  return [
    {
      key: "customer",
      label: "Cliente",
      complete: Boolean(contact?.customer_id),
      value: contact?.customer?.nome ?? "Não configurado",
    },
    {
      key: "department",
      label: "Departamento",
      complete: Boolean(department?.active),
      value: department?.active ? department.name : "Não configurado ou inativo",
    },
    {
      key: "branch",
      label: "Filial",
      complete: branch?.status === "ACTIVE",
      value: branch?.status === "ACTIVE" ? branch.name : "Não configurada ou inativa",
    },
    {
      key: "requester",
      label: "Solicitante",
      complete: Boolean(contact?.id && contact.active),
      value: contact?.id && contact.active ? contact.nome : "Contato não informado ou inativo",
    },
  ];
}
