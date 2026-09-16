// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiQuickReply } from "./trixus-api";

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/trixus-api", () => ({ quickReplyApi: api }));
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
