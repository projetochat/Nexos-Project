// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  locate: undefined as string | undefined,
  navigate: vi.fn(),
  list: vi.fn(async (options: Record<string, unknown>) => {
    expect(options).toBeDefined();
    return { items: [], counts: { ativas: 0, standby: 0, fila: 0, leads: 0 } };
  }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => () => ({}),
  useParams: () => ({ conversationId: "target" }),
  useSearch: () => ({ locate: state.locate }),
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/app-shell", () => ({
  AppShellFull: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./contatos", () => ({ ContactFormModal: () => null, contactPayload: vi.fn() }));
vi.mock("./grupos", () => ({ CreateGroupModal: () => null }));
vi.mock("@/components/active-conversation-orchestrator", () => ({
  ActiveConversationOrchestrator: () => null,
}));
vi.mock("@/components/bulk-conversation-action-modal", () => ({
  BulkConversationActionModal: () => null,
}));
vi.mock("@/components/disconnected-instance-alerts", () => ({
  DisconnectedInstanceAlerts: () => null,
}));
vi.mock("@/lib/trixus-api", () => ({
  conversationApi: { list: state.list },
  crmApi: {
    listCustomers: async () => ({
      items: [{ id: "customer-filter", nome: "Cliente sintético", cor: "#123456" }],
    }),
  },
  groupsApi: {},
}));
vi.mock("@/lib/session", () => ({
  useSession: (select: (s: unknown) => unknown) =>
    select({ user: { id: "synthetic", empresaId: "tenant", permissions: [] } }),
}));
vi.mock("@/lib/queue-prefs", () => ({
  useQueuePrefs: () => [
    { id: "ativas", label: "Ativas", enabled: true },
    { id: "standby", label: "Standby", enabled: true },
    { id: "fila", label: "Fila", enabled: true },
    { id: "leads", label: "Leads", enabled: true },
  ],
}));
vi.mock("@/lib/perms", () => ({ useChatPerms: () => ({ visualiza_leads: true }) }));
vi.mock("@/lib/realtime/hooks", () => ({ useRealtimeInbox: () => ({ status: "connected" }) }));
vi.mock("@/lib/use-connected-messaging-connections", () => ({
  useConnectedMessagingConnections: () => ({
    allConnections: [
      {
        id: "connection-filter",
        name: "Instância sintética",
        externalReference: "instance-filter",
      },
    ],
  }),
}));
import { InboxLayout } from "./inbox.index";
import { getInboxTab, setInboxTab } from "@/lib/inbox-tab-state";

it("retains ordinary list filters and clears them only for a consumed dashboard locate marker", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NETWORK_BLOCKED");
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const render = () =>
    React.act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <InboxLayout>
            <div>Conversation</div>
          </InboxLayout>
        </QueryClientProvider>,
      );
      await new Promise((r) => setTimeout(r, 0));
    });
  try {
    setInboxTab("ativas");
    await render();
    const input = host.querySelector<HTMLInputElement>('input[placeholder="Buscar cliente..."]')!;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "filtro anterior",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await React.act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Agente IA")!.click(),
    );
    await React.act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    for (const [label, option] of [
      ["Instância", "Instância sintética"],
      ["Cliente", "Cliente sintético"],
    ]) {
      const filter = [...host.querySelectorAll("p")].find(
        (p) => p.textContent === label,
      )!.parentElement!;
      await React.act(async () => filter.querySelector("button")!.click());
      await React.act(async () =>
        [...filter.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === option)!
          .click(),
      );
    }
    expect(state.list.mock.calls.at(-1)![0]).toMatchObject({
      source: "bots",
      onlyUnread: true,
      q: "filtro anterior",
      customerId: "customer-filter",
      instance: "instance-filter",
    });
    await render();
    expect(input.value).toBe("filtro anterior");
    expect(state.navigate).not.toHaveBeenCalled();
    state.locate = "standby";
    await render();
    expect(input.value).toBe("");
    expect(getInboxTab()).toBe("standby");
    expect(state.list.mock.calls.at(-1)![0]).toMatchObject({
      tab: "standby",
      source: "todos",
      onlyUnread: false,
      q: "",
      customerId: undefined,
      instance: undefined,
    });
    expect(state.navigate).toHaveBeenCalledOnce();
    const navigation = state.navigate.mock.calls[0][0];
    expect(navigation).toMatchObject({
      to: "/inbox/$conversationId",
      params: { conversationId: "target" },
      replace: true,
    });
    expect(navigation.search({ locate: "standby", tab: "leads" })).toEqual({
      locate: undefined,
      tab: "leads",
    });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
    state.locate = undefined;
  }
});
