import type { DashboardComponentConfig } from "@/lib/dashboard-components";
import { apiRequest, type OperationalPeriod } from "@/lib/trixus-api";

export type PlatformDashboardFilters = {
  clientId?: string;
  tenantId?: string;
  period: OperationalPeriod;
  start?: string;
  end?: string;
};

export type PlatformLoginEnvironments = {
  local: number;
  homologation: number;
  production: number;
};

export type PlatformLoginAggregation = {
  status: "disabled" | "available" | "unavailable" | "ambiguous";
  updatedAt?: string | null;
};

export type PlatformClientVolumetryCounts = {
  logins: number | null;
  instances: number;
  contacts: number;
  attendants: number;
  accessProfiles: number;
  departments: number;
  tags: number;
  quickReplies: number;
  customFields: number;
  schedules: number;
  campaigns: number;
};

export type PlatformClientVolumetryRow = PlatformClientVolumetryCounts & {
  clientId: string | null;
  clientName: string;
  loginEnvironments?: PlatformLoginEnvironments | null;
};

export type PlatformDashboardResponse = {
  range: { start: string; end: string; timezone: string };
  filters: {
    clients: Array<{ id: string; name: string; tenantId: string | null }>;
    tenants: Array<{
      id: string;
      name: string;
      clientId: string | null;
      clientName: string | null;
    }>;
  };
  kpis: {
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    activeUsers: number;
    activeInstances: number;
    messagesThisPeriod: number;
    campaignsThisPeriod: number;
    openInvoices: number;
  };
  charts: {
    messagesByHour: Array<{
      hora: string;
      recebidas: number;
      enviadas: number;
      total: number;
      contatosAtendidos: number;
      atendimentos: number;
    }>;
    messageContactsTotal: number;
    messageAttendancesTotal: number;
    messageVolumeByClient: Array<{ clientId: string | null; clientName: string; total: number }>;
    messagePercentageByClient: Array<{
      clientId: string | null;
      clientName: string;
      total: number;
      percentage: number;
    }>;
  };
  subscriptionsByPlan: Array<{
    planId: string;
    code: string;
    name: string;
    subscriptions: number;
  }>;
  operation: { openTickets: number; openInvoices: number; overdueInvoices: number };
  clientVolumetry: {
    rows: PlatformClientVolumetryRow[];
    totals: PlatformClientVolumetryCounts & {
      loginEnvironments?: PlatformLoginEnvironments | null;
    };
    loginAggregation?: PlatformLoginAggregation;
  };
  semantics: Record<string, unknown>;
};

export type PlatformDashboardConfiguration = {
  schemaVersion: 1;
  components: Array<DashboardComponentConfig & { order: number }>;
};

export type PlatformDashboardConfigurationResponse = {
  configuration: PlatformDashboardConfiguration;
  version: number;
  updatedAt: string | null;
  canUpdate: boolean;
};

function queryString(params: PlatformDashboardFilters) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const platformDashboardApi = {
  dashboard: (filters: PlatformDashboardFilters) =>
    apiRequest<PlatformDashboardResponse>(`/platform/dashboard${queryString(filters)}`),
  configuration: () =>
    apiRequest<PlatformDashboardConfigurationResponse>("/platform/dashboard/configuration"),
  updateConfiguration: (configuration: PlatformDashboardConfiguration, version: number) =>
    apiRequest<PlatformDashboardConfigurationResponse>("/platform/dashboard/configuration", {
      method: "PUT",
      body: JSON.stringify({ configuration, version }),
    }),
};
