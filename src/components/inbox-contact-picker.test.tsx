// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxContactPicker } from "./inbox-contact-picker";

const mocks = vi.hoisted(() => ({ listContacts: vi.fn() }));

vi.mock("@/lib/trixus-api", () => ({
  crmApi: { listContacts: (...args: unknown[]) => mocks.listContacts(...args) },
}));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.listContacts.mockResolvedValue({
    items: [
      {
        id: "contact-1",
        nome: "Natã R",
        telefone: "62992728679",
        normalizedPhone: "5562992728679",
        avatar_url: "https://example.test/nata.jpg",
        instancia: "instance-1",
        instanceIds: ["instance-1"],
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.clearAllMocks();
});

it("shows contact photo and formatted phone and returns contact metadata with the VCF", async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <InboxContactPicker
          priorityInstances={["instance-1"]}
          onClose={vi.fn()}
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  expect(document.body.textContent).toContain("Compartilhar Contato");
  expect(document.body.textContent).not.toContain(
    "Selecione um contato para anexar seu cartão à mensagem.",
  );
  expect(document.querySelector('img[alt="Natã R"]')?.getAttribute("src")).toBe(
    "https://example.test/nata.jpg",
  );
  expect(document.body.textContent).toContain("+55 62 99272-8679");

  const contactButton = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Natã R"),
  );
  await act(async () => contactButton?.click());

  expect(onSelect).toHaveBeenCalledOnce();
  const selection = onSelect.mock.calls[0][0];
  expect(selection.file).toBeInstanceOf(File);
  expect(selection.file.name).toBe("contato.vcf");
  expect(selection.contact).toMatchObject({
    nome: "Natã R",
    telefone: "62992728679",
    normalizedPhone: "5562992728679",
    avatar_url: "https://example.test/nata.jpg",
  });
});
