import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Input, Select } from "@/components/ui-kit";
import {
  crmApi,
  organizationApi,
  type ApiConversationStatus,
  type OperationalPeriod,
} from "@/lib/nexos-api";
import type { OperationalReportFilters } from "@/lib/operational-filters";
import { sortByOptionLabel } from "@/lib/sort-options";

const PERIOD_OPTIONS: { value: OperationalPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Ultimos 7 dias" },
  { value: "30d", label: "Ultimos 30 dias" },
];

const STATUS_OPTIONS: { value: ApiConversationStatus; label: string }[] = [
  { value: "aberta", label: "Aberta" },
  { value: "em_andamento", label: "Em atendimento" },
  { value: "aguardando", label: "Aguardando" },
  { value: "fechada", label: "Fechada" },
];

export function ReportFiltersBar({
  value,
  onChange,
}: {
  value: OperationalReportFilters;
  onChange: (patch: Partial<OperationalReportFilters>) => void;
}) {
  const { data: customers } = useQuery({
    queryKey: ["operations", "filters", "customers"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["operations", "filters", "departments"],
    queryFn: organizationApi.listDepartments,
  });
  const sortedCustomers = React.useMemo(
    () => sortByOptionLabel(customers?.items ?? [], (customer) => customer.nome),
    [customers?.items],
  );
  const sortedDepartments = React.useMemo(
    () => sortByOptionLabel(departments, (department) => department.name),
    [departments],
  );

  return (
    <Card className="mb-6 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Periodo
          </label>
          <Select
            value={value.period}
            onChange={(e) => onChange({ period: e.target.value as OperationalPeriod })}
          >
            {PERIOD_OPTIONS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Status
          </label>
          <Select
            value={value.status ?? ""}
            onChange={(e) =>
              onChange({ status: (e.target.value || undefined) as ApiConversationStatus })
            }
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Cliente
          </label>
          <Select
            value={value.customerId ?? ""}
            onChange={(e) => onChange({ customerId: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {sortedCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.nome}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Departamento
          </label>
          <Select
            value={value.departmentId ?? ""}
            onChange={(e) => onChange({ departmentId: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {sortedDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Busca
          </label>
          <Input
            value={value.q ?? ""}
            onChange={(e) => onChange({ q: e.target.value || undefined })}
            placeholder="Protocolo, contato..."
          />
        </div>
      </div>
    </Card>
  );
}
