// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { maskBrazilPhone } from "@/lib/input-masks";

const api = vi.hoisted(() => ({ history: vi.fn(), messages: vi.fn(), bubble: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/app-shell", () => ({
  AppShellFull: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard-filters", () => ({ DashboardFiltersBar: () => null }));
vi.mock("@/components/active-conversation-orchestrator", () => ({
  ActiveConversationOrchestrator: () => null,
}));
vi.mock("@/lib/realtime/client", () => ({ onRealtimeEvent: () => () => {} }));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (value: unknown) => unknown) =>
    selector({ user: { id: "synthetic-history-user", permissions: ["history.read"] } }),
}));
vi.mock("@/lib/trixus-api", () => ({
  operationsApi: { history: api.history },
  messageApi: { list: api.messages },
  conversationApi: {},
}));
vi.mock("./inbox.$conversationId", () => ({
  ContactPanel: () => null,
  MessageBubble: (props: { m: { content: string } }) => {
    api.bubble(props);
    return <div>{props.m.content}</div>;
  },
}));
import { HistoricoPage } from "./-historico-page";

// An embedded synthetic one-pixel PNG never contacts an image host.
const picture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNDsAAAAASUVORK5CYII=";
const phone = "5511000000000";
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let conversation: Record<string, unknown>;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated history avatar test");
    }),
  );
  localStorage.clear();
  conversation = {
    id: "synthetic-history",
    status: "fechada",
    is_group: false,
    protocolo: "000002",
    created_at: "2026-10-27T12:00:00Z",
    closed_at: "2026-10-27T13:00:00Z",
    last_message_at: "2026-10-27T13:00:00Z",
    connection: { name: "Synthetic instance", color: "#7c3aed", status: "CONNECTED" },
    department: { nome: "Atendimento" },
    agent: { nome: "Synthetic agent" },
    contact: { id: "synthetic-contact", nome: "Lina Helena", telefone: phone, avatar_url: picture },
  };
  api.history
    .mockReset()
    .mockImplementation(async () => ({ items: [conversation], total: 1, page: 1, totalPages: 1 }));
  api.messages.mockReset().mockResolvedValue({
    items: [
      {
        id: "synthetic-message",
        content: "Mensagem sintética",
        type: "text",
        created_at: "2026-10-27T12:00:00Z",
      },
    ],
    nextCursor: null,
  });
  api.bubble.mockClear();
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
  vi.unstubAllGlobals();
});
async function renderHistory() {
  await React.act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <HistoricoPage />
      </QueryClientProvider>,
    ),
  );
  await React.act(async () => {
    await settle();
    await settle();
  });
}
const list = () => host.querySelector('[aria-label="Lista de conversas do histórico"]')!;
const header = () => host.querySelector('[aria-label="Abrir informações do contato"]')!;

it("renders the stored contact photo in the real historical list and header without exposing a hidden phone", async () => {
  await renderHistory();
  for (const surface of [list(), header()]) {
    const image = surface.querySelector('img[alt="Lina Helena"]');
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe(picture);
  }
  expect(host.textContent).not.toContain(phone);
  expect(host.textContent).not.toContain(maskBrazilPhone(phone));
  expect(api.bubble).toHaveBeenLastCalledWith(
    expect.objectContaining({
      contactAvatarUrl: picture,
      readOnly: true,
      mediaAccessAllowed: true,
    }),
  );
});

it("keeps initials in both real avatars when no photo was serialized", async () => {
  conversation.contact = {
    id: "synthetic-contact",
    nome: "Lina Helena",
    telefone: phone,
    avatar_url: null,
  };
  await renderHistory();
  for (const surface of [list(), header()]) {
    expect(surface.querySelector('img[alt="Lina Helena"]')).toBeNull();
    expect(surface.textContent).toContain("LH");
  }
});

it("uses the group photo normalized by the backend in the same avatar contract", async () => {
  conversation = {
    ...conversation,
    is_group: true,
    group_name: "Grupo sintético",
    contact: { nome: "Grupo WhatsApp", telefone: "", avatar_url: picture },
  };
  await renderHistory();
  for (const surface of [list(), header()]) {
    expect(surface.querySelector('img[alt="Grupo sintético"]')?.getAttribute("src")).toBe(picture);
  }
  expect(api.bubble).toHaveBeenLastCalledWith(
    expect.objectContaining({ contactAvatarUrl: picture, isGroup: true }),
  );
});

it("renders the registered instance color independently of its connected status", async () => {
  await renderHistory();
  const dot = list().querySelector<HTMLElement>('[aria-label="Cor da instância"]')!;
  expect(dot.style.backgroundColor).toBe("rgb(124, 58, 237)");
});

it("uses the chat neutral fallback instead of a status-green dot when color is absent", async () => {
  conversation.connection = { name: "Synthetic instance", status: "CONNECTED", color: null };
  await renderHistory();
  expect(
    list().querySelector<HTMLElement>('[aria-label="Cor da instância"]')!.style.backgroundColor,
  ).toBe("var(--muted-foreground)");
});
