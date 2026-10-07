import { describe, expect, it } from "vitest";
import { conversationPreview, formatPreviewDuration } from "./conversation-preview";

describe("conversation preview", () => {
  it("suppresses line breaks and renders WhatsApp bold without exposing markers", () => {
    expect(conversationPreview("*Rafael Nunes:*\nAlinhando com Gilberto")).toEqual({
      kind: "text",
      segments: [
        { text: "Rafael Nunes:", bold: true },
        { text: " Alinhando com Gilberto", bold: false },
      ],
      duration: null,
    });
  });

  it("identifies image and audio-only previews", () => {
    expect(conversationPreview("[imagem]", "image")).toMatchObject({
      kind: "image",
      segments: [{ text: "Foto", bold: false }],
    });
    expect(conversationPreview("[audio]", "voice", 2_000)).toEqual({
      kind: "audio",
      segments: [{ text: "Áudio", bold: false }],
      duration: "0:02",
    });
  });

  it("preserves emoji in formatted text", () => {
    expect(conversationPreview("*Equipe:* 👋 Olá").segments).toContainEqual({
      text: " 👋 Olá",
      bold: false,
    });
  });

  it("formats durations without a leading minute zero", () => {
    expect(formatPreviewDuration(65_000)).toBe("1:05");
  });
});
