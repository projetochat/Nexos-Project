import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PlatformDashboardResponse } from "@/lib/platform-dashboard-api";
import {
  DEFAULT_PLATFORM_DASHBOARD_COMPONENTS,
  platformGroupingOptions,
  resolvePlatformData,
} from "./admin.index";

const dashboardSource = readFileSync(new URL("./admin.index.tsx", import.meta.url), "utf8");

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
  clientVolumetry: {
    rows: [
      {
        clientId: "a",
        clientName: "Cliente A",
        instances: 3,
        contacts: 10,
        attendants: 2,
        accessProfiles: 2,
        departments: 4,
        tags: 5,
        quickReplies: 6,
        customFields: 7,
        schedules: 8,
        campaigns: 9,
      },
    ],
    totals: {
      instances: 3,
      contacts: 10,
      attendants: 2,
      accessProfiles: 2,
      departments: 4,
      tags: 5,
      quickReplies: 6,
      customFields: 7,
      schedules: 8,
      campaigns: 9,
    },
  },
  semantics: {},
};

describe("Platform dashboard presentation contract", () => {
  it("uses the expected shared configurable component catalog", () => {
    expect(DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.map((item) => item.id)).toEqual([
      "kpis",
      "traffic",
      "clientVolumetry",
      "volumeByClient",
      "percentageByClient",
      "subscriptions",
      "operation",
    ]);
    expect(
      DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.map(({ id, columns }) => ({ id, columns })),
    ).toEqual([
      { id: "kpis", columns: 4 },
      { id: "traffic", columns: 2 },
      { id: "clientVolumetry", columns: 2 },
      { id: "volumeByClient", columns: 1 },
      { id: "percentageByClient", columns: 1 },
      { id: "subscriptions", columns: 1 },
      { id: "operation", columns: 1 },
    ]);
    expect(platformGroupingOptions("messages").map((item) => item.value)).toEqual([
      "hour",
      "clientVolume",
      "clientPercentage",
    ]);
    expect(platformGroupingOptions("records").map((item) => item.value)).toContain(
      "clientVolumetry",
    );
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

  it("exposes consolidated volumetry data to the Dashboard configuration", () => {
    const volumetry = DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.find(
      (item) => item.id === "clientVolumetry",
    )!;
    expect(resolvePlatformData(volumetry, dashboard)).toEqual([{ nome: "Cliente A", total: 56 }]);
  });

  it("shows platform KPI counters in two columns on mobile", () => {
    expect(dashboardSource).toContain('className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"');
  });

  it("shows only the dashboard settings gear on mobile and keeps the desktop label", () => {
    expect(dashboardSource).toContain('className="max-sm:!w-9 max-sm:!px-0"');
    expect(dashboardSource).toContain('aria-label="Config. Dashboard"');
    expect(dashboardSource).toContain('<Settings className="h-4 w-4" />');
    expect(dashboardSource).toContain('<span className="hidden sm:inline">Config. Dashboard</span>');
  });

  it("wraps visible dashboard components with the hover-only maximize control", () => {
    expect(dashboardSource).toContain("<DashboardMaximizeFrame title={config.title}>");
    expect(dashboardSource).toContain("<PlatformDashboardComponent");
  });
});
