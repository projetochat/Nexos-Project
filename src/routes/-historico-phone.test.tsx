// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ history: vi.fn(), messages: vi.fn(), phoneAllowed: true }));
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
    selector({
      user: {
        id: "synthetic-phone-viewer",
        permissions: api.phoneAllowed ? ["history.read", "chat.phone.read"] : ["history.read"],
      },
    }),
}));
vi.mock("@/lib/trixus-api", () => ({
  operationsApi: { history: api.history },
  messageApi: { list: api.messages },
  conversationApi: {},
}));
vi.mock("./inbox.$conversationId", () => ({ ContactPanel: () => null, MessageBubble: () => null }));
import { HistoricoPage } from "./-historico-page";
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated history phone render");
    }),
  );
  api.phoneAllowed = true;
  api.history.mockReset();
  api.messages.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  localStorage.clear();
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
async function renderPhone(phone: string) {
  const contact = {
    id: "synthetic-contact",
    nome: "Contato sintético",
    telefone: phone,
    avatar_url: null,
  };
  api.history.mockResolvedValue({
    items: [
      {
        id: "synthetic-phone-history",
        status: "fechada",
        is_group: false,
        protocolo: "000002",
        created_at: "2026-10-27T12:00:00Z",
        closed_at: "2026-10-27T13:00:00Z",
        last_message_at: "2026-10-27T13:00:00Z",
        connection: { name: "Synthetic instance", color: "#7c3aed" },
        department: { nome: "Atendimento" },
        contact,
      },
    ],
    total: 1,
    page: 1,
    totalPages: 1,
  });
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
  expect(contact.telefone).toBe(phone);
}
it.each([
  ["551191234567", "(11) 99123-4567"],
  ["+55 (11) 9123-4567", "(11) 99123-4567"],
  ["1191234567", "(11) 99123-4567"],
  ["+5511991234567", "(11) 99123-4567"],
  ["(55) 9123-4567", "(55) 99123-4567"],
  ["+551132345678", "(11) 3234-5678"],
  ["1132345678", "(11) 3234-5678"],
  ["+1 415 555 2671", "+1 415 555 2671"],
  ["+351 912 345 678", "+351 912 345 678"],
  ["351912345678", "351912345678"],
  ["+550091234567", "+550091234567"],
])(
  "renders the history phone %s correctly in both surfaces without changing its stored value",
  async (phone, expected) => {
    await renderPhone(phone);
    const list = host.querySelector('[aria-label="Lista de conversas do histórico"]')!;
    const header = host.querySelector('[aria-label="Abrir informações do contato"]')!;
    expect(list.textContent).toContain(expected);
    expect(header.textContent).toContain(expected);
  },
);
it("keeps the phone hidden when the viewer lacks phone permission", async () => {
  api.phoneAllowed = false;
  await renderPhone("551191234567");
  expect(host.textContent).not.toContain("551191234567");
  expect(host.textContent).not.toContain("(11) 9123-4567");
  expect(host.textContent).not.toContain("(11) 99123-4567");
});
