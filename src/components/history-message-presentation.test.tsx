// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { ApiMessage } from "@/lib/trixus-api";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
  useNavigate: () => vi.fn(),
}));
vi.mock("../routes/contatos", () => ({ ContactFormModal: () => null, contactPayload: vi.fn() }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ id: "viewer" }) }));
vi.mock("@/lib/trixus-api", () => ({
  messageApi: { downloadMedia: vi.fn(async () => new Blob(["media"])) },
}));
import { MessageBubble } from "../routes/inbox.$conversationId";
it("preserves formatting, renders media, positions reactions outside and keeps history read-only", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = vi.fn(() => "blob:isolated-media");
  URL.revokeObjectURL = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const base = {
    id: "one",
    conversation_id: "history",
    sender: "contact",
    direction: "inbound",
    type: "text",
    content: "*Nome:*\n\nLinha 1\n_Linha 2_",
    created_at: "2026-09-22T12:00:00Z",
    reactions: [{ id: "r", emoji: "👍" }],
  } as ApiMessage;
  const render = async (message: ApiMessage) => {
    await React.act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MessageBubble
            m={message}
            agents={[]}
            contactName="Contato"
            galleryImages={[]}
            readOnly
          />
        </QueryClientProvider>,
      );
    });
  };
  try {
    await render(base);
    expect(host.querySelector("strong")?.textContent).toBe("Nome:");
    expect(host.querySelector("em")?.textContent).toBe("Linha 2");
    expect(host.textContent).toContain("\n\nLinha 1\n");
    expect(host.querySelector('[aria-label="Reações da mensagem"]')?.className).toContain(
      "absolute -bottom-3",
    );
    expect(host.querySelector('[aria-label="Ações da mensagem"]')).toBeNull();
    await render({
      ...base,
      reactions: ["👍", "👍", "❤️", "😂", "😮", "🙏", "🔥"].map((emoji, index) => ({
        id: String(index),
        emoji,
      })),
    } as ApiMessage);
    const badge = host.querySelector('[aria-label="Reações da mensagem"]')!;
    expect(badge.querySelectorAll("span")).toHaveLength(4);
    expect(
      [...badge.querySelectorAll("span")].map((item) => item.getAttribute("aria-label")),
    ).toContain("👍: 2");
    expect(badge.querySelector('[aria-label="7 reações no total"]')?.textContent).toBe("7");
    expect(badge.className).toContain("max-w-32");
    expect(badge.className).toContain("overflow-hidden");
    expect(badge.getAttribute("title")).toContain("🔥 1");
    for (const [type, tag] of [
      ["image", "img"],
      ["video", "video"],
      ["audio", "audio"],
    ] as const) {
      await render({
        ...base,
        type,
        media_data: { file_name: "arquivo", state: "ready" },
      } as ApiMessage);
      expect(host.querySelector(`${tag}[src="blob:isolated-media"]`)).not.toBeNull();
    }
    await render({
      ...base,
      type: "document",
      media_data: { file_name: "relatorio.pdf", state: "ready" },
    } as ApiMessage);
    expect(host.textContent).toContain("relatorio.pdf");
    await render({ ...base, deleted_for_everyone: true });
    expect(host.textContent).toContain("Esta mensagem foi apagada");
    expect(host.querySelector("strong")).toBeNull();
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
