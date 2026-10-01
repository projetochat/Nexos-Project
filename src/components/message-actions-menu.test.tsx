// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { MessageActionsMenu } from "./message-actions-menu";
import type { ApiMessage } from "@/lib/trixus-api";

it("opens message actions, handles reply/copy/reaction/download and restricts unsupported actions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  const reply = vi.fn(),
    react = vi.fn().mockResolvedValue(undefined),
    download = vi.fn().mockResolvedValue(undefined),
    copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  try {
    await React.act(() =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={
              {
                id: "m1",
                conversation_id: "c1",
                sender: "contact",
                type: "image",
                content: "Legenda",
                status: "delivered",
                created_at: "2026-09-18T12:00:00Z",
                media_data: { state: "ready" },
              } as ApiMessage
            }
            onReply={reply}
            onReact={react}
            onDownload={download}
          />
        </QueryClientProvider>,
      ),
    );
    const open = async () => {
      await React.act(() => host.querySelector("button")!.click());
    };
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
    await open();
    expect(button("Editar").disabled).toBe(true);
    expect(button("Apagar").disabled).toBe(true);
    expect(button("Reenviar").disabled).toBe(true);
    await React.act(() => button("Responder").click());
    expect(reply).toHaveBeenCalledOnce();
    await open();
    await React.act(() => button("Copiar").click());
    expect(copy).toHaveBeenCalledWith("Legenda");
    await open();
    await React.act(() => button("Salvar como…").click());
    expect(download).toHaveBeenCalledOnce();
    await open();
    await React.act(() => button("👍").click());
    expect(react).toHaveBeenCalledWith("👍");
    await open();
    await React.act(() => button("Informações").click());
    expect(document.body.textContent).toContain("Informações da mensagem");
  } finally {
    await React.act(() => root.unmount());
    host.remove();
    qc.clear();
  }
});

it("uses the approved destructive copy for deleting an outgoing message", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  try {
    await React.act(() =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={
              {
                id: "m2",
                conversation_id: "c1",
                sender: "agent",
                type: "text",
                content: "Mensagem de teste",
                status: "sent",
                created_at: "2026-09-27T12:00:00Z",
              } as ApiMessage
            }
            onReply={vi.fn()}
            onReact={vi.fn().mockResolvedValue(undefined)}
            onDownload={vi.fn().mockResolvedValue(undefined)}
          />
        </QueryClientProvider>,
      ),
    );
    await React.act(() => host.querySelector("button")!.click());
    expect(document.body.textContent).not.toContain("Agendar mensagem");
    const deleteAction = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Apagar",
    );
    await React.act(() => deleteAction?.click());

    expect(document.body.textContent).toContain("Apagar Mensagem");
    expect(document.body.textContent).toContain("Deseja realmente apagar a mensagem?");
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Apagar",
    );
    expect(confirm?.className).toContain("bg-destructive");
  } finally {
    await React.act(() => root.unmount());
    host.remove();
    qc.clear();
  }
});

it("opens on a context-menu request and allows editing an outgoing image caption", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  const message = {
    id: "m3",
    conversation_id: "c1",
    sender: "agent",
    type: "image",
    content: "Legenda da imagem",
    status: "sent",
    created_at: "2026-09-27T12:00:00Z",
    media_data: { state: "ready" },
  } as ApiMessage;
  try {
    await React.act(() =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={message}
            onReply={vi.fn()}
            onReact={vi.fn().mockResolvedValue(undefined)}
            onDownload={vi.fn().mockResolvedValue(undefined)}
            openRequest={1}
          />
        </QueryClientProvider>,
      ),
    );
    const editAction = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Editar",
    );
    expect(editAction?.disabled).toBe(false);
    await React.act(() => editAction?.click());
    expect(document.body.textContent).toContain("Editar mensagem");
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Legenda da imagem",
    );
  } finally {
    await React.act(() => root.unmount());
    host.remove();
    qc.clear();
  }
});
