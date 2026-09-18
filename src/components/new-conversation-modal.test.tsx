// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewConversationModal } from "../routes/inbox.index";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  form: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/app-shell", () => ({ AppShellFull: () => null }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ id: "user" }) }));
vi.mock("@/lib/realtime/hooks", () => ({ useRealtimeInbox: vi.fn() }));
vi.mock("@/lib/queue-prefs", () => ({ useQueuePrefs: vi.fn() }));
vi.mock("@/lib/perms", () => ({ useChatPerms: vi.fn() }));
vi.mock("@/lib/use-connected-messaging-connections", () => ({
  useConnectedMessagingConnections: () => ({
    allConnections: [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
      { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
    ],
  }),
}));
vi.mock("../routes/contatos", () => ({
  ContactFormModal: (props: unknown) => {
    mocks.form(props);
    return <div>Cadastro de contato aberto</div>;
  },
  contactPayload: (data: unknown) => data,
}));
vi.mock("@/lib/trixus-api", () => ({
  crmApi: {
    listContacts: (...args: unknown[]) => mocks.list(...args),
    contactOptions: async () => ({ instances: [], tags: [], departments: [], profiles: [] }),
    listCustomers: async () => ({ items: [] }),
  },
  conversationApi: { create: (...args: unknown[]) => mocks.create(...args) },
  messageApi: { sendText: (...args: unknown[]) => mocks.send(...args) },
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const records = Array.from({ length: 121 }, (_, i) => ({
  id: String(i),
  nome: i === 120 ? "Douglas" : `Contato ${String(i).padStart(3, "0")}`,
  telefone: "5566999999999",
  instanceIds: ["a"],
}));
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.trim() === text)!;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <NewConversationModal open onClose={vi.fn()} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.list.mockImplementation(async ({ instance, q, page, pageSize }) => {
    const filtered =
      instance === "a"
        ? records.filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()))
        : [];
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
      page,
      pageSize,
    };
  });
  mocks.create.mockResolvedValue({ id: "conversation" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe("new conversation contact picker", () => {
  it("shows seven contacts per page and searches the full instance, including contacts beyond the first 100", async () => {
    await mount();
    expect(document.querySelectorAll("ul li")).toHaveLength(7);
    await act(async () =>
      (
        document.querySelector('[aria-label="Próxima página de contatos"]') as HTMLButtonElement
      ).click(),
    );
    await flush();
    expect(document.body.textContent).toContain("Contato 007");
    const input = document.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "douglas",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(mocks.list).toHaveBeenLastCalledWith({
      instance: "a",
      q: "douglas",
      page: 1,
      pageSize: 7,
    });
    expect(document.querySelectorAll("ul li")).toHaveLength(1);
    expect(document.body.textContent).toContain("Douglas");
  });
  it("clears the selected contact when changing instances and does not reuse another instance's list", async () => {
    await mount();
    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    expect(button("Iniciar conversa").disabled).toBe(false);
    await act(async () => {
      const select = document.querySelector("select")!;
      select.value = "b";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(button("Iniciar conversa").disabled).toBe(true);
    expect(document.body.textContent).not.toContain("Contato 000");
    expect(mocks.list).toHaveBeenLastCalledWith({
      instance: "b",
      q: undefined,
      page: 1,
      pageSize: 7,
    });
  });
  it("opens the existing contact form for creation and editing without selecting the edit target", async () => {
    await mount();
    await act(async () => button("Novo Contato").click());
    expect(mocks.form.mock.lastCall?.[0]).toMatchObject({
      defaultInstanceId: "a",
      initial: undefined,
    });
    await act(async () => mocks.form.mock.lastCall?.[0].onClose());
    await act(async () =>
      (
        document.querySelector('[aria-label="Editar contato Contato 000"]') as HTMLButtonElement
      ).click(),
    );
    expect(mocks.form.mock.lastCall?.[0].initial.id).toBe("0");
    expect(button("Iniciar conversa").disabled).toBe(true);
  });
  it("starts a conversation without requiring or sending a first message", async () => {
    await mount();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).not.toContain("Contato existente");
    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await act(async () => button("Iniciar conversa").click());
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      assignToSelf: true,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
  });
});
