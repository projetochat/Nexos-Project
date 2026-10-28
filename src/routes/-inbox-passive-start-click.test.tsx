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
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useParams: () => ({ conversationId: state.conversationId }),
  }),
  useNavigate: () => vi.fn(),
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
    messageApi: { ...actual.messageApi, list: vi.fn(async () => ({ items: [] })) },
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
    protocolo: null,
    agent_id: null,
    contact_id: null,
    contact: null,
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

it("repairs an admin instance link, requires explicit department selection and assigns only once", async () => {
  let finishRepair!: () => void;
  let finishAssign!: () => void;
  state.ensure.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRepair = () => {
          state.departments = [linkedDepartment];
          resolve();
        };
      }),
  );
  state.assign.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishAssign = resolve;
      }),
  );
  await render();
  await React.act(async () => {
    header().click();
    header().click();
    await settle();
  });
  expect(state.ensure).toHaveBeenCalledTimes(1);
  expect(state.ensure).toHaveBeenCalledWith("synthetic-connection");
  expect(header().disabled).toBe(true);
  expect(host.textContent).toContain("Preparando atendimento");
  expect(state.assign).not.toHaveBeenCalled();
  await React.act(async () => {
    finishRepair();
    await settle();
  });
  expect(modal()?.textContent).toContain("Escolher Departamento");
  expect(modalButton("Iniciar Atendimento").disabled).toBe(true);
  await click(modalButton("AtendimentoSynthetic department"));
  const confirm = modalButton("Iniciar Atendimento");
  await React.act(async () => {
    confirm.click();
    confirm.click();
    await settle();
  });
  expect(state.assign).toHaveBeenCalledTimes(1);
  expect(state.assign).toHaveBeenCalledWith("synthetic-conversation", {
    self: true,
    departmentId: "synthetic-tenant:atendimento",
  });
  expect(confirm.disabled).toBe(true);
  await React.act(async () => {
    finishAssign();
    await settle();
  });
});

it("opens existing linked choices without repairing or silently choosing for the admin", async () => {
  state.departments = [linkedDepartment];
  await render();
  await click(header());
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
  expect(modal()?.textContent).toContain("Atendimento");
});

it("explains zero permitted departments to a common user without changing a link", async () => {
  state.user = { ...state.user, role: "agent", roleKey: "agent" };
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Nenhum departamento permitido",
  );
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
});

it("does not misinterpret a department query error as an empty link list", async () => {
  state.departmentsList.mockRejectedValue(new Error("synthetic load failure"));
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Não foi possível carregar os departamentos",
  );
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
});

it("disables the first start action and visibly explains department loading", async () => {
  state.departmentsList.mockImplementation(() => new Promise(() => {}));
  await render();
  expect(header().disabled).toBe(true);
  expect(host.textContent).toContain("Carregando departamentos");
  await click(header());
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
});

it("shows repair failure without opening a department choice or assigning", async () => {
  state.ensure.mockRejectedValue(new Error("Synthetic instance is not connected"));
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Synthetic instance is not connected",
  );
  expect(modal()).toBeNull();
  expect(state.assign).not.toHaveBeenCalled();
});

it("does not assign when reloading departments after repair fails", async () => {
  state.departmentsList
    .mockResolvedValueOnce([])
    .mockRejectedValue(new Error("Synthetic reload failed"));
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Synthetic reload failed");
  expect(modal()).toBeNull();
  expect(state.assign).not.toHaveBeenCalled();
});

it("keeps a previously started standby conversation resumable while departments are loading", async () => {
  state.conversation = { ...state.conversation, protocolo: "000001", status: "aguardando" };
  state.departmentsList.mockImplementation(() => new Promise(() => {}));
  await render();
  expect(header().textContent).toContain("Retomar");
  expect(header().disabled).toBe(false);
  await click(header());
  expect(state.assign).toHaveBeenCalledWith("synthetic-conversation", {
    self: true,
    departmentId: undefined,
  });
  expect(state.ensure).not.toHaveBeenCalled();
});

it("does not assign unless the refreshed department list proves an eligible link", async () => {
  state.ensure.mockResolvedValue({
    departmentId: linkedDepartment.id,
    connectionId: "synthetic-connection",
  });
  await render();
  await click(header());
  expect(state.departmentsList).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Nenhum departamento permitido",
  );
  expect(modal()).toBeNull();
  expect(state.assign).not.toHaveBeenCalled();
});

it("does not carry a start error into a different conversation", async () => {
  state.user = { ...state.user, role: "agent", roleKey: "agent" };
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  state.conversationId = "synthetic-next";
  state.conversation = { ...state.conversation, id: "synthetic-next" };
  await render();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(state.assign).not.toHaveBeenCalled();
});

it("reloads a transient department error without repairing or assigning automatically", async () => {
  state.departmentsList
    .mockRejectedValueOnce(new Error("Synthetic transient failure"))
    .mockResolvedValue([linkedDepartment]);
  await render();
  await click(header());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  const reload = [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Recarregar departamentos",
  )!;
  await click(reload);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
  await click(header());
  expect(modal()?.textContent).toContain("Escolher Departamento");
  expect(state.ensure).not.toHaveBeenCalled();
  expect(state.assign).not.toHaveBeenCalled();
});
