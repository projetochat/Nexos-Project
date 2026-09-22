// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  history: vi.fn(),
  timeline: vi.fn(),
  messages: vi.fn(),
  bubble: vi.fn(),
}));
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
vi.mock("../routes/inbox.$conversationId", () => ({
  ContactPanel: () => null,
  MessageBubble: (props: { m: { content: string }; readOnly?: boolean }) => {
    api.bubble(props);
    return <div data-testid="shared-message">{props.m.content}</div>;
  },
}));
vi.mock("@/lib/trixus-api", () => ({
  operationsApi: { history: api.history, timeline: api.timeline },
  messageApi: { list: api.messages },
  conversationApi: {},
}));
import { HistoricoPage } from "../routes/-historico-page";
it("selects a different conversation on one click and loads its messages without the removed timeline", async () => {
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
  api.messages.mockImplementation(async (id: string) => ({
    items: [
      {
        id: `message-${id}`,
        conversation_id: id,
        content: `Mensagem da API ${id}`,
        type: "text",
        created_at: "2026-09-18T12:00:00.000Z",
      },
    ],
  }));
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
    const conversationList = host.querySelector('[aria-label="Lista de conversas do histórico"]')!;
    const conversationDetail = host.querySelector('[aria-label="Conversa do histórico"]')!;
    expect(conversationList.className).not.toContain("hidden lg:flex");
    expect(conversationDetail.className).toContain("hidden lg:flex");
    const target = [...host.querySelectorAll("li button")].find((button) =>
      button.textContent?.includes("Natã R"),
    ) as HTMLButtonElement;
    await act(async () => target.click());
    await flush();
    expect(conversationList.className).toContain("hidden lg:flex");
    expect(conversationDetail.className).not.toContain("hidden lg:flex");
    expect(target.getAttribute("aria-pressed")).toBe("true");
    expect(
      host.querySelector('[aria-label="Abrir informações do contato"]')?.textContent,
    ).toContain("Natã R");
    expect(api.messages).toHaveBeenLastCalledWith("1", { limit: 100 });
    expect(api.bubble).toHaveBeenLastCalledWith(
      expect.objectContaining({
        m: expect.objectContaining({ id: "message-1", content: "Mensagem da API 1" }),
        readOnly: true,
      }),
    );
    expect(host.querySelector('[data-testid="shared-message"]')?.textContent).toBe(
      "Mensagem da API 1",
    );
    expect(host.textContent).not.toContain("Timeline 1");
    expect(api.timeline).not.toHaveBeenCalled();
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
    const backButton = host.querySelector(
      '[aria-label="Voltar para a lista do histórico"]',
    ) as HTMLButtonElement;
    await act(async () => backButton.click());
    expect(conversationList.className).not.toContain("hidden lg:flex");
    expect(conversationDetail.className).toContain("hidden lg:flex");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    localStorage.clear();
  }
});
