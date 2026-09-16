import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateQuickReplyDto } from "./dto/create-quick-reply.dto";
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
        intervalSeconds: 3,
      }),
    ).toEqual([]);
  });

  it("rejects too many messages, oversized text, invalid attachments and intervals", async () => {
    for (const payload of [
      { messages: [] },
      { messages: Array.from({ length: 21 }, () => ({ text: "Olá" })) },
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
      { intervalSeconds: -1 },
      { intervalSeconds: 61 },
      { intervalSeconds: 0.5 },
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
});
