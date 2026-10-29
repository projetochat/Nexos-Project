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
  navigate: vi.fn(),
  getConversation: vi.fn(),
  user: {
    id: "synthetic-dashboard-user",
    empresaId: "synthetic-tenant",
    role: "admin",
    permissions: [] as string[],
  },
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: React.ComponentType }) => ({ options }),
  useNavigate: () => api.navigate,
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: { conversationId: string };
    search?: Record<string, string>;
  }) => (
    <a
      href={`${to.replace("$conversationId", params?.conversationId ?? "")}?${new URLSearchParams(search).toString()}`}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({ user: api.user }),
}));
vi.mock("@/lib/realtime/client", () => ({ onRealtimeEvent: () => () => {} }));
vi.mock("@/lib/trixus-api", async (original) => {
  const actual = await original<typeof import("@/lib/trixus-api")>();
  return {
    ...actual,
    conversationApi: { ...actual.conversationApi, get: api.getConversation },
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
const rankTitle = "Ranking de Contatos";
const contacts = Array.from({ length: 20 }, (_, index) => ({
  nome: `Contato sintético ${String(index + 1).padStart(2, "0")}`,
  total: 20 - index,
  cliente: index === 0 ? "Cliente sintético" : null,
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
  api.navigate.mockReset();
  api.user = {
    id: "synthetic-dashboard-user",
    empresaId: "synthetic-tenant",
    role: "admin",
    permissions: [],
  };
  api.getConversation.mockReset();
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
async function renderDashboard(data = dashboardData) {
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
    finishDashboard(data);
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
  expect([...host.querySelectorAll("th")].map((node) => node.textContent)).toEqual([
    "Nome contato",
    "Cliente",
    "Departamento",
    "Qtd.",
  ]);
  expect(rows[0].querySelectorAll("td")[1]?.textContent).toBe("Cliente sintético");
  expect(rows[1].querySelectorAll("td")[1]?.textContent).toBe("Sem cliente");
  expect(rows.map((row) => row.querySelectorAll("td")[0]?.textContent?.trim())).toEqual(
    contacts.slice(0, 10).map(() => "Contato sintético"),
  );
  expect(rows.map((row) => row.querySelectorAll("td")[3]?.textContent)).toEqual(
    contacts.slice(0, 10).map((item) => String(item.total)),
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
  expect([...host.querySelectorAll("th")].map((node) => node.textContent)).toEqual([
    "Nome contato",
    "Cliente",
    "Departamento",
    "Qtd.",
  ]);
  expect(rows[0].querySelectorAll("td")[1]?.textContent).toBe("Cliente sintético");
  expect(rows[1].querySelectorAll("td")[1]?.textContent).toBe("Sem cliente");
  expect(rows.map((row) => row.querySelectorAll("td")[0]?.textContent?.trim())).toEqual(
    contacts.slice(0, 10).map(() => "Contato sintético"),
  );
  expect(preview?.textContent).not.toContain("Solicitante de chamado sintético");
});

it("expands the contact ranking to twenty entries and restores ten", async () => {
  await renderDashboard();
  expect(host.querySelectorAll("table tbody tr")).toHaveLength(10);
  await click(host.querySelector(`[aria-label="Maximizar ${rankTitle}"]`));
  expect(document.querySelectorAll("[data-dashboard-maximized] table tbody tr")).toHaveLength(20);
  await click(document.querySelector(`[aria-label="Restaurar ${rankTitle}"]`));
  expect(host.querySelectorAll("table tbody tr")).toHaveLength(10);
});

it("opens the whole recent activity row at the latest destination while preserving the cached History href", async () => {
  const previous = await api.configuration();
  api.configuration.mockResolvedValue({
    ...previous,
    configuration: {
      ...previous.configuration,
      components: [
        {
          id: "recent-test",
          title: "Atividade recente",
          visible: true,
          visualization: "table",
          columns: 1,
          dataSource: "activity",
          groupBy: "recent",
          valueMode: "count",
        },
      ],
    },
  });
  const conversation = {
    id: "synthetic-recent",
    status: "fechada",
    is_lead: false,
    protocolo: "2026.030",
    contact: { nome: "Contato sintético" },
    last_message_at: "2026-10-28T12:00:00Z",
  };
  await renderDashboard({
    ...dashboardData,
    recent: [conversation],
  } as unknown as typeof dashboardData);
  const link = host.querySelector<HTMLAnchorElement>(
    'a[aria-label="Abrir conversa protocolo 2026.030"]',
  )!;
  expect(link).not.toBeNull();
  expect(link.href).toContain("/historico?conversationId=synthetic-recent");
  expect(link.querySelectorAll("a")).toHaveLength(0);
  expect(link.textContent).toContain("#2026.030");
  expect(link.textContent).toContain("Contato");
  api.getConversation.mockResolvedValue({ ...conversation, status: "aguardando" });
  await React.act(async () =>
    link
      .querySelector("span")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })),
  );
  expect(api.getConversation).toHaveBeenCalledExactlyOnceWith("synthetic-recent");
  expect(api.navigate).toHaveBeenCalledWith({
    to: "/inbox/$conversationId",
    params: { conversationId: "synthetic-recent" },
    search: { locate: "standby" },
  });
});

it("lets only the latest recent-row click navigate and invalidates pending navigation on unmount", async () => {
  const previous = await api.configuration();
  api.configuration.mockResolvedValue({
    ...previous,
    configuration: {
      ...previous.configuration,
      components: [
        {
          id: "recent-test",
          title: "Atividade recente",
          visible: true,
          visualization: "table",
          columns: 1,
          dataSource: "activity",
          groupBy: "recent",
          valueMode: "count",
        },
      ],
    },
  });
  const conversation = {
    id: "synthetic-recent",
    status: "fechada",
    is_lead: false,
    protocolo: "2026.030",
    contact: { nome: "Contato sintético" },
    last_message_at: "2026-10-28T12:00:00Z",
  };
  await renderDashboard({
    ...dashboardData,
    recent: [conversation],
  } as unknown as typeof dashboardData);
  const link = host.querySelector<HTMLAnchorElement>(
    'a[aria-label="Abrir conversa protocolo 2026.030"]',
  )!;
  const completions: Array<(value: unknown) => void> = [];
  api.getConversation.mockImplementation(() => new Promise((resolve) => completions.push(resolve)));
  await React.act(async () => {
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    link
      .querySelectorAll("span")[1]
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  await React.act(async () => completions[1]({ ...conversation, status: "aguardando" }));
  await React.act(async () => completions[0]({ ...conversation, status: "em_andamento" }));
  expect(api.navigate).toHaveBeenCalledExactlyOnceWith({
    to: "/inbox/$conversationId",
    params: { conversationId: conversation.id },
    search: { locate: "standby" },
  });
  await React.act(async () =>
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })),
  );
  api.user = { ...api.user, empresaId: "other-synthetic-tenant" };
  await React.act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Dashboard />
      </QueryClientProvider>,
    ),
  );
  await React.act(async () => completions[2]({ ...conversation, status: "aberta" }));
  expect(api.navigate).toHaveBeenCalledTimes(1);
  await React.act(async () =>
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })),
  );
  await React.act(async () => root.unmount());
  await React.act(async () => completions[3]({ ...conversation, status: "aberta" }));
  expect(api.navigate).toHaveBeenCalledTimes(1);
  root = createRoot(host);
});
