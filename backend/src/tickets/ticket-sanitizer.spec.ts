import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeTicketHtml } from "./ticket-sanitizer";

describe("ticket HTML sanitizer", () => {
  it("preserves safe editor formatting and pasted data images", () => {
    const html =
      '<div style="text-align: center"><font face="Arial" size="3" color="#111827"><b>Olá</b></font></div><p align="right">Fim</p><img src="data:image/png;base64,AAAA" alt="Captura">';

    expect(sanitizeTicketHtml(html)).toBe(html);
    expect(htmlToText(html)).toBe("Olá\nFim\n Imagem");
  });

  it.each([
    '<img src="javascript:alert(1)" onerror="alert(1)">',
    "<script>alert(1)</script><b>seguro</b>",
    '<svg onload="alert(1)"><circle></circle></svg><i>ok</i>',
    '<span style="background-image: url(javascript:alert(1)); color: red">x</span>',
    '<a href="javascript:alert(1)" onclick="alert(1)">link</a>',
    '<img src="https://tracker.example/pixel.png" alt="pixel">',
  ])("removes executable markup from %s", (input) => {
    const result = sanitizeTicketHtml(input);
    expect(result).not.toMatch(/script|onerror|onclick|javascript:|<svg|url\s*\(/i);
  });

  it("removes oversized embedded image sources", () => {
    const oversized = `data:image/png;base64,${"A".repeat(14_000_001)}`;
    expect(sanitizeTicketHtml(`<img src="${oversized}">`)).toBe("");
  });
});
