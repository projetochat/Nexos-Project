// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: {
    id: "synthetic-user",
    empresaId: "synthetic-tenant",
    role: "admin",
    roleKey: "tenant_admin",
    permissions: ["messages.send", "conversations.read"],
  },
  conversationId: "synthetic-conversation",
  conversation: {} as Record<string, unknown>,
  departments: [] as Record<string, unknown>[],
  get: vi.fn(),
  assign: vi.fn(),
  departmentsList: vi.fn(),
  ensure: vi.fn(),
  list: vi.fn(),
  contact: vi.fn(),
  options: vi.fn(),
  messages: vi.fn(),
  rerender: () => {},
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useParams: () => ({ conversationId: state.conversationId }),
  }),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    params,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { params: { conversationId: string } }) => (
    <a
      {...props}
      href={`/inbox/${params.conversationId}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && event.button === 0) {
          event.preventDefault();
          state.conversationId = params.conversationId;
          state.rerender();
        }
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("./inbox.index", () => ({
  InboxLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./contatos", () => ({ ContactFormModal: () => null, contactPayload: vi.fn() }));
vi.mock("./chamados", () => ({ TicketEditor: () => null }));
vi.mock("@/components/schedule-message-modal", () => ({ ScheduleMessageModal: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (value: unknown) => unknown) => selector({ user: state.user }),
}));
vi.mock("@/lib/trixus-api", async (original) => {
  const actual = await original<typeof import("@/lib/trixus-api")>();
  return {
    ...actual,
    conversationApi: {
      ...actual.conversationApi,
      get: state.get,
      list: state.list,
      assign: state.assign,
      transferOptions: vi.fn(async () => ({ membershipIds: [], departmentIds: [] })),
    },
    organizationApi: {
      ...actual.organizationApi,
      listUsers: vi.fn(async () => []),
      listChatDepartments: state.departmentsList,
      entitlements: vi.fn(async () => ({
        features: { chat: true, tickets: false, campaigns: false },
      })),
    },
    onboardingApi: { ...actual.onboardingApi, ensureDepartmentConnection: state.ensure },
    crmApi: { ...actual.crmApi, getContact: state.contact, contactOptions: state.options },
    messageApi: { ...actual.messageApi, list: state.messages },
    quickReplyApi: { ...actual.quickReplyApi, list: vi.fn(async () => []) },
  };
});
import { Route } from "./inbox.$conversationId";
const ConversationPage = (Route as unknown as { options: { component: React.ComponentType } })
  .options.component;
const linkedDepartment = {
  id: "synthetic-tenant:atendimento",
  name: "Atendimento",
  color: "#000000",
  icon: "headset",
  description: "Synthetic department",
  active: true,
  connectionIds: ["synthetic-connection"],
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const header = () =>
  host.querySelector<HTMLButtonElement>(
    'button[aria-label="Iniciar Atendimento"], button[aria-label="Retomar Atendimento"]',
  )!;
const modal = () => document.querySelector<HTMLElement>('[role="dialog"]');
const modalButton = (text: string) =>
  [...(modal()?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.trim() === text,
  )!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in isolated click test");
    }),
  );
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  state.user = {
    id: "synthetic-user",
    empresaId: "synthetic-tenant",
    role: "admin",
    roleKey: "tenant_admin",
    permissions: ["messages.send", "conversations.read"],
  };
  state.conversation = {
    id: "synthetic-conversation",
    connection_id: "synthetic-connection",
    connection: { id: "synthetic-connection", name: "Synthetic instance" },
    status: "aberta",
    is_group: true,
    protocolo: "000001",
    agent_id: null,
    contact_id: "contact-a",
    contact: { id: "contact-a", nome: "Contato sintético", active: true },
    created_at: "2026-10-28T12:00:00Z",
  };
  state.conversationId = "synthetic-conversation";
  state.departments = [];
  state.get.mockReset().mockImplementation(async () => state.conversation);
  state.departmentsList.mockReset().mockImplementation(async () => state.departments);
  state.ensure.mockReset().mockImplementation(async () => {
    state.departments = [linkedDepartment];
    return { departmentId: linkedDepartment.id, connectionId: "synthetic-connection" };
  });
  state.contact
    .mockReset()
    .mockResolvedValue({ id: "contact-a", nome: "Contato sintético", tags: [] });
  state.options.mockReset().mockResolvedValue({ instances: [], tags: [], departments: [] });
  state.list.mockReset().mockResolvedValue({
    items: [
      { ...state.conversation, id: "synthetic-conversation", protocolo: "000001" },
      { ...state.conversation, id: "target-conversation", protocolo: "000002" },
    ],
  });
  state.messages.mockReset().mockResolvedValue({ items: [] });
  state.rerender = () =>
    root.render(
      <QueryClientProvider client={client}>
        <ConversationPage />
      </QueryClientProvider>,
    );
  state.assign.mockReset().mockImplementation(async () => {
    state.conversation = {
      ...state.conversation,
      protocolo: "000001",
      status: "em_andamento",
      agent_id: state.user.id,
    };
    return state.conversation;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function render() {
  await (
    ConversationPage as React.ComponentType & { preload?: () => Promise<unknown> }
  ).preload?.();
  await React.act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationPage />
      </QueryClientProvider>,
    );
  });
  await React.act(async () => {
    await settle();
    await settle();
  });
}
async function click(element: HTMLElement) {
  await React.act(async () => {
    element.click();
    await settle();
  });
}

async function openPanel() {
  await render();
  await click(
    host.querySelector<HTMLButtonElement>('button[aria-label="Abrir informações do contato"]')!,
  );
  await React.act(async () => {
    await settle();
    await settle();
  });
  expect(state.list).toHaveBeenCalledTimes(1);
  expect(targetLink()).not.toBeNull();
}
function filterProtocol(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder="Filtrar protocolo…"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}
function targetLink() {
  return host.querySelector<HTMLAnchorElement>('a[href="/inbox/target-conversation"]')!;
}

it("keeps sidebar DOM/filter/scroll and queries while replacing only the conversation", async () => {
  let resolveTarget!: (value: unknown) => void;
  state.get.mockImplementation(async (id) =>
    id === "target-conversation"
      ? new Promise((resolve) => {
          resolveTarget = resolve;
        })
      : state.conversation,
  );
  state.messages.mockResolvedValue({
    items: [
      {
        id: "old-message",
        conversation_id: "synthetic-conversation",
        sender: "contact",
        direction: "inbound",
        type: "text",
        content: "Conteúdo sintético antigo",
        created_at: "2026-10-28T12:00:00Z",
      },
    ],
  });
  await openPanel();
  expect(host.textContent).toContain("Conteúdo sintético antigo");
  const initialContactCalls = state.contact.mock.calls.length;
  const panel = host.querySelector("aside")!;
  const scroller = panel.querySelector<HTMLElement>(".overflow-y-auto")!;
  scroller.scrollTop = 123;
  let input!: HTMLInputElement;
  await React.act(async () => {
    input = filterProtocol("00000");
  });
  await click(targetLink());
  expect(host.querySelector("aside")).toBe(panel);
  expect(input.value).toBe("00000");
  expect(scroller.scrollTop).toBe(123);
  expect(host.textContent).toContain("Carregando conversa");
  expect(host.textContent).not.toContain("Conteúdo sintético antigo");
  expect(header()).toBeNull();
  expect(host.querySelector('button[aria-label="Abrir informações do contato"]')).toBeNull();
  expect(state.messages).toHaveBeenCalledTimes(1);
  await React.act(async () => {
    resolveTarget({ ...state.conversation, id: "target-conversation", protocolo: "000002" });
    await settle();
  });
  expect(host.querySelector("aside")).toBe(panel);
  expect(input.value).toBe("00000");
  expect(scroller.scrollTop).toBe(123);
  expect(targetLink().getAttribute("aria-current")).toBe("page");
  expect(state.contact).toHaveBeenCalledTimes(initialContactCalls);
  expect(state.list).toHaveBeenCalledTimes(1);
  expect(state.options).toHaveBeenCalledTimes(1);
});

it("drops the retained sidebar on a 404 rather than showing the previous contact", async () => {
  const { TrixusApiError } = await import("@/lib/trixus-api");
  let rejectTarget!: (error: unknown) => void;
  state.get.mockImplementation(async (id) =>
    id === "target-conversation"
      ? new Promise((_, reject) => {
          rejectTarget = reject;
        })
      : state.conversation,
  );
  await openPanel();
  await click(targetLink());
  const targetQuery = client.getQueryCache().find({
    queryKey: ["trixus", "conversations", "target-conversation"],
    exact: false,
  });
  expect(targetQuery).toBeDefined();
  const failed = new Promise<void>((resolve) => {
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.query === targetQuery && event.query.state.status === "error") {
        unsubscribe();
        resolve();
      }
    });
  });
  await React.act(async () => {
    rejectTarget(new TrixusApiError("not found", 404));
    // Query state changes before its batched observer notification is rendered.
    await failed;
    await settle();
  });
  expect(targetQuery?.state.error).toBeInstanceOf(TrixusApiError);
  expect(targetQuery?.state.error).toMatchObject({ status: 404 });
  expect(host.querySelector("aside")).toBeNull();
});

it("does not retain the sidebar after the authorization identity changes during navigation", async () => {
  state.get.mockImplementation(async (id) =>
    id === "target-conversation" ? new Promise(() => {}) : state.conversation,
  );
  await openPanel();
  await click(targetLink());
  await React.act(async () => {
    state.user = { ...state.user, empresaId: "different-tenant" };
    state.rerender();
    await settle();
  });
  expect(host.querySelector("aside")).toBeNull();
  expect(host.textContent).not.toContain("Contato sintético");
});

it("remounts for a different contact after resolving rather than preserving the previous filter", async () => {
  let resolveTarget!: (value: unknown) => void;
  state.get.mockImplementation(async (id) =>
    id === "target-conversation"
      ? new Promise((resolve) => {
          resolveTarget = resolve;
        })
      : state.conversation,
  );
  await openPanel();
  const oldPanel = host.querySelector("aside");
  await React.act(async () => {
    filterProtocol("00000");
  });
  await click(targetLink());
  state.contact.mockResolvedValue({ id: "contact-b", nome: "Outro contato", tags: [] });
  await React.act(async () => {
    resolveTarget({
      ...state.conversation,
      id: "target-conversation",
      contact_id: "contact-b",
      contact: { id: "contact-b", nome: "Outro contato" },
    });
    await settle();
  });
  await React.act(async () => {
    await settle();
    await settle();
  });
  expect(host.querySelector("aside")).not.toBe(oldPanel);
  expect(
    host.querySelector<HTMLInputElement>('input[placeholder="Filtrar protocolo…"]')!.value,
  ).toBe("");
  expect(state.contact).toHaveBeenLastCalledWith("contact-b");
});

it("does not retain a sidebar for unrelated route navigation without a protocol click", async () => {
  state.get.mockImplementation(async (id) =>
    id === "unrelated-conversation" ? new Promise(() => {}) : state.conversation,
  );
  await openPanel();
  await React.act(async () => {
    state.conversationId = "unrelated-conversation";
    state.rerender();
    await settle();
  });
  expect(host.querySelector("aside")).toBeNull();
  expect(host.textContent).not.toContain("Contato sintético");
});
