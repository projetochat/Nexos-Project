// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageForwardDialog } from "./message-forward-dialog";
import type { ApiMessage } from "@/lib/trixus-api";

const mocks = vi.hoisted(() => ({
  listContacts: vi.fn(),
  contactOptions: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  sendCopy: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/trixus-api", () => ({
  crmApi: {
    listContacts: (...args: unknown[]) => mocks.listContacts(...args),
    contactOptions: (...args: unknown[]) => mocks.contactOptions(...args),
  },
  conversationApi: {
    list: (...args: unknown[]) => mocks.listConversations(...args),
    create: (...args: unknown[]) => mocks.createConversation(...args),
  },
}));
vi.mock("@/lib/copy-message", () => ({
  sendMessageCopy: (...args: unknown[]) => mocks.sendCopy(...args),
}));
vi.mock("@/lib/realtime/invalidate-conversation", () => ({
  invalidateConversationQueries: (...args: unknown[]) => mocks.invalidate(...args),
}));

const contacts = [
  {
    id: "single",
    nome: "Contato Único",
    telefone: "5562999990000",
    avatar_url: null,
    instanceIds: ["a"],
    instancia: "a",
  },
  {
    id: "multiple",
    nome: "Contato Duplo",
    telefone: "5562888880000",
    avatar_url: null,
    instanceIds: ["a", "b"],
    instancia: "a",
  },
];

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((element) =>
    element.textContent?.trim().includes(text),
  ) as HTMLButtonElement;

async function flush() {
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function mount(onClose = vi.fn()) {
  await React.act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <MessageForwardDialog
          message={{ id: "message", conversation_id: "source", type: "text" } as ApiMessage}
          onClose={onClose}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: vi.fn(() => "copy-id"),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.listContacts.mockResolvedValue({
    items: contacts,
    total: contacts.length,
    totalPages: 1,
    page: 1,
    pageSize: 10,
  });
  mocks.contactOptions.mockResolvedValue({
    instances: [
      { id: "a", value: "a", name: "Instância A", color: "#22c55e", status: "CONNECTED" },
      { id: "b", value: "b", name: "Instância B", color: "#a8325a", status: "CONNECTED" },
    ],
    tags: [],
    departments: [],
    profiles: [],
  });
  mocks.sendCopy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await React.act(() => root.unmount());
  client.clear();
  host.remove();
});

describe("message forwarding contact picker", () => {
  it("lists every contact, asks for an instance and creates a conversation when needed", async () => {
    const close = await mount();
    expect(mocks.listContacts).toHaveBeenCalledWith({ q: undefined, page: 1, pageSize: 10 });
    expect(document.body.textContent).toContain("Contato Único");
    expect(document.body.textContent).toContain("Contato Duplo");

    await React.act(() => button("Contato Duplo").click());
    expect(document.body.textContent).toContain("Escolher Instância");
    expect(button("Encaminhar").disabled).toBe(true);
    await React.act(() => button("Instância B").click());
    expect(button("Encaminhar").disabled).toBe(false);

    mocks.listConversations.mockResolvedValue({ items: [], total: 0, totalPages: 0 });
    mocks.createConversation.mockResolvedValue({ id: "created-conversation" });
    await React.act(() => button("Encaminhar").click());
    await flush();

    expect(mocks.listConversations).toHaveBeenCalledWith({
      contactId: "multiple",
      instance: "b",
      tab: "ativas",
      page: 1,
      pageSize: 1,
      sort: "lastMessageAt",
      direction: "desc",
    });
    expect(mocks.createConversation).toHaveBeenCalledWith({
      contactId: "multiple",
      connectionId: "b",
      assignToSelf: true,
    });
    expect(mocks.sendCopy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message" }),
      "created-conversation",
      "copy-id",
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("reuses an active conversation instead of creating another one", async () => {
    await mount();
    await React.act(() => button("Contato Único").click());
    mocks.listConversations.mockResolvedValue({
      items: [{ id: "active-conversation" }],
      total: 1,
      totalPages: 1,
    });
    await React.act(() => button("Encaminhar").click());
    await flush();

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.sendCopy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message" }),
      "active-conversation",
      "copy-id",
    );
  });
});
