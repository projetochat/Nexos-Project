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
  listConversations: vi.fn(),
  create: vi.fn(),
  navigate: vi.fn(),
  form: vi.fn(),
  send: vi.fn(),
  departments: vi.fn(),
  ensureDepartmentConnection: vi.fn(),
  listGroups: vi.fn(),
  groupInstances: vi.fn(),
  createGroup: vi.fn(),
  role: "operator",
  connections: [
    { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
  ] as Array<{
    id: string;
    name: string;
    status: string;
    providerType: string;
    logoUrl?: string | null;
  }>,
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
          "conversations.read",
          "groups.read",
          "groups.create",
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
    listContactsForGroupPicker: async () => ({ items: [], total: 0, totalPages: 1 }),
  },
  groupsApi: {
    list: (...args: unknown[]) => mocks.listGroups(...args),
    instanceOptions: () => mocks.groupInstances(),
    create: (...args: unknown[]) => mocks.createGroup(...args),
  },
  conversationApi: {
    list: (...args: unknown[]) => mocks.listConversations(...args),
    create: (...args: unknown[]) => mocks.create(...args),
  },
  organizationApi: {
    listChatDepartments: () => mocks.departments(),
  },
  onboardingApi: {
    ensureDepartmentConnection: (...args: unknown[]) => mocks.ensureDepartmentConnection(...args),
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
  mocks.create.mockResolvedValue({
    id: "conversation",
    status: "em_andamento",
    is_group: false,
  });
  mocks.listConversations.mockResolvedValue({ items: [] });
  mocks.ensureDepartmentConnection.mockResolvedValue({
    departmentId: "tenant-a:atendimento",
    connectionId: "a",
    repaired: true,
  });
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
  mocks.listGroups.mockResolvedValue({
    items: [
      {
        id: "group-a",
        conversationId: "group-conversation-a",
        name: "Grupo Financeiro",
        imageUrl: null,
        participantsCount: 8,
        connection: { id: "a", name: "Instância A" },
      },
    ],
    total: 1,
    totalPages: 1,
    page: 1,
    pageSize: 10,
  });
  mocks.groupInstances.mockResolvedValue([
    { id: "a", value: "a", name: "Instância A", color: "#22c55e", status: "CONNECTED" },
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
  it("uses the single linked instance automatically when it is allowed", async () => {
    await mount();
    expect(document.body.textContent).not.toContain("Selecione uma instância para listar");
    expect(document.querySelector("select")).toBeNull();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );
    await act(async () => contactButtons[0].click());
    await flush();
    expect(document.body.textContent).not.toContain("Escolher Instância");
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });
  it("blocks centrally when the contact's only linked instance is not allowed", async () => {
    mocks.connections = [
      { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
    ];
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[0].click());
    await flush();

    expect(document.body.textContent).toContain("Atendimento não permitido");
    expect(document.body.textContent).toContain(
      "Você não está habilitado para atender pela instância Instância A",
    );
    expect(document.body.textContent).toContain("Instância B");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("blocks conversation creation with an explicit warning when the profile has no instance", async () => {
    mocks.connections = [];
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[0].click());
    await flush();

    expect(document.body.textContent).toContain("Nenhuma instância disponível");
    expect(document.body.textContent).toContain(
      "Seu perfil de acesso não possui nenhuma instância liberada para atendimento",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not block a contact without a linked instance and applies the scoped connected catalog", async () => {
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[2].click());
    await flush();

    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    expect(document.body.textContent).toContain(
      "Selecione a instância e o departamento para iniciar o atendimento.",
    );
    expect(document.body.textContent).toContain("Instância A");
    expect(document.body.textContent).toContain("Instância B");
    await act(async () => button("Instância A").click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "2",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });
  it("opens the instance picker for multiple links even when only one is allowed", async () => {
    mocks.connections = [
      { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
    ];
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[1].click());
    await flush();

    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    expect(document.body.textContent).not.toContain("Instância A");
    expect(document.body.textContent).toContain("Instância B");
    await act(async () => button("Instância B").click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "1",
      connectionId: "b",
      departmentId: "department-b",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });
  it("reuses the contact form for creation and removes editing from this picker", async () => {
    await mount();
    await act(async () => button("Novo Contato").click());
    expect(mocks.form.mock.lastCall?.[0].defaultInstanceId).toBeUndefined();
    expect(mocks.form.mock.lastCall?.[0].initial).toBeUndefined();
    await act(async () => mocks.form.mock.lastCall?.[0].onClose());
    expect(document.querySelector('[aria-label^="Editar contato"]')).toBeNull();
    expect(document.querySelector('[aria-label="Nova conversa com Contato 000"]')).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps independent contact and group tabs and opens an existing group conversation", async () => {
    await mount();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      "Contatos",
    );

    await act(async () => button("Grupos").click());
    await flush();

    expect(mocks.listGroups).toHaveBeenCalledWith({ q: undefined, page: 1, pageSize: 10 });
    expect(document.body.textContent).toContain("Grupo Financeiro");
    expect(document.body.textContent).toContain("8 participante(s) · Instância A");
    expect(document.querySelector('ul[aria-label="Grupos"]')).not.toBeNull();

    await act(async () =>
      (
        document.querySelector(
          '[aria-label="Nova conversa com o grupo Grupo Financeiro"]',
        ) as HTMLButtonElement
      ).click(),
    );

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "group-conversation-a" },
    });
  });
  it("starts a conversation without requiring or sending a first message", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
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
      reuseExistingOpen: true,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
    expect(getInboxTab()).toBe("ativas");
  });
  it("opens a conversation directly when the selected instance has a favorite department", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    await mount();
    const contactButton = document.querySelector("ul li button") as HTMLButtonElement;
    await act(async () => contactButton.click());
    await flush();
    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
  });

  it("keeps department selection when the selected instance has no favorite", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
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
    await act(async () => button("Iniciar Atendimento").click());
    await flush();

    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });

  it("requires the tenant administrator to select a department explicitly", async () => {
    mocks.role = "admin";
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    await act(async () => button("Comercial").click());
    await act(async () => button("Iniciar Atendimento").click());
    await flush();

    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "department-a",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });

  it("shows every connected tenant instance to the administrator even when the contact has one link", async () => {
    mocks.role = "admin";
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    expect(document.body.textContent).toContain("Instância A");
    expect(document.body.textContent).toContain("Instância B");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("navigates directly to an open conversation when only one instance is available", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    mocks.listConversations.mockResolvedValue({
      items: [
        {
          id: "existing-a",
          status: "em_andamento",
          is_group: false,
          connection: { id: "a" },
        },
      ],
    });
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.listConversations.mock.calls.map(([params]) => params.status).sort()).toEqual([
      "aberta",
      "aguardando",
      "em_andamento",
    ]);
    expect(document.body.textContent).not.toContain("Escolher Departamento");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "existing-a" },
    });
  });

  it("ignores a closed conversation from preflight and creates a new active conversation", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    mocks.listConversations.mockResolvedValue({
      items: [
        {
          id: "closed-a",
          status: "fechada",
          is_group: false,
          connection: { id: "a" },
        },
      ],
    });
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { conversationId: "closed-a" } }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "conversation" },
    });
  });

  it("never navigates to a closed creation response and retries with the new active id", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    mocks.create
      .mockResolvedValueOnce({ id: "closed-a", status: "fechada", is_group: false })
      .mockResolvedValueOnce({ id: "active-b", status: "em_andamento", is_group: false });
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ params: { conversationId: "closed-a" } }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "active-b" },
    });
  });

  it("asks only for the instance and reopens its existing conversation", async () => {
    mocks.listConversations.mockResolvedValue({
      items: [
        {
          id: "existing-a",
          status: "aguardando",
          is_group: false,
          connection: { id: "a" },
        },
      ],
    });
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[1].click());
    await flush();
    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    expect(document.body.textContent).not.toContain("Escolher Departamento");

    await act(async () => button("Instância A").click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "existing-a" },
    });
    expect(getInboxTab()).toBe("standby");
  });

  it("keeps instance and compatible department selection in one modal", async () => {
    mocks.role = "admin";
    mocks.connections = [
      {
        id: "a",
        name: "Instância A",
        status: "connected",
        providerType: "evolution",
        logoUrl: "https://example.test/a.png",
      },
      { id: "b", name: "Instância B", status: "connected", providerType: "evolution" },
    ];
    mocks.departments.mockResolvedValue([
      {
        id: "department-a",
        name: "Comercial",
        connectionIds: ["a"],
        favoriteConnectionIds: [],
      },
      {
        id: "department-b",
        name: "Suporte",
        connectionIds: ["b"],
        favoriteConnectionIds: [],
      },
    ]);
    await mount();
    const contactButtons = document.querySelectorAll<HTMLButtonElement>(
      "ul li > button[aria-pressed]",
    );

    await act(async () => contactButtons[0].click());
    await flush();
    const startDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(
      (dialog) =>
        dialog.textContent?.includes(
          "Selecione a instância e o departamento para iniciar o atendimento.",
        ),
    );
    expect(startDialog).toBeDefined();
    expect(startDialog?.className).toContain("sm:max-w-[570px]");
    expect(startDialog?.textContent).toContain("Escolher Instância e Departamento");
    expect(startDialog?.textContent).toContain("INSTÂNCIAS");
    expect(startDialog?.textContent).toContain("DEPARTAMENTOS");
    expect(
      startDialog?.querySelector('img[alt="Foto de perfil do WhatsApp de Instância A"]'),
    ).not.toBeNull();
    expect(startDialog?.textContent).toContain(
      "Selecione uma instância para listar os departamentos disponíveis.",
    );
    await act(async () => button("Instância B").click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    const updatedDialog = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ).find((dialog) =>
      dialog.textContent?.includes(
        "Selecione a instância e o departamento para iniciar o atendimento.",
      ),
    );
    expect(updatedDialog).toBe(startDialog);
    expect(updatedDialog?.textContent).toContain("DEPARTAMENTOS (INSTÂNCIA B)");
    expect(updatedDialog?.textContent).toContain("Suporte");
    expect(updatedDialog?.textContent).not.toContain("Comercial");
    await act(async () => button("Suporte").click());
    expect(button("Iniciar Atendimento").disabled).toBe(false);
    await act(async () => button("Instância A").click());
    await flush();
    expect(document.body.textContent).toContain("Comercial");
    expect(document.body.textContent).not.toContain("Suporte");
    expect(button("Iniciar Atendimento").disabled).toBe(true);
  });

  it("ignores a stale favorite that is no longer linked and opens the permitted department picker", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
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
    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    expect(document.body.textContent).toContain("Comercial");
    expect(document.body.textContent).not.toContain("Antigo");
  });

  it("does not create when the selected instance has no permitted department", async () => {
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    mocks.departments.mockResolvedValue([]);
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Escolher Departamento");
  });

  it("repairs the missing default department link for the tenant administrator", async () => {
    mocks.role = "admin";
    mocks.connections = [
      { id: "a", name: "Instância A", status: "connected", providerType: "evolution" },
    ];
    mocks.departments.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: "tenant-a:atendimento",
        name: "Atendimento",
        connectionIds: ["a"],
        favoriteConnectionIds: ["a"],
      },
    ]);
    await mount();

    await act(async () => (document.querySelector("ul li button") as HTMLButtonElement).click());
    await flush();

    expect(mocks.ensureDepartmentConnection).toHaveBeenCalledWith("a");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Escolher Instância e Departamento");
    await act(async () => button("Atendimento").click());
    await act(async () => button("Iniciar Atendimento").click());
    await flush();

    expect(mocks.create).toHaveBeenCalledWith({
      contactId: "0",
      connectionId: "a",
      departmentId: "tenant-a:atendimento",
      assignToSelf: true,
      reuseExistingOpen: true,
    });
  });
});
