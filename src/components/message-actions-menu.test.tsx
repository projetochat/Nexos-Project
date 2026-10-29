// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { MessageActionsMenu } from "./message-actions-menu";
import type { ApiMessage } from "@/lib/trixus-api";

it("anchors a context-menu request at the pointer position", async () => {
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
                id: "context-image",
                conversation_id: "c1",
                sender: "contact",
                direction: "inbound",
                type: "image",
                content: "",
                status: "delivered",
                created_at: "2026-10-08T12:00:00Z",
                media_data: { state: "ready" },
              } as ApiMessage
            }
            onReact={vi.fn().mockResolvedValue(undefined)}
            onDownload={vi.fn().mockResolvedValue(undefined)}
            openRequest={1}
            openPosition={{ x: 320, y: 240 }}
          />
        </QueryClientProvider>,
      ),
    );
    const anchor = host.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(anchor?.className).toContain("fixed");
    expect(anchor?.style.left).toBe("320px");
    expect(anchor?.style.top).toBe("240px");
    expect(document.querySelectorAll('[aria-label="Ações da mensagem"]').length).toBeGreaterThan(1);
  } finally {
    await React.act(() => root.unmount());
    host.remove();
    qc.clear();
  }
});

it("opens message actions, handles reply/copy/reaction/download and restricts unsupported actions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  const reply = vi.fn(),
    react = vi.fn().mockResolvedValue(undefined),
    download = vi.fn().mockResolvedValue(undefined),
    copy = vi.fn().mockResolvedValue({ mode: "rich" });
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
                direction: "inbound",
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
            canEdit
            canDelete
            canSend
            onCopyMessage={copy}
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
    const actionSurfaces = document.querySelectorAll('[aria-label="Ações da mensagem"]');
    expect(actionSurfaces.item(actionSurfaces.length - 1).className).toContain("w-52");
    expect(button("Encaminhar").nextElementSibling).toBe(button("Baixar"));
    expect(button("Informações").nextElementSibling).toBe(button("Responder"));

    expect(button("Editar")).toBeUndefined();
    expect(button("Apagar")).toBeUndefined();
    expect(button("Reenviar")).toBeUndefined();
    expect(button("Baixar").nextElementSibling?.className).toContain("mt-1");
    await React.act(() => button("Responder").click());
    expect(reply).toHaveBeenCalledOnce();
    await open();
    await React.act(() => button("Copiar").click());
    expect(copy).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", type: "image" }));
    await open();
    await React.act(() => button("Baixar").click());
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

it("allows copying a ready image without a caption", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const copyMessage = vi.fn().mockResolvedValue({ mode: "rich" as const });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  const message = {
    id: "image-only",
    conversation_id: "c1",
    sender: "contact",
    direction: "inbound",
    type: "image",
    content: "",
    status: "delivered",
    created_at: "2026-10-05T12:00:00Z",
    media_data: { state: "ready" },
  } as ApiMessage;
  try {
    await React.act(() =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={message}
            onReact={vi.fn().mockResolvedValue(undefined)}
            onDownload={vi.fn().mockResolvedValue(undefined)}
            onCopyMessage={copyMessage}
          />
        </QueryClientProvider>,
      ),
    );
    await React.act(() => host.querySelector("button")!.click());
    const copyAction = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Copiar",
    );
    expect(copyAction?.disabled).toBe(false);
    await React.act(() => copyAction?.click());
    expect(copyMessage).toHaveBeenCalledWith(message);
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
                direction: "outbound",
                type: "text",
                content: "Mensagem de teste",
                status: "sent",
                created_at: "2026-09-27T12:00:00Z",
              } as ApiMessage
            }
            onReply={vi.fn()}
            onReact={vi.fn().mockResolvedValue(undefined)}
            onDownload={vi.fn().mockResolvedValue(undefined)}
            canEdit
            canDelete
            canSend
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
    direction: "outbound",
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
            canEdit
            canDelete
            canSend
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

it("keeps media actions blocked before first attendance while allowing caption text copy", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  const copy = vi.fn().mockResolvedValue({ mode: "text-only" });
  const message = {
    id: "not-started",
    conversation_id: "isolated",
    sender: "agent",
    direction: "outbound",
    type: "image",
    content: "Visible caption",
    status: "failed",
    created_at: "2026-10-28T12:00:00Z",
    media_data: { state: "ready" },
  } as ApiMessage;
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={message}
            mediaAccessAllowed={false}
            onReact={vi.fn()}
            onCopyMessage={copy}
            canSend
            openRequest={1}
          />
        </QueryClientProvider>,
      ),
    );
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
    expect(button("Baixar").disabled).toBe(true);
    expect(button("Encaminhar").disabled).toBe(true);
    expect(button("Reenviar").disabled).toBe(true);
    expect(button("Copiar").disabled).toBe(false);
    await React.act(async () => button("Copiar").click());
    expect(copy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "text", content: "Visible caption", media_data: null }),
    );
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
    qc.clear();
  }
});

it.each([
  { sender: "contact", direction: "inbound", status: "created", participant: null },
  {
    sender: "contact",
    direction: "inbound",
    status: "failed",
    participant: { name: "Participante sintético" },
  },
  {
    sender: "agent",
    direction: "inbound",
    status: "failed",
    participant: { name: "Participante sintético" },
  },
  { sender: "agent", direction: "outbound", status: "sent", participant: null },
  {
    sender: "agent",
    direction: "outbound",
    status: "failed",
    sent_at: "2026-10-28T12:00:00Z",
    participant: null,
  },
  { sender: "agent", direction: "outbound", status: "failed", participant: null },
])("hides received actions and only offers resend before a successful send: %j", async (data) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const qc = new QueryClient();
  try {
    await React.act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <MessageActionsMenu
            message={
              {
                id: "synthetic",
                conversation_id: "isolated",
                type: "text",
                content: "Teste",
                created_at: "2026-10-28T12:00:00Z",
                ...data,
              } as ApiMessage
            }
            onReact={vi.fn()}
            canEdit
            canDelete
            canSend
            openRequest={1}
          />
        </QueryClientProvider>,
      ),
    );
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
    const outgoing = data.sender === "agent" && data.direction === "outbound";
    expect(Boolean(button("Editar"))).toBe(outgoing);
    expect(Boolean(button("Apagar"))).toBe(outgoing);
    expect(Boolean(button("Reenviar"))).toBe(
      outgoing && data.status === "failed" && !("sent_at" in data),
    );
    expect(button("Informações")?.nextElementSibling).toBe(button("Responder"));
    if (outgoing) expect(button("Editar")?.nextElementSibling).toBe(button("Apagar"));
  } finally {
    await React.act(async () => root.unmount());
    qc.clear();
    host.remove();
  }
});
