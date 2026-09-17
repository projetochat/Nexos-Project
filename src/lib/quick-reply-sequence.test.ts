import { describe, expect, it, vi } from "vitest";
import type { ApiQuickReply } from "./trixus-api";
import {
  assertQuickReplySaved,
  createSequence,
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
      intervalSeconds: 2,
    }),
  );

describe("quick reply sequences", () => {
  it("rejects an outdated server response that kept only the combined text", () => {
    const messages = [{ text: "Primeira" }, { text: "Segunda" }];
    expect(() => assertQuickReplySaved(reply({ texto: "Primeira\nSegunda" }), messages, 0)).toThrow(
      "não confirmou",
    );
    expect(() =>
      assertQuickReplySaved(reply({ messages, intervalSeconds: 0 }), messages, 0),
    ).not.toThrow();
    expect(() =>
      assertQuickReplySaved(reply({ messages: [messages[0]], intervalSeconds: 0 }), messages, 0),
    ).toThrow("não confirmou");
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
  });

  it("waits for provider confirmation before sending the next text or file", async () => {
    const sequence = draft();
    const events: string[] = [];
    await sendSequence(sequence, new AbortController().signal, {
      send: async (item) => {
        events.push(`send:${item.text || item.attachment?.fileName}`);
        return { id: item.clientMessageId, status: "queued" };
      },
      get: async (id) => {
        events.push("confirmed");
        return { id, status: "sent" };
      },
      wait: async (ms) => {
        events.push(`wait:${ms}`);
      },
      progress: (sent) => {
        events.push(`progress:${sent}`);
      },
    });
    expect(events).toEqual([
      "send:Olá",
      "wait:1000",
      "confirmed",
      "progress:1",
      "wait:2000",
      "send:catalogo.pdf",
      "wait:1000",
      "confirmed",
      "progress:2",
      "wait:2000",
      "send:Posso ajudar?",
      "wait:1000",
      "confirmed",
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
      get: vi.fn(),
      wait: vi.fn().mockResolvedValue(undefined),
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
        get: vi.fn(),
        progress: vi.fn(),
      }),
    ).rejects.toThrow("mensagem 1 falhou");
    expect(send).toHaveBeenCalledTimes(1);
    expect(sequence.next).toBe(0);
  });

  it("keeps the queued message ID after timeout so continuing only checks its status", async () => {
    const sequence = draft();
    const send = vi.fn().mockResolvedValue({ id: "queued-id", status: "queued" });
    const get = vi.fn().mockResolvedValue({ id: "queued-id", status: "queued" });
    const transport = { send, get, progress: vi.fn(), wait: vi.fn().mockResolvedValue(undefined) };
    await expect(sendSequence(sequence, new AbortController().signal, transport)).rejects.toThrow(
      "ainda não foi confirmado",
    );
    expect(sequence.items[0].messageId).toBe("queued-id");
    get.mockResolvedValue({ id: "queued-id", status: "sent" });
    send.mockResolvedValue({ id: "other", status: "sent" });
    await sendSequence(sequence, new AbortController().signal, transport);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("pauses remaining items on navigation", async () => {
    const sequence = draft();
    const controller = new AbortController();
    const send = vi.fn().mockResolvedValue({ id: "first", status: "sent" });
    await expect(
      sendSequence(sequence, controller.signal, {
        send,
        get: vi.fn(),
        progress: () => controller.abort(),
      }),
    ).rejects.toThrow("interrompido");
    expect(sequence.next).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
