import { describe, expect, it, vi } from "vitest";
import type { ApiQuickReply } from "./trixus-api";
import {
  assertQuickReplySaved,
  createSequence,
  quickReplyAttachmentMediaType,
  quickReplyMessages,
  sendSequence,
} from "./quick-reply-sequence";

const reply = (overrides: Partial<ApiQuickReply> = {}) =>
  ({
    texto: "Mensagem antiga",
    close_on_send: false,
    ...overrides,
  }) as ApiQuickReply;
const attachment = {
  fileName: "catalogo.pdf",
  mimeType: "application/pdf",
  size: 1,
  dataUrl: "data:application/pdf;base64,YQ==",
};
const draft = () =>
  createSequence(
    reply({
      messages: [{ text: "Olá" }, { text: "", attachment }, { text: "Posso ajudar?" }],
    }),
  );

describe("quick reply sequences", () => {
  it("envia anexos de áudio como mensagem de voz do WhatsApp", () => {
    expect(quickReplyAttachmentMediaType("audio/ogg")).toBe("voice");
    expect(quickReplyAttachmentMediaType("audio/mpeg")).toBe("voice");
    expect(quickReplyAttachmentMediaType("application/pdf")).toBe("document");
  });

  it("rejects an outdated server response that kept only the combined text", () => {
    const messages = [{ text: "Primeira" }, { text: "Segunda" }];
    expect(() => assertQuickReplySaved(reply({ texto: "Primeira\nSegunda" }), messages)).toThrow(
      "não confirmou",
    );
    expect(() => assertQuickReplySaved(reply({ messages }), messages)).not.toThrow();
    expect(() => assertQuickReplySaved(reply({ messages: [messages[0]] }), messages)).toThrow(
      "não confirmou",
    );
  });
  it("preserves legacy text and attachments", () => {
    expect(
      quickReplyMessages(
        reply({
          attachmentDataUrl: attachment.dataUrl,
          attachmentFileName: attachment.fileName,
          attachmentMimeType: attachment.mimeType,
          attachmentSize: 1,
        }),
      ),
    ).toEqual([{ text: "Mensagem antiga", attachment }]);
  });

  it("resolves variables before a sequence is sent", () => {
    const sequence = createSequence(
      reply({ messages: [{ text: "Olá, {{nome}}" }, { text: "Instância: {{instancia}}" }] }),
      (text) => text.replace("{{nome}}", "Ana").replace("{{instancia}}", "Comercial"),
    );

    expect(sequence.items.map((item) => item.text)).toEqual(["Olá, Ana", "Instância: Comercial"]);
    expect(sequence.items.map((item) => item.templateText)).toEqual([
      "Olá, {{nome}}",
      "Instância: {{instancia}}",
    ]);
  });

  it("keeps the raw template so each item is resolved by the backend at effective send", async () => {
    const sequence = createSequence(
      reply({ messages: [{ text: "{{saudacao}}" }] }),
      () => "Bom dia",
    );
    const sent: string[] = [];
    await sendSequence(sequence, new AbortController().signal, {
      send: async (item) => {
        sent.push(item.templateText ?? item.text);
        return { id: item.clientMessageId, status: "sent" };
      },
      progress: () => {},
    });
    expect(sent).toEqual(["{{saudacao}}"]);
  });

  it("dispatches every item in order without waiting between messages", async () => {
    const sequence = draft();
    const events: string[] = [];
    await sendSequence(sequence, new AbortController().signal, {
      send: async (item) => {
        events.push(`send:${item.text || item.attachment?.fileName}`);
        return { id: item.clientMessageId, status: "queued" };
      },
      progress: (sent) => {
        events.push(`progress:${sent}`);
      },
    });
    expect(events).toEqual([
      "send:Olá",
      "progress:1",
      "send:catalogo.pdf",
      "progress:2",
      "send:Posso ajudar?",
      "progress:3",
    ]);
  });

  it("retries uncertain requests with the same ID without repeating confirmed items", async () => {
    const sequence = draft();
    const send = vi
      .fn()
      .mockResolvedValueOnce({ id: "first", status: "sent" })
      .mockRejectedValueOnce(new Error("network"));
    const transport = {
      send,
      progress: vi.fn(),
    };
    await expect(sendSequence(sequence, new AbortController().signal, transport)).rejects.toThrow(
      "network",
    );
    expect(sequence.next).toBe(1);
    const retryId = send.mock.calls[1][0].clientMessageId;
    send.mockResolvedValue({ id: "next", status: "sent" });
    await sendSequence(sequence, new AbortController().signal, transport);
    expect(send.mock.calls[2][0].clientMessageId).toBe(retryId);
    expect(send).toHaveBeenCalledTimes(4);
    expect(sequence.next).toBe(3);
  });

  it("stops at a failed item and never sends later items", async () => {
    const sequence = draft();
    const send = vi.fn().mockResolvedValue({ id: "failed", status: "failed" });
    await expect(
      sendSequence(sequence, new AbortController().signal, {
        send,
        progress: vi.fn(),
      }),
    ).rejects.toThrow("mensagem 1 falhou");
    expect(send).toHaveBeenCalledTimes(1);
    expect(sequence.next).toBe(0);
  });

  it("pauses remaining items on navigation", async () => {
    const sequence = draft();
    const controller = new AbortController();
    const send = vi.fn().mockResolvedValue({ id: "first", status: "sent" });
    await expect(
      sendSequence(sequence, controller.signal, {
        send,
        progress: () => controller.abort(),
      }),
    ).rejects.toThrow("interrompido");
    expect(sequence.next).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
