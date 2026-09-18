// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ history: vi.fn(), timeline: vi.fn(), messages: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({
  AppShellFull: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/components/dashboard-filters", () => ({ DashboardFiltersBar: () => null }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ id: "user" }) }));
vi.mock("@/lib/realtime/client", () => ({ onRealtimeEvent: () => () => {} }));
vi.mock("../routes/inbox.$conversationId", () => ({ ContactPanel: () => null }));
vi.mock("@/lib/trixus-api", () => ({
  operationsApi: { history: api.history, timeline: api.timeline },
  messageApi: { list: api.messages },
  conversationApi: {},
}));
import { HistoricoPage } from "../routes/historico";
it("selects a different conversation on one click and loads its messages and timeline", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.history.mockResolvedValue({
    items: ["GANG DA GERALDA", "Natã R"].map((nome, id) => ({
      id: String(id),
      status: "fechada",
      created_at: "2026-09-18",
      contact: { nome, telefone: "" },
    })),
    total: 2,
    totalPages: 1,
  });
  api.timeline.mockImplementation(async (id) => ({
    items: [{ event: "created", at: "2026-09-18", description: "Timeline " + id }],
  }));
  api.messages.mockResolvedValue({ items: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HistoricoPage />
        </QueryClientProvider>,
      ),
    );
    await flush();
    await flush();
    const target = [...host.querySelectorAll("li button")].find((button) =>
      button.textContent?.includes("Natã R"),
    ) as HTMLButtonElement;
    await act(async () => target.click());
    await flush();
    expect(target.getAttribute("aria-pressed")).toBe("true");
    expect(
      host.querySelector('[aria-label="Abrir informações do contato"]')?.textContent,
    ).toContain("Natã R");
    expect(api.messages).toHaveBeenLastCalledWith("1", { limit: 100 });
    expect(host.textContent).toContain("Timeline 1");
    expect(host.querySelector("h1")?.textContent).toBe("Histórico de Conversas");
    expect(host.textContent).not.toContain("Consulta operacional");
    const historyQuery = client
      .getQueryCache()
      .find({ queryKey: ["operations", "history"], exact: false })!;
    const savedHistory = historyQuery.state.data;
    await act(async () => client.setQueryData(historyQuery.queryKey, { items: [] }));
    await flush();
    await act(async () => client.setQueryData(historyQuery.queryKey, savedHistory));
    await flush();
    expect(
      [...host.querySelectorAll("li button")]
        .find((button) => button.textContent?.includes("Natã R"))
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    localStorage.clear();
  }
});
