import type { ApiConversationStatus, OperationalPeriod } from "@/lib/trixus-api";

export type OperationalReportFilters = {
  period: OperationalPeriod;
  q?: string;
  departmentId?: string;
  status?: ApiConversationStatus;
  customerId?: string;
  connectionId?: string;
  start?: string;
  end?: string;
};

export const DEFAULT_OPERATIONAL_FILTERS: OperationalReportFilters = {
  period: "30d",
};

export const DASHBOARD_PERIOD_OPTIONS: Array<{ value: OperationalPeriod; label: string }> = [
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

function dateValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

export function datesForOperationalPeriod(period: OperationalPeriod) {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  start.setHours(0, 0, 0, 0);

  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (period === "week") {
    start.setDate(start.getDate() - start.getDay());
  } else if (period === "previous_week") {
    const daysSinceSunday = start.getDay();
    start.setDate(start.getDate() - daysSinceSunday - 7);
    end.setDate(end.getDate() - daysSinceSunday - 1);
  } else if (period === "month") {
    start.setDate(1);
  } else if (period === "previous_month") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  } else if (period === "year") {
    start.setMonth(0, 1);
  } else if (period === "previous_year") {
    start.setFullYear(start.getFullYear() - 1, 0, 1);
    end.setFullYear(end.getFullYear() - 1, 11, 31);
  }

  return { start: dateValue(start), end: dateValue(end) };
}
