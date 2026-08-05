import type { ApiConversationStatus, OperationalPeriod } from "@/lib/nexos-api";

export type OperationalReportFilters = {
  period: OperationalPeriod;
  q?: string;
  departmentId?: string;
  status?: ApiConversationStatus;
  customerId?: string;
};

export const DEFAULT_OPERATIONAL_FILTERS: OperationalReportFilters = {
  period: "30d",
};
