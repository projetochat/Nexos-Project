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
  crmApi: { listCustomers: vi.fn().mockResolvedValue({ items: [] }) },
  connectionsApi: { listChatScope: vi.fn().mockResolvedValue([]) },
  organizationApi: { listChatDepartments: vi.fn().mockResolvedValue([]) },
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
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
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

const closerId = "22222222-2222-4222-8222-222222222222";
async function renderHistory() {
  api.history.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    closedByOptions: [{ membershipId: closerId, name: "Fechador sintético" }],
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
}
it("filters by the real closer membership, preserves period and clears the filter", async () => {
  await renderHistory();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Encerrado por"]')!;
  expect(select).not.toBeNull();
  expect(select.textContent).toContain("Fechador sintético");
  await React.act(async () => {
    select.value = closerId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await settle();
  });
  expect(api.history.mock.lastCall?.[0]).toMatchObject({
    closedByMembershipId: closerId,
    includeClosedByOptions: true,
    period: "today",
    status: "fechada",
    page: 1,
  });
  expect(api.history.mock.lastCall?.[0]).not.toHaveProperty("assignedMembershipId");
  expect(localStorage.getItem("trixus.history.filters.synthetic-phone-viewer")).toContain(closerId);
  await React.act(async () => {
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await settle();
  });
  expect(api.history.mock.lastCall?.[0].closedByMembershipId).toBeUndefined();
});
it("restores the closer filter saved for this viewer", async () => {
  localStorage.setItem(
    "trixus.history.filters.synthetic-phone-viewer",
    JSON.stringify({ search: "", filters: { period: "today", closedByMembershipId: closerId } }),
  );
  await renderHistory();
  expect(api.history.mock.lastCall?.[0].closedByMembershipId).toBe(closerId);
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Encerrado por"]')?.value).toBe(
    closerId,
  );
});
