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
  const renderSystemLog = async (content: string, conversationOriginatedAsLead = false) => {
    await React.act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MessageBubble
            m={
              {
                ...base,
                id: `system-${content}`,
                type: "system",
                content,
                author_name: "Natã Rabelo",
                created_at: new Date(2026, 8, 27, 14, 30).toISOString(),
              } as ApiMessage
            }
            agents={[]}
            contactName="Contato"
            conversationOriginatedAsLead={conversationOriginatedAsLead}
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
      type: "audio",
      content: "[áudio]",
      media_data: { file_name: "audio.ogg", state: "ready" },
    } as ApiMessage);
    expect(host.querySelector('[data-avatar-slot="spacer"]')?.className).toContain("w-[30px]");

    await render({
      ...base,
      type: "image",
      content: "[figurinha]",
      sticker: true,
      media_data: { file_name: "sticker.webp", mime_type: "image/webp", state: "ready" },
    } as ApiMessage);
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const stickerMedia = host.querySelector('[data-sticker-media="true"]');
    expect(host.querySelector('img[alt="Figurinha"]')).not.toBeNull();
    expect(host.textContent).not.toContain("[figurinha]");
    expect(stickerMedia?.className).not.toContain("border");
    expect(stickerMedia?.closest('[tabindex="0"]')?.className).toContain("bg-transparent");

    await render({
      ...base,
      content: "https://www.instagram.com/reel/example",
      link_preview: {
        url: "https://www.instagram.com/reel/example",
        title: "7 dias só carne",
        description: "Conteúdo compartilhado no Instagram",
        thumbnail_data_url: "data:image/jpeg;base64,/9j/2Q==",
      },
    } as ApiMessage);
    const previewLink = host.querySelector('[aria-label="Abrir preview de instagram.com"]');
    expect(previewLink?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(previewLink?.getAttribute("target")).toBe("_blank");
    expect(host.textContent).toContain("7 dias só carne");
    expect(host.textContent).toContain("instagram.com");
    expect(host.querySelector('img[alt="Imagem de prévia do link"]')).not.toBeNull();
    expect(host.querySelector('a[href="https://www.instagram.com/reel/example"]')).not.toBeNull();

    await render({
      ...base,
      type: "document",
      media_data: { file_name: "relatorio.pdf", state: "ready" },
    } as ApiMessage);
    expect(host.textContent).toContain("relatorio.pdf");
    await render({ ...base, deleted_for_everyone: true });
    expect(host.textContent).toContain("Linha 1");
    const deletedLabel = [...host.querySelectorAll("p")].find(
      (item) => item.textContent === "Mensagem apagada",
    );
    expect(deletedLabel?.className).toContain("text-red-500");
    expect(deletedLabel?.className).toContain("italic");
    expect(host.textContent).not.toContain("Esta mensagem foi apagada");

    await render({ ...base, type: "video", forwarded: true });
    expect(host.querySelector('[aria-label="Mensagem encaminhada"]')?.textContent).toContain(
      "Encaminhada",
    );

    await render({ ...base, forwarded: false });
    expect(host.querySelector('[aria-label="Mensagem encaminhada"]')).toBeNull();

    await render({
      ...base,
      content: "Ok",
      quoted: {
        message_id: null,
        provider_message_id: "quoted-text",
        content_preview: "oi sm",
        type: "text",
        author_name: "Douglas Rezende",
        media_data: null,
      },
    } as ApiMessage);
    expect(host.textContent).toContain("Douglas Rezende");
    expect(host.textContent).toContain("oi sm");

    await render({
      ...base,
      content: "Blz",
      quoted: {
        message_id: "quoted-audio",
        provider_message_id: "quoted-audio-provider",
        content_preview: "[audio]",
        type: "voice",
        author_name: "Douglas Rezende",
        media_data: { duration_ms: 6_000, state: "ready" },
      },
    } as ApiMessage);
    expect(host.textContent).toContain("Douglas Rezende");
    expect(host.textContent).toContain("Mensagem de voz (0:06)");

    await render({
      ...base,
      content: "Respondendo link",
      quoted: {
        message_id: "quoted-link",
        provider_message_id: "quoted-link-provider",
        content_preview: "https://www.youtube.com/shorts/example",
        type: "text",
        author_name: "Douglas Rezende",
        link_preview: {
          url: "https://www.youtube.com/shorts/example",
          title: "Um Muay Thai",
          description: "Vídeo compartilhado",
          thumbnail_data_url: "data:image/jpeg;base64,/9j/2Q==",
        },
        media_data: null,
      },
    } as ApiMessage);
    expect(host.textContent).toContain("Douglas Rezende");
    expect(host.textContent).toContain("Um Muay Thai");
    expect(host.textContent).toContain("youtube.com");
    expect(host.querySelector('img[alt="Imagem de prévia do link citado"]')).not.toBeNull();

    await render({
      ...base,
      content: "Legal",
      quoted: {
        message_id: "quoted-sticker",
        provider_message_id: "quoted-sticker-provider",
        content_preview: "[figurinha]",
        type: "image",
        author_name: "Douglas Rezende",
        media_data: { mime_type: "image/webp", state: "ready" },
      },
    } as ApiMessage);
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.querySelector('img[alt="Figurinha citada"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Figurinha");
    expect(host.textContent).toContain("Douglas Rezende");

    await renderSystemLog("Nova conversa (passiva)");
    expect(host.textContent).toContain("NOVA CONVERSA");
    expect(host.textContent).toContain("27.SET.2026 14:30");
    expect(host.textContent).toContain("— 27.SET.2026 14:30");
    const lifecycleTimestamp = [...host.querySelectorAll("span")].find((item) =>
      item.textContent?.startsWith("— 27.SET.2026 14:30"),
    );
    expect(lifecycleTimestamp?.className).toContain("ml-1");
    expect(lifecycleTimestamp?.className).not.toContain("ml-2");
    expect(host.textContent).not.toContain("PASSIVA");

    await renderSystemLog("Nova lead (passiva)");
    expect(host.textContent).toContain("NOVO LEAD");
    expect(host.textContent).toContain("27.SET.2026 14:30");
    expect(host.textContent).not.toContain("PASSIVA");

    await renderSystemLog("Nova conversa (passiva)", true);
    expect(host.textContent).toContain("NOVO LEAD");
    expect(host.textContent).not.toContain("NOVA CONVERSA");

    await renderSystemLog("Atendimento iniciado (passivo) - protocolo: 000166");
    const passiveStartLog = host.querySelector("[data-service-start-log]")!;
    const passiveLines = [...passiveStartLog.querySelectorAll("p")].map((line) => line.textContent);
    expect(passiveLines).toEqual([
      "ATENDIMENTO INICIADO — 27.SET.2026 14:30",
      "TIPO: PASSIVO — PROTOCOLO: 000166",
      "ATENDENTE: Natã Rabelo",
    ]);
    expect(passiveStartLog.className).toContain("flex-col");
    expect(passiveStartLog.className).toContain("items-center");
    expect(passiveStartLog.className).toContain("justify-center");
    expect(passiveStartLog.className).toContain("text-center");
    expect(passiveStartLog.className).toContain("rounded-full");

    await renderSystemLog("Atendimento iniciado (ativa) - protocolo: 000167");
    const activeLines = [...host.querySelectorAll("[data-service-start-log] p")].map(
      (line) => line.textContent,
    );
    expect(activeLines[1]).toBe("TIPO: ATIVO — PROTOCOLO: 000167");

    await renderSystemLog("Conversa encerrada");
    const closedLog = host.querySelector("[data-service-closed-log]")!;
    const closedLines = [...closedLog.querySelectorAll("p")].map((line) => line.textContent);
    expect(closedLines).toEqual([
      "ATENDIMENTO ENCERRADO — 27.SET.2026 14:30",
      "ATENDENTE: Natã Rabelo",
    ]);
    expect(closedLog.className).toContain("flex-col");
    expect(closedLog.className).toContain("items-center");
    expect(closedLog.className).toContain("justify-center");
    expect(closedLog.className).toContain("text-center");
    expect(closedLog.className).toContain("rounded-full");

    await renderSystemLog("Conversa encerrada - protocolo 000168.");
    expect(
      [...host.querySelectorAll("[data-service-closed-log] p")].map((line) => line.textContent),
    ).toEqual(["ATENDIMENTO ENCERRADO — 27.SET.2026 14:30", "ATENDENTE: Natã Rabelo"]);

    await renderSystemLog("Conversa encerrada via remoção da instância");
    expect(host.querySelector("[data-service-closed-log]")).toBeNull();
    expect(host.textContent).toContain("CONVERSA ENCERRADA VIA REMOÇÃO DA INSTÂNCIA");
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
