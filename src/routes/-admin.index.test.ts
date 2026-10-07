import { describe, expect, it } from "vitest";
import type { PlatformDashboardResponse } from "@/lib/platform-dashboard-api";
import {
  DEFAULT_PLATFORM_DASHBOARD_COMPONENTS,
  platformGroupingOptions,
  resolvePlatformData,
} from "./admin.index";

const dashboard: PlatformDashboardResponse = {
  range: { start: "2026-10-01", end: "2026-10-07", timezone: "America/Sao_Paulo" },
  filters: { clients: [], tenants: [] },
  kpis: {
    activeTenants: 3,
    trialTenants: 1,
    suspendedTenants: 0,
    activeUsers: 9,
    activeInstances: 4,
    messagesThisPeriod: 30,
    campaignsThisPeriod: 2,
    openInvoices: 1,
  },
  charts: {
    messagesByHour: [
      { hora: "00h", recebidas: 2, enviadas: 3, total: 5, contatosAtendidos: 1, atendimentos: 1 },
    ],
    messageContactsTotal: 1,
    messageAttendancesTotal: 1,
    messageVolumeByClient: [
      { clientId: "a", clientName: "Cliente A", total: 20 },
      { clientId: null, clientName: "Sem cliente", total: 10 },
    ],
    messagePercentageByClient: [
      { clientId: "a", clientName: "Cliente A", total: 20, percentage: 66.67 },
      { clientId: null, clientName: "Sem cliente", total: 10, percentage: 33.33 },
    ],
  },
  subscriptionsByPlan: [{ planId: "p", code: "pro", name: "Pro", subscriptions: 2 }],
  operation: { openTickets: 4, openInvoices: 1, overdueInvoices: 0 },
  semantics: {},
};

describe("Platform dashboard presentation contract", () => {
  it("uses the expected shared configurable component catalog", () => {
    expect(DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.map((item) => item.id)).toEqual([
      "kpis",
      "traffic",
      "volumeByClient",
      "percentageByClient",
      "subscriptions",
      "operation",
    ]);
    expect(platformGroupingOptions("messages").map((item) => item.value)).toEqual([
      "hour",
      "clientVolume",
      "clientPercentage",
    ]);
  });

  it("keeps every client, including tenants without a client, in volume and percentage data", () => {
    const volume = DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.find(
      (item) => item.id === "volumeByClient",
    )!;
    const percentage = DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.find(
      (item) => item.id === "percentageByClient",
    )!;
    expect(resolvePlatformData(volume, dashboard)).toEqual([
      { nome: "Cliente A", total: 20 },
      { nome: "Sem cliente", total: 10 },
    ]);
    expect(resolvePlatformData(percentage, dashboard)).toHaveLength(2);
  });

  it("uses active instances instead of the legacy active connections metric", () => {
    const kpis = DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.find((item) => item.id === "kpis")!;
    expect(resolvePlatformData(kpis, dashboard)).toContainEqual({ nome: "Instâncias", total: 4 });
  });
});
