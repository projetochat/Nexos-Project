import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Input, Select } from "@/components/ui-kit";
import { connectionsApi, crmApi, organizationApi, type OperationalPeriod } from "@/lib/nexos-api";
import {
  datesForOperationalPeriod,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { sortByOptionLabel } from "@/lib/sort-options";

const PERIOD_OPTIONS: Array<{ value: OperationalPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "week", label: "Essa semana" },
  { value: "month", label: "Esse mês" },
  { value: "previous_month", label: "Mês passado" },
  { value: "year", label: "Esse ano" },
  { value: "custom", label: "Personalizado" },
];

export function DashboardFiltersBar({
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
  const { data: connections = [] } = useQuery({
    queryKey: ["operations", "filters", "connections"],
    queryFn: connectionsApi.list,
  });
  const sortedCustomers = React.useMemo(
    () => sortByOptionLabel(customers?.items ?? [], (customer) => customer.nome),
    [customers?.items],
  );
  const sortedDepartments = React.useMemo(
    () => sortByOptionLabel(departments, (department) => department.name),
    [departments],
  );
  const sortedConnections = React.useMemo(
    () => sortByOptionLabel(connections, (connection) => connection.name),
    [connections],
  );
  const automaticDates = datesForOperationalPeriod(value.period);
  const isCustom = value.period === "custom";
  const start = value.start ?? automaticDates.start;
  const end = value.end ?? automaticDates.end;

  return (
    <Card className="mb-6 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_1.1fr_1.15fr_0.82fr_0.82fr]">
        <FilterField label="Instância">
          <Select
            value={value.connectionId ?? ""}
            onChange={(event) => onChange({ connectionId: event.target.value || undefined })}
          >
            <option value="">Todas</option>
            {sortedConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Cliente">
          <Select
            value={value.customerId ?? ""}
            onChange={(event) => onChange({ customerId: event.target.value || undefined })}
          >
            <option value="">Todos</option>
            {sortedCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.nome}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Departamento">
          <Select
            value={value.departmentId ?? ""}
            onChange={(event) => onChange({ departmentId: event.target.value || undefined })}
          >
            <option value="">Todos</option>
            {sortedDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Período">
          <Select
            value={value.period}
            onChange={(event) => {
              const period = event.target.value as OperationalPeriod;
              const dates = datesForOperationalPeriod(period);
              onChange({ period, start: dates.start, end: dates.end });
            }}
          >
            {PERIOD_OPTIONS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Dt. inicial" className="min-w-0">
          <Input
            type="date"
            value={start}
            readOnly={!isCustom}
            aria-readonly={!isCustom}
            onChange={(event) => onChange({ start: event.target.value })}
            className={`min-w-0 px-2 text-right text-xs sm:px-3 sm:text-sm ${!isCustom ? "cursor-not-allowed text-muted-foreground" : ""}`}
          />
        </FilterField>
        <FilterField label="Dt. final" className="min-w-0">
          <Input
            type="date"
            value={end}
            readOnly={!isCustom}
            aria-readonly={!isCustom}
            onChange={(event) => onChange({ end: event.target.value })}
            className={`min-w-0 px-2 text-right text-xs sm:px-3 sm:text-sm ${!isCustom ? "cursor-not-allowed text-muted-foreground" : ""}`}
          />
        </FilterField>
      </div>
    </Card>
  );
}

function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
