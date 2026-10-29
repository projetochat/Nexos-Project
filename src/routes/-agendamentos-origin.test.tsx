// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApiSchedule } from "@/lib/schedule-types";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  user: {
    id: "synthetic-scheduler",
    empresaId: "synthetic-tenant",
    permissions: ["schedules.read", "schedules.create", "schedules.update"],
  },
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
  PageContainer: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({ user: api.user }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/realtime/client", () => ({
  connectRealtime: vi.fn(),
  onRealtimeEvent: () => () => {},
}));
vi.mock("@/lib/trixus-api", () => ({
  schedulesApi: { list: api.list, save: api.save },
  connectionsApi: { list: vi.fn().mockResolvedValue([]) },
  organizationApi: {
    listDepartments: vi.fn().mockResolvedValue([]),
    listUsers: vi.fn().mockResolvedValue([]),
  },
  crmApi: {},
}));
vi.mock("@/lib/task-management", () => ({
  taskManagementApi: { capabilities: async () => ({ enabled: false }) },
}));
import { Route } from "./agendamentos";
const Page = (Route as unknown as { component: React.ComponentType }).component;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function schedule(
  id: string,
  overrides: Partial<ApiSchedule> & { origin?: "CHAT" | "SCHEDULES" } = {},
): ApiSchedule {
  return {
    id,
    identifier: id,
    title: id,
    type: "message",
    destination: "Destino sintético",
    scheduledAt: "2099-01-01T12:00:00Z",
    recurrence: "once",
    delivery: true,
    status: "pending",
    connectionId: "",
    departmentId: "",
    content: "Mensagem sintética",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: null,
    ...overrides,
  };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated schedule origin test");
    }),
  );
  localStorage.clear();
  vi.clearAllMocks();
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
async function render(items: ApiSchedule[]) {
  await (Page as React.ComponentType & { preload?: () => Promise<unknown> }).preload?.();
  api.list.mockResolvedValue(items);
  await React.act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    ),
  );
  await React.act(async () => {
    await settle();
    await settle();
  });
}
it("renders only module schedules of either status, preserving legacy fallback and explicit module copies", async () => {
  await render([
    schedule("CHAT-PENDING-HIDDEN", { origin: "CHAT", conversationId: "conversation-a" }),
    schedule("CHAT-COMPLETED-HIDDEN", {
      origin: "CHAT",
      conversationId: "conversation-b",
      status: "completed",
    }),
    schedule("LEGACY-CHAT-HIDDEN", { conversationId: "legacy-conversation" }),
    schedule("MODULE-PENDING", { origin: "SCHEDULES" }),
    schedule("MODULE-COMPLETED", { origin: "SCHEDULES", status: "completed" }),
    schedule("LEGACY-MODULE"),
    schedule("MODULE-COPY-WITH-CONVERSATION", {
      origin: "SCHEDULES",
      conversationId: "copied-conversation",
    }),
  ]);
  expect(api.list).toHaveBeenCalledWith({ origin: "SCHEDULES" });
  for (const title of [
    "MODULE-PENDING",
    "MODULE-COMPLETED",
    "LEGACY-MODULE",
    "MODULE-COPY-WITH-CONVERSATION",
  ])
    expect(host.textContent).toContain(title);
  for (const title of ["CHAT-PENDING-HIDDEN", "CHAT-COMPLETED-HIDDEN", "LEGACY-CHAT-HIDDEN"])
    expect(host.textContent).not.toContain(title);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(4);
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: ["trixus", "schedules", "synthetic-tenant"] })
      .some((query) => query.queryKey.includes("SCHEDULES")),
  ).toBe(true);
});
it("paginates and filters statuses after excluding all chat schedules", async () => {
  await render([
    ...Array.from({ length: 26 }, (_, index) =>
      schedule(`MODULE-PENDING-${String(index).padStart(2, "0")}`, { origin: "SCHEDULES" }),
    ),
    schedule("MODULE-COMPLETED-ONLY", { origin: "SCHEDULES", status: "completed" }),
    schedule("CHAT-COMPLETED-HIDDEN", {
      origin: "CHAT",
      status: "completed",
      conversationId: "chat-a",
    }),
    schedule("CHAT-PENDING-HIDDEN", { origin: "CHAT", conversationId: "chat-b" }),
  ]);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
  expect(host.querySelector("footer")?.textContent).toMatch(/25 de 27/);
  await React.act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Próxima página"]')!.click(),
  );
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  const status = [...host.querySelectorAll<HTMLSelectElement>("select")].find((select) =>
    [...select.options].some((option) => option.value === "completed"),
  )!;
  await React.act(async () => {
    status.value = "completed";
    status.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.textContent).toContain("MODULE-COMPLETED-ONLY");
  expect(host.textContent).not.toContain("CHAT-COMPLETED-HIDDEN");
  expect(host.querySelector("footer")?.textContent).toContain("1 / 1");
});
