import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateQuickReplyDto } from "./dto/create-quick-reply.dto";
import { UpdateQuickReplyDto } from "./dto/update-quick-reply.dto";
import { normalizeMessages } from "./quick-replies.controller";

const validateReply = (extra: object) =>
  validate(
    plainToInstance(CreateQuickReplyDto, {
      title: "boas-vindas",
      shortcut: "boas-vindas",
      content: "Olá",
      ...extra,
    }),
  );

describe("quick reply sequence validation", () => {
  it("accepts letters and numbers in the shortcut while keeping other characters blocked", async () => {
    expect(await validateReply({ shortcut: "status2026" })).toEqual([]);
    expect(await validate(plainToInstance(UpdateQuickReplyDto, { shortcut: "menu2" }))).toEqual([]);
    expect((await validateReply({ shortcut: "status 2026" })).length).toBeGreaterThan(0);
    expect((await validateReply({ shortcut: "status_2026" })).length).toBeGreaterThan(0);
  });

  it("accepts ten messages and rejects eleven before persistence", async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ text: `Mensagem ${index + 1}` }));
    expect(await validateReply({ messages: ten })).toEqual([]);
    expect(normalizeMessages(ten)).toHaveLength(10);
    expect(() => normalizeMessages([...ten, { text: "Extra" }])).toThrow(
      "Número máximo de mensagens atingido",
    );
  });
  it("accepts legacy requests and ordered messages with optional attachments", async () => {
    expect(await validateReply({})).toEqual([]);
    expect(
      await validateReply({
        messages: [
          { text: "Olá" },
          {
            text: "",
            attachment: {
              fileName: "teste.txt",
              mimeType: "text/plain",
              size: 1,
              dataUrl: "data:text/plain;base64,YQ==",
            },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects too many messages, oversized text and invalid attachments", async () => {
    for (const payload of [
      { messages: [] },
      { messages: Array.from({ length: 11 }, () => ({ text: "Olá" })) },
      { messages: [{ text: "x".repeat(2001) }] },
      {
        messages: [
          {
            text: "",
            attachment: {
              fileName: "x",
              mimeType: "text/plain",
              size: -1,
              dataUrl: "https://example.com",
            },
          },
        ],
      },
    ])
      expect((await validateReply(payload)).length).toBeGreaterThan(0);
  });

  it("rejects blank messages and preserves the registered order", () => {
    expect(() => normalizeMessages([{ text: "  " }])).toThrow("texto ou arquivo");
    expect(normalizeMessages([{ text: " Primeiro " }, { text: "Segundo" }])).toEqual([
      { text: "Primeiro", attachment: null },
      { text: "Segundo", attachment: null },
    ]);
    expect(normalizeMessages(undefined)).toBeUndefined();
  });

  it("validates attachment metadata and the same file policy used by the chat", () => {
    const attachment = {
      fileName: "teste.txt",
      mimeType: "text/plain",
      size: 1,
      dataUrl: "data:text/plain;base64,YQ==",
    };
    expect(normalizeMessages([{ text: "", attachment }])).toEqual([{ text: "", attachment }]);
    expect(() => normalizeMessages([{ text: "", attachment: { ...attachment, size: 2 } }])).toThrow(
      "dados do arquivo",
    );
    expect(() =>
      normalizeMessages([
        {
          text: "",
          attachment: {
            ...attachment,
            mimeType: "image/gif",
            dataUrl: "data:image/gif;base64,YQ==",
          },
        },
      ]),
    ).toThrow();
  });

  it("accepts recorded WebM audio with the browser codec parameter", () => {
    const attachment = {
      fileName: "audio.webm",
      mimeType: "audio/webm;codecs=opus",
      size: 1,
      dataUrl: "data:audio/webm;codecs=opus;base64,YQ==",
    };
    expect(normalizeMessages([{ text: "Bom dia", attachment }])).toEqual([
      { text: "Bom dia", attachment },
    ]);
  });
});
