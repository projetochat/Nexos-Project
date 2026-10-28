// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  configuration: vi.fn(),
  dashboard: vi.fn(),
  componentData: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: React.ComponentType }) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "synthetic-dashboard-user", role: "admin", permissions: [] } }),
}));
vi.mock("@/lib/realtime/client", () => ({ onRealtimeEvent: () => () => {} }));
vi.mock("@/lib/trixus-api", async (original) => {
  const actual = await original<typeof import("@/lib/trixus-api")>();
  return {
    ...actual,
    operationsApi: {
      ...actual.operationsApi,
      dashboardConfiguration: api.configuration,
      dashboard: api.dashboard,
      dashboardComponentData: api.componentData,
      updateDashboardConfiguration: api.save,
    },
    crmApi: {
      ...actual.crmApi,
      listContactCustomFields: vi.fn(async () => []),
      listCustomers: vi.fn(async () => ({ items: [] })),
    },
    organizationApi: { ...actual.organizationApi, listChatDepartments: vi.fn(async () => []) },
    connectionsApi: { ...actual.connectionsApi, listChatScope: vi.fn(async () => []) },
  };
});
import { Route } from "./index";
const Dashboard = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;
const rankTitle = "Top 10 contatos que mais abrem conversas";
const contacts = Array.from({ length: 10 }, (_, index) => ({
  nome: `Contato sintético ${String(index + 1).padStart(2, "0")}`,
  total: 20 - index,
}));
const kpi = (value: number) => ({ value, previous: null, changePercent: null });
const dashboardData = {
  kpis: {
    contadorAtivasAtuais: kpi(10),
    contadorStandbyAtual: kpi(5),
    contadorFilaAtual: kpi(3),
    contadorLeadsAtuais: kpi(0),
    conversasEncerradas: kpi(26),
    // This API metric belongs to the selected period and must not replace the sum shown by the cards.
    conversasTotalPeriodo: kpi(33),
    conversasTotalAtual: kpi(33),
  },
  charts: {
    byDepartment: [],
    byAgent: [],
    byCustomer: [],
    byConnection: [],
    byTag: [],
    messagesByHour: [],
    messageAttendancesTotal: 0,
    messageContactsTotal: 0,
  },
  recent: [],
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let finishDashboard: (value: typeof dashboardData) => void;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated Dashboard render");
    }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  localStorage.clear();
  localStorage.setItem(
    "trixus.dashboard.filters.synthetic-dashboard-user",
    JSON.stringify({ period: "custom", start: "2026-10-01", end: "2026-10-28" }),
  );
  api.configuration.mockReset().mockResolvedValue({
    configuration: {
      version: 2,
      nativeRevision: 4,
      components: [
        {
          id: "counters",
          title: "Contadores de registro",
          visible: true,
          visualization: "cards",
          columns: 4,
          dataSource: "records",
          groupBy: "queue",
          valueMode: "count",
        },
        {
          id: "ticketRequesterRanking",
          title: "Top 10 contatos que abriram chamados",
          visible: true,
          visualization: "table",
          columns: 1,
          dataSource: "records",
          groupBy: "ticketRequesterContact",
          valueMode: "count",
        },
      ],
    },
    updatedAt: "2026-10-28T12:00:00Z",
  });
  api.dashboard.mockReset().mockReturnValue(
    new Promise<typeof dashboardData>((resolve) => {
      finishDashboard = resolve;
    }),
  );
  api.componentData.mockReset().mockImplementation(async ({ groupBy }: { groupBy: string }) => ({
    items:
      groupBy === "conversationContact"
        ? contacts
        : [{ nome: "Solicitante de chamado sintético", total: 999 }],
  }));
  api.save.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  host.remove();
  localStorage.clear();
  expect(fetch).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function renderDashboard() {
  await (Dashboard as React.ComponentType & { preload?: () => Promise<unknown> }).preload?.();
  await React.act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Dashboard />
      </QueryClientProvider>,
    ),
  );
  await React.act(async () => {
    await settle();
    await settle();
  });
  await React.act(async () => {
    finishDashboard(dashboardData);
    await settle();
    await settle();
  });
}
const cardValue = (label: string) =>
  [...host.querySelectorAll("p")].find((node) => node.textContent === label)?.nextElementSibling
    ?.textContent;
async function click(element: HTMLElement | null) {
  expect(element).not.toBeNull();
  await React.act(async () => {
    element!.click();
    await settle();
  });
}

it("renders Total 44 from the six visible counters and all ten conversation contacts instead of ticket requesters", async () => {
  await renderDashboard();
  expect(["Ativas", "Stand By", "Fila", "Leads", "Fechadas", "Total"].map(cardValue)).toEqual([
    "10",
    "5",
    "3",
    "0",
    "26",
    "44",
  ]);
  expect(cardValue("Total")).not.toBe("33");
  expect(host.textContent).toContain(rankTitle);
  expect(host.textContent).not.toContain("Top 10 contatos que abriram chamados");
  const rows = [...host.querySelectorAll("table tbody tr")];
  expect(rows).toHaveLength(10);
  expect(rows.map((row) => row.querySelector("td")?.textContent?.trim())).toEqual(
    contacts.map((item) => item.nome),
  );
  expect(rows.map((row) => row.querySelectorAll("td")[1]?.textContent)).toEqual(
    contacts.map((item) => String(item.total)),
  );
  expect(host.textContent).not.toContain("Solicitante de chamado sintético");
  expect(api.dashboard).toHaveBeenLastCalledWith(
    expect.objectContaining({ period: "custom", start: "2026-10-01", end: "2026-10-28" }),
  );
  expect(api.componentData).toHaveBeenCalledWith(
    expect.objectContaining({
      groupBy: "conversationContact",
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-28",
    }),
  );
  expect(
    api.componentData.mock.calls.every(([query]) => query.groupBy === "conversationContact"),
  ).toBe(true);
  expect(api.componentData.mock.calls.every(([query]) => !Object.hasOwn(query, "status"))).toBe(
    true,
  );
});

it("keeps ten conversation contacts in the real table renderer inside the editor preview", async () => {
  await renderDashboard();
  await click(host.querySelector('[aria-label="Config. Dashboard"]'));
  await click(document.querySelector(`[aria-label="Editar ${rankTitle}"]`));
  const preview = document.querySelector('[aria-label="Preview"]');
  expect(preview).not.toBeNull();
  const rows = [...preview!.querySelectorAll("table tbody tr")];
  expect(rows).toHaveLength(10);
  expect(rows.map((row) => row.querySelector("td")?.textContent?.trim())).toEqual(
    contacts.map((item) => item.nome),
  );
  expect(preview?.textContent).not.toContain("Solicitante de chamado sintético");
});
