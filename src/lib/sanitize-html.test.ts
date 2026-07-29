import { describe, expect, it } from "vitest";
import { sanitizeRichTextHtml } from "./sanitize-html";

describe("sanitizeRichTextHtml", () => {
  it("removes executable tags and event handlers", () => {
    const sanitized = sanitizeRichTextHtml(
      '<p>Ok</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
    );

    expect(sanitized).toContain("<p>Ok</p>");
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("onerror");
  });

  it("blocks javascript URLs while keeping allowed rich text", () => {
    const sanitized = sanitizeRichTextHtml(
      '<a href="javascript:alert(1)">bad</a><strong>safe</strong>',
    );

    expect(sanitized).toContain("<strong>safe</strong>");
    expect(sanitized).not.toContain("javascript:");
  });

  it("allows pasted data images for support screenshots", () => {
    const sanitized = sanitizeRichTextHtml('<img src="data:image/png;base64,AAAA" alt="anexo">');

    expect(sanitized).toContain('src="data:image/png;base64,AAAA"');
    expect(sanitized).toContain('alt="anexo"');
  });
});
