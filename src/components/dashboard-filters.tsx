import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Input, InstanceFilterSelect, Select } from "@/components/ui-kit";
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.1fr_1.1fr_1.1fr_1.15fr_0.82fr_0.82fr]">
        <FilterField label="Instância">
          <InstanceFilterSelect
            value={value.connectionId ?? ""}
            onChange={(connectionId) => onChange({ connectionId: connectionId || undefined })}
            options={sortedConnections.map((connection) => ({
              value: connection.id,
              label: connection.name,
              color: connection.color,
            }))}
          />
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
        <FilterField label="Dt. Inicial" className="min-w-0">
          <DashboardDateInput
            value={start}
            readOnly={!isCustom}
            onChange={(date) => onChange({ start: date })}
          />
        </FilterField>
        <FilterField label="Dt. Final" className="min-w-0">
          <DashboardDateInput
            value={end}
            readOnly={!isCustom}
            onChange={(date) => onChange({ end: date })}
          />
        </FilterField>
      </div>
    </Card>
  );
}

function DashboardDateInput({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (date: string) => void;
}) {
  const isMobile = useMobileViewport();
  const [draft, setDraft] = React.useState(() => formatDateMask(value));

  React.useEffect(() => setDraft(formatDateMask(value)), [value]);

  const className = `dashboard-date-input min-w-0 px-2 text-center text-xs sm:px-3 sm:text-sm ${
    readOnly ? "cursor-not-allowed text-muted-foreground" : ""
  }`;

  if (!isMobile) {
    return (
      <Input
        type="date"
        value={value}
        readOnly={readOnly}
        aria-readonly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
    );
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA"
      value={draft}
      readOnly={readOnly}
      aria-readonly={readOnly}
      onChange={(event) => {
        const next = maskDate(event.target.value);
        setDraft(next);
        const isoDate = dateMaskToIso(next);
        if (isoDate) onChange(isoDate);
      }}
      onBlur={() => setDraft(formatDateMask(value))}
      className={className}
    />
  );
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function formatDateMask(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function dateMaskToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
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
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
