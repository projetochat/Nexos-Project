// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewConversationModal } from "../routes/inbox.index";
import { getInboxTab, setInboxTab } from "@/lib/inbox-tab-state";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  form: vi.fn(),
  send: vi.fn(),
  departments: vi.fn(),
  role: "operator",
  connections: [
    { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
  ],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/app-shell", () => ({ AppShellFull: () => null }));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) =>
    selector({
      user: {
        id: "user",
        nome: "Usuário de teste",
        email: "user@trixus.test",
        role: mocks.role,
        permissions: [
          "conversations.assign",
          "messages.send",
          "contacts.read",
          "contacts.create",
          "contacts.update",
        ],
      },
    }),
}));
vi.mock("@/lib/realtime/hooks", () => ({ useRealtimeInbox: vi.fn() }));
vi.mock("@/lib/queue-prefs", () => ({ useQueuePrefs: vi.fn() }));
vi.mock("@/lib/perms", () => ({ useChatPerms: vi.fn() }));
vi.mock("@/lib/use-connected-messaging-connections", () => ({
  useConnectedMessagingConnections: () => ({
    allConnections: mocks.connections,
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
    contactOptions: async () => ({
      instances: [
        { id: "a", value: "a", name: "Instância A", color: "#22c55e", status: "CONNECTED" },
        { id: "b", value: "b", name: "Instância B", color: "#a8325a", status: "CONNECTED" },
      ],
      tags: [],
      departments: [],
      profiles: [],
    }),
    listCustomers: async () => ({ items: [] }),
  },
  conversationApi: { create: (...args: unknown[]) => mocks.create(...args) },
  organizationApi: {
    listChatDepartments: () => mocks.departments(),
  },
  messageApi: { sendText: (...args: unknown[]) => mocks.send(...args) },
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const records = Array.from({ length: 121 }, (_, i) => ({
  id: String(i),
  nome: i === 120 ? "Douglas" : `Contato ${String(i).padStart(3, "0")}`,
  telefone: "5566999999999",
  instanceIds: i === 1 ? ["a", "b"] : i === 2 ? [] : ["a"],
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
  mocks.role = "operator";
  mocks.connections = [
    { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
  ];
  setInboxTab("fila");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.list.mockImplementation(async ({ q, page, pageSize }) => {
    const filtered = records.filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()));
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
      page,
      pageSize,
    };
  });
  mocks.create.mockResolvedValue({ id: "conversation" });
  mocks.departments.mockResolvedValue([
    {
      id: "department-a",
      name: "Comercial",
      connectionIds: ["a"],
      favoriteConnectionIds: ["a"],
    },
    {
      id: "department-b",
      name: "Suporte",
      connectionIds: ["b"],
      favoriteConnectionIds: ["b"],
    },
  ]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe("new conversation contact picker", () => {
  it("shows all contacts, searches beyond the first 100 and clears the search", async () => {
    await mount();
    const dialog = document.querySelector('[role="dialog"]')!;
    const dialogClassName = dialog.className;
    const contactList = document.querySelector('ul[aria-label="Contatos"]')!;
    expect(dialogClassName).toContain("h-[calc(100dvh-1rem)]");
    expect(contactList.className).toContain("flex-1");
    expect(contactList.className).toContain("overflow-y-auto");
    expect(document.querySelectorAll("ul li")).toHaveLength(10);
    await act(async () =>
      (
        document.querySelector('[aria-label="Próxima página de contatos"]') as HTMLButtonElement
      ).click(),
    );
    await flush();
    expect(document.body.textContent).toContain("Contato 010");
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
      q: "douglas",
      page: 1,
      pageSize: 10,
    });
    expect(document.querySelectorAll("ul li")).toHaveLength(1);
    expect(document.body.textContent).toContain("Douglas");
    expect(document.querySelector('[role="dialog"]')?.className).toBe(dialogClassName);
    expect(document.querySelector('[aria-label="Limpar busca"]')).not.toBeNull();
    await act(async () =>
      (document.querySelector('[aria-label="Limpar busca"]') as HTMLButtonElement).click(),
    );
    await flush();
    expect(input.value).toBe("");
    expect(document.body.textContent).toContain("Contato 000");
  });
  it("removes the instance field and asks which connected instance to use for a multi-instance contact", async () => {
    await mount();
    expect(document.body.textContent).not.toContain("Selecione uma instância para listar");
    expect(document.querySelector("select")).toBeNull();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );
    await act(async () => contactButtons[1].click());
    await flush();
    expect(document.body.textContent).toContain("Escolher Instância");
    expect(document.body.textContent).toContain("Instância A");
    expect(document.body.textContent).toContain("Instância B");
    await act(async () => button("Instância B").click());
    await flush();
    expect(document.body.textContent).not.toContain("Escolher Instância");
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "1",
      connectionId: "b",
      departmentId: "department-b",
      assignToSelf: true,
    });
  });
  it("does not block a contact without a linked instance and applies the scoped connected catalog", async () => {
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[2].click());
    await flush();

    expect(document.body.textContent).toContain("Escolher Instância");
    expect(document.body.textContent).toContain("Instância A");
    expect(document.body.textContent).toContain("Instância B");
    await act(async () => button("Instância A").click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "2",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
    });
  });
  it("applies the profile instance scope before deciding whether the instance modal is needed", async () => {
    mocks.connections = [
      { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
    ];
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[1].click());
    await flush();

    expect(document.body.textContent).not.toContain("Escolher Instância");
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "1",
      connectionId: "b",
      departmentId: "department-b",
      assignToSelf: true,
    });
  });
  it("opens the existing contact form for creation and editing without selecting the edit target", async () => {
    await mount();
    await act(async () => button("Novo Contato").click());
    expect(mocks.form.mock.lastCall?.[0].defaultInstanceId).toBeUndefined();
    expect(mocks.form.mock.lastCall?.[0].initial).toBeUndefined();
    await act(async () => mocks.form.mock.lastCall?.[0].onClose());
    await act(async () =>
      (
        document.querySelector('[aria-label="Editar contato Contato 000"]') as HTMLButtonElement
      ).click(),
    );
    expect(mocks.form.mock.lastCall?.[0].initial.id).toBe("0");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("starts a conversation without requiring or sending a first message", async () => {
    await mount();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).not.toContain("Contato existente");
    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
    expect(getInboxTab()).toBe("ativas");
  });
  it("opens a conversation directly when the selected instance has a favorite department", async () => {
    await mount();
    const contactButton = document.querySelector("ul li button") as HTMLButtonElement;
    await act(async () => contactButton.click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
  });

  it("keeps department selection when the selected instance has no favorite", async () => {
    mocks.departments.mockResolvedValue([
      {
        id: "department-a",
        name: "Comercial",
        connectionIds: ["a"],
        favoriteConnectionIds: [],
      },
    ]);
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => button("Comercial").click());
    await act(async () => button("Iniciar conversa").click());
    await flush();

    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
    });
  });

  it("requires the tenant administrator to choose a department even when a favorite is exposed", async () => {
    mocks.role = "admin";
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Escolher Departamento");
    await act(async () => button("Comercial").click());
    await act(async () => button("Iniciar conversa").click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
    });
  });

  it("requires the tenant administrator to choose a department after choosing among multiple instances", async () => {
    mocks.role = "admin";
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[1].click());
    await flush();
    await act(async () => button("Instância B").click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Escolher Departamento");
    expect(document.body.textContent).toContain("Suporte");
  });

  it("ignores a stale favorite that is no longer linked and opens the permitted department picker", async () => {
    mocks.departments.mockResolvedValue([
      {
        id: "department-stale",
        name: "Antigo",
        connectionIds: ["b"],
        favoriteConnectionIds: ["a"],
      },
      {
        id: "department-a",
        name: "Comercial",
        connectionIds: ["a"],
        favoriteConnectionIds: [],
      },
    ]);
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Escolher Departamento");
    expect(document.body.textContent).toContain("Comercial");
    expect(document.body.textContent).not.toContain("Antigo");
  });

  it("does not create when the selected instance has no permitted department", async () => {
    mocks.departments.mockResolvedValue([]);
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Escolher Departamento");
  });
});
