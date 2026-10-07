// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxContactPicker } from "./inbox-contact-picker";

const mocks = vi.hoisted(() => ({ listContacts: vi.fn(), contactOptions: vi.fn() }));

vi.mock("@/lib/trixus-api", () => ({
  crmApi: {
    listContacts: (...args: unknown[]) => mocks.listContacts(...args),
    contactOptions: (...args: unknown[]) => mocks.contactOptions(...args),
  },
}));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

const contacts = [
  {
    id: "contact-2",
    nome: "Zuleica",
    telefone: "11911112222",
    normalizedPhone: "5511911112222",
    avatar_url: null,
    instancia: "instance-1",
    instanceIds: ["instance-1"],
  },
  {
    id: "contact-1",
    nome: "Amanda SDE",
    telefone: "21972245484",
    normalizedPhone: "5521972245484",
    avatar_url: "https://example.test/amanda.jpg",
    instancia: "instance-1",
    instanceIds: ["instance-1"],
  },
];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.listContacts.mockImplementation(async ({ q }: { q?: string }) => {
    const items = q
      ? contacts.filter((contact) => contact.nome.toLowerCase().includes(q.toLowerCase()))
      : contacts;
    return { items, page: 1, pageSize: 10_000, total: items.length, totalPages: 1 };
  });
  mocks.contactOptions.mockResolvedValue({
    instances: [
      {
        id: "instance-1",
        value: "instance-1",
        name: "Flow iD",
        externalReference: "flow-id",
        ownerPhone: "556296171414",
      },
    ],
    departments: [],
    profiles: [],
    tags: [],
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.clearAllMocks();
});

it("keeps the real instance fixed while searching and prepares it with multiple selected contacts", async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <InboxContactPicker
          priorityInstances={["flow-id", "Flow iD"]}
          onClose={vi.fn()}
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));

  expect(document.body.textContent).toContain("Número da instância");
  expect(document.body.textContent).toContain("Flow iD");
  expect(document.body.textContent).toContain("+55 62 9617-1414");
  expect(mocks.listContacts).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, pageSize: 100 }),
  );
  const instanceButton = document.querySelector<HTMLButtonElement>(
    '[aria-label="Remover Flow iD"]',
  );
  expect(instanceButton?.disabled).toBe(true);

  const amanda = document.querySelector<HTMLButtonElement>('[aria-label="Selecionar Amanda SDE"]');
  const zuleica = document.querySelector<HTMLButtonElement>('[aria-label="Selecionar Zuleica"]');
  await act(async () => {
    amanda?.click();
    zuleica?.click();
  });

  const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar contato"]')!;
  await act(async () => {
    search.value = "Amanda";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
  expect(document.body.textContent).toContain("Flow iD");

  const forward = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Encaminhar",
  );
  await act(async () => forward?.click());

  expect(onSelect).toHaveBeenCalledOnce();
  const selections = onSelect.mock.calls[0][0];
  expect(selections).toHaveLength(3);
  expect(selections.map((item: { contact: { nome: string } }) => item.contact.nome)).toEqual([
    "Flow iD",
    "Amanda SDE",
    "Zuleica",
  ]);
  expect(selections.every((item: { file: File }) => item.file instanceof File)).toBe(true);
});

it("loads the next contact page when the internal list reaches the end", async () => {
  mocks.listContacts.mockImplementation(async ({ page }: { page: number }) => ({
    items: page === 1 ? [contacts[1]] : [contacts[0]],
    page,
    pageSize: 100,
    total: 2,
    totalPages: 2,
  }));
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <InboxContactPicker
          priorityInstances={["instance-1"]}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));

  expect(document.body.textContent).toContain("Amanda SDE");
  expect(document.body.textContent).not.toContain("Zuleica");
  const list = document.querySelector<HTMLElement>("[data-share-contact-list]")!;
  Object.defineProperties(list, {
    scrollHeight: { configurable: true, value: 500 },
    clientHeight: { configurable: true, value: 300 },
    scrollTop: { configurable: true, value: 200 },
  });
  await act(async () => {
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(mocks.listContacts).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2, pageSize: 100 }),
  );
  expect(document.body.textContent).toContain("Zuleica");
});

it("disables confirmation when the current connection has no real owner number", async () => {
  mocks.contactOptions.mockResolvedValueOnce({
    instances: [{ id: "instance-1", value: "instance-1", name: "Flow iD", ownerPhone: null }],
    departments: [],
    profiles: [],
    tags: [],
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <InboxContactPicker
          priorityInstances={["instance-1"]}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));

  expect(document.body.textContent).toContain("número real da instância ainda não está disponível");
  const forward = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "Encaminhar",
  );
  expect(forward?.disabled).toBe(true);
});
