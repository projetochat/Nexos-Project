import { selectableConnections } from "@/lib/connection-options";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FilterX } from "lucide-react";
import {
  Button,
  Card,
  Input,
  InstanceFilterSelect,
  SearchInput,
  Select,
} from "@/components/ui-kit";
import { connectionsApi, crmApi, organizationApi, type OperationalPeriod } from "@/lib/trixus-api";
import {
  datesForOperationalPeriod,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { todayDateValue, shouldFillTodayFromShortcut } from "@/lib/date-shortcuts";
import { sortByOptionLabel } from "@/lib/sort-options";

const PERIOD_OPTIONS: Array<{ value: OperationalPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "week", label: "Essa semana" },
  { value: "previous_week", label: "Semana passada" },
  { value: "month", label: "Esse mês" },
  { value: "previous_month", label: "Mês passado" },
  { value: "year", label: "Esse ano" },
  { value: "previous_year", label: "Ano passado" },
  { value: "custom", label: "Personalizado" },
];

export function DashboardFiltersBar({
  value,
  onChange,
  showDepartment = true,
  search,
  onClear,
  className = "mb-6",
}: {
  value: OperationalReportFilters;
  onChange: (patch: Partial<OperationalReportFilters>) => void;
  showDepartment?: boolean;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  onClear?: () => void;
  className?: string;
}) {
  const { data: customers } = useQuery({
    queryKey: ["operations", "filters", "customers"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["operations", "filters", "departments"],
    queryFn: organizationApi.listDepartments,
    enabled: showDepartment,
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
    () => sortByOptionLabel(selectableConnections(connections), (connection) => connection.name),
    [connections],
  );
  const automaticDates = datesForOperationalPeriod(value.period);
  const isCustom = value.period === "custom";
  const start = value.start ?? automaticDates.start;
  const end = value.end ?? automaticDates.end;
  const defaultDates = datesForOperationalPeriod("today");
  const showClear = Boolean(
    onClear &&
    (search?.value.trim() ||
      value.q?.trim() ||
      value.connectionId ||
      value.customerId ||
      value.departmentId ||
      value.period !== "today" ||
      start !== defaultDates.start ||
      end !== defaultDates.end),
  );
  const gridClass =
    search && !showDepartment
      ? showClear
        ? "xl:grid-cols-[minmax(220px,3fr)_1fr_1fr_1.1fr_1fr_1fr_auto]"
        : "xl:grid-cols-[minmax(220px,3fr)_1fr_1fr_1.1fr_1fr_1fr]"
      : showClear
        ? "lg:grid-cols-[1.1fr_1.1fr_1.1fr_1.15fr_0.82fr_0.82fr_auto]"
        : "lg:grid-cols-[1.1fr_1.1fr_1.1fr_1.15fr_0.82fr_0.82fr]";

  return (
    <Card className={`p-4 ${className}`}>
      <div className={`grid grid-cols-2 gap-3 ${gridClass}`}>
        {search && (
          <FilterField label="Busca" className="col-span-2 min-w-0 xl:col-span-1">
            <SearchInput {...search} />
          </FilterField>
        )}
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
        {showDepartment && (
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
        )}
        <FilterField label="Período">
          <Select
            value={value.period}
            onChange={(event) => {
              const period = event.target.value as OperationalPeriod;
              const dates =
                period === "custom" ? { start, end } : datesForOperationalPeriod(period);
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
        {showClear && (
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClear}
              title="Limpar filtros"
              aria-label="Limpar filtros"
              className="min-h-10 w-10 px-0"
            >
              <FilterX className="h-4 w-4" />
            </Button>
          </div>
        )}
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
  const nativeDateInputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(() => formatDateMask(value));

  React.useEffect(() => setDraft(formatDateMask(value)), [value]);

  const className = `dashboard-date-input min-w-0 px-2 text-center text-xs sm:px-3 sm:text-sm ${
    readOnly ? "cursor-not-allowed text-muted-foreground" : ""
  }`;
  const openNativePicker = () => {
    const input = nativeDateInputRef.current;
    if (!input || readOnly) return;
    input.focus({ preventScroll: true });
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch {
      // Some mobile browsers only allow the native date control to open from a direct touch.
      input.click();
    }
  };

  if (!isMobile) {
    return (
      <div className="relative min-w-0">
        <Input
          ref={nativeDateInputRef}
          type="date"
          value={value}
          readOnly={readOnly}
          aria-readonly={readOnly}
          onClick={(event) => {
            if (readOnly) event.preventDefault();
          }}
          onChange={(event) => onChange(event.target.value)}
          className={`${className} pr-9 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0`}
        />
        <button
          type="button"
          disabled={readOnly}
          title={
            readOnly ? "Selecione o período personalizado para alterar a data" : "Selecionar data"
          }
          aria-label="Selecionar data"
          onClick={openNativePicker}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        value={draft}
        readOnly={readOnly}
        aria-readonly={readOnly}
        onKeyDown={(event) => {
          if (readOnly || !shouldFillTodayFromShortcut(event.nativeEvent)) return;
          event.preventDefault();
          const today = todayDateValue();
          setDraft(formatDateMask(today));
          onChange(today);
        }}
        onChange={(event) => {
          const next = maskDate(event.target.value);
          setDraft(next);
          const isoDate = dateMaskToIso(next);
          if (isoDate) onChange(isoDate);
        }}
        onBlur={() => setDraft(formatDateMask(value))}
        className={`${className} pr-9`}
      />
      <span
        title={
          readOnly ? "Selecione o período personalizado para alterar a data" : "Selecionar data"
        }
        aria-hidden="true"
        className={`pointer-events-none absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground ${
          readOnly ? "opacity-40" : ""
        }`}
      >
        <CalendarDays className="h-4 w-4" strokeWidth={2} />
      </span>
      <input
        ref={nativeDateInputRef}
        type="date"
        value={value}
        disabled={readOnly}
        tabIndex={-1}
        aria-label="Selecionar data"
        onChange={(event) => onChange(event.target.value)}
        className="absolute right-1 top-1/2 z-10 h-8 w-8 -translate-y-1/2 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
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
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
