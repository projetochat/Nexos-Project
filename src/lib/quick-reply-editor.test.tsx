// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiQuickReply } from "./trixus-api";

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/trixus-api", () => ({
  quickReplyApi: api,
  crmApi: { listContactCustomFields: async () => [] },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/lib/perms", () => ({ useChatPerms: () => ({}) }));
import { QuickReplyEditor } from "../routes/mensagens-rapidas";

const initial = {
  id: "reply",
  atalho: "/teste",
  texto: "Primeira",
  departmentId: null,
  messages: [{ text: "Primeira" }, { text: "Segunda" }],
  intervalSeconds: 3,
  close_on_send: true,
} as ApiQuickReply;
let root: Root;
const click = async (button: Element) =>
  act(async () => {
    (button as HTMLButtonElement).click();
  });
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === text)!;
const texts = () => [...document.querySelectorAll("textarea")].map((element) => element.value);

describe("quick reply editor", () => {
  it("caps the sequence at ten and re-enables adding after removal", async () => {
    await act(async () =>
      root.render(
        <QuickReplyEditor
          open
          initial={initial}
          existingReplies={[]}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    for (let i = 0; i < 8; i++) await click(button("Adicionar mensagem"));
    expect(texts()).toHaveLength(10);
    expect((button("Adicionar mensagem") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("Número máximo de mensagens atingido");
    await click(document.querySelectorAll('[aria-label="Remover mensagem"]')[9]);
    expect((button("Adicionar mensagem") as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Número máximo de mensagens atingido");
  });

  it("inserts a variable at the cursor of the active message and defaults to keeping the conversation open", async () => {
    await act(async () =>
      root.render(
        <QuickReplyEditor
          open
          initial={null}
          existingReplies={[]}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      false,
    );
    expect(document.querySelector('[aria-label="Gravar áudio"]')).not.toBeNull();
    await click(button("Adicionar mensagem"));
    const second = document.querySelectorAll("textarea")[1];
    await act(async () => second.focus());
    await click(document.querySelector('[aria-label="Inserir variável"]')!);
    expect(
      document
        .querySelector('[aria-label^="Inserir variável contato:"]')
        ?.getAttribute("aria-label"),
    ).toContain("Nome do contato");
    await click(button("{{contato}}"));
    expect(texts()).toEqual(["", "{{contato}}"]);
  });
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    api.create.mockImplementation(async (data) => ({ ...initial, ...data }));
    api.update.mockImplementation(async (_id, data) => ({ ...initial, ...data }));
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("adds, removes and reorders messages, then saves the resulting sequence", async () => {
    await act(async () =>
      root.render(
        <QuickReplyEditor
          open
          initial={initial}
          existingReplies={[]}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    expect(texts()).toEqual(["Primeira", "Segunda"]);
    await click(button("Adicionar mensagem"));
    expect(texts()).toEqual(["Primeira", "Segunda", ""]);
    await click(document.querySelectorAll('[aria-label="Remover mensagem"]')[2]);
    await click(document.querySelectorAll('[aria-label="Mover para cima"]')[1]);
    expect(texts()).toEqual(["Segunda", "Primeira"]);
    await click(button("Salvar"));
    expect(api.update).toHaveBeenCalledWith(
      "reply",
      expect.objectContaining({
        messages: [{ text: "Segunda" }, { text: "Primeira" }],
        intervalSeconds: 3,
        closeOnSend: true,
      }),
    );
  });

  it("duplicates the complete sequence and keeps the original untouched", async () => {
    await act(async () =>
      root.render(
        <QuickReplyEditor
          open
          clone
          initial={initial}
          existingReplies={[initial]}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    await click(button("Salvar"));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcut: "teste-copia",
        messages: initial.messages,
        intervalSeconds: 3,
      }),
    );
    expect(api.update).not.toHaveBeenCalled();
    expect(initial.messages?.map((item) => item.text)).toEqual(["Primeira", "Segunda"]);
  });
});
