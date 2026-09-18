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
