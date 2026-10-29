import type { OperationalPeriod } from "@/lib/trixus-api";
import { datesForOperationalPeriod } from "@/lib/operational-filters";
import type { PlatformDashboardFilters } from "@/lib/platform-dashboard-api";

const periods = new Set<OperationalPeriod>([
  "today",
  "yesterday",
  "week",
  "previous_week",
  "month",
  "previous_month",
  "year",
  "previous_year",
  "custom",
]);

export type PlatformDashboardSearch = {
  clientId?: string;
  tenantId?: string;
  period?: OperationalPeriod;
  start?: string;
  end?: string;
};

export function normalizePlatformDashboardSearch(
  search: Record<string, unknown>,
): PlatformDashboardSearch {
  const period = periods.has(search.period as OperationalPeriod)
    ? (search.period as OperationalPeriod)
    : undefined;
  return {
    clientId: nonEmptyString(search.clientId),
    tenantId: nonEmptyString(search.tenantId),
    period: period === "today" ? undefined : period,
    start: period === "custom" ? isoDate(search.start) : undefined,
    end: period === "custom" ? isoDate(search.end) : undefined,
  };
}

export function platformDashboardFiltersFromSearch(
  search: PlatformDashboardSearch,
): PlatformDashboardFilters {
  const period = search.period ?? "today";
  const automaticDates = datesForOperationalPeriod(period);
  return {
    clientId: search.clientId,
    tenantId: search.tenantId,
    period,
    start: period === "custom" ? (search.start ?? automaticDates.start) : automaticDates.start,
    end: period === "custom" ? (search.end ?? automaticDates.end) : automaticDates.end,
  };
}

export function platformDashboardSearchFromFilters(
  filters: PlatformDashboardFilters,
): PlatformDashboardSearch {
  return {
    clientId: nonEmptyString(filters.clientId),
    tenantId: nonEmptyString(filters.tenantId),
    period: filters.period === "today" ? undefined : filters.period,
    start: filters.period === "custom" ? isoDate(filters.start) : undefined,
    end: filters.period === "custom" ? isoDate(filters.end) : undefined,
  };
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}
