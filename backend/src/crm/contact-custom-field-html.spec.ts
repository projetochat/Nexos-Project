import { describe, expect, it } from "vitest";
import {
  isHtmlContactCustomField,
  sanitizeContactCustomFieldHtml,
  sanitizeContactCustomFieldValueForOutput,
} from "./contact-custom-field-html";

describe("contact custom field HTML sanitizer", () => {
  it("preserves the formatting emitted by the existing rich-text editor", () => {
    const input =
      '<div style="text-align: center"><font face="Arial" size="3" color="#111827"><b>Olá</b></font></div><ul><li>Item</li></ul>';
    expect(sanitizeContactCustomFieldHtml(input)).toBe(
      '<div style="text-align: center"><font face="Arial" size="3" color="#111827"><b>Olá</b></font></div><ul><li>Item</li></ul>',
    );
  });

  it.each([
    '<img src=x onerror="globalThis.pwned=1">texto',
    "<script>globalThis.pwned=1</script><b>seguro</b>",
    '<svg><a xlink:href="javascript:alert(1)">x</a></svg><i>ok</i>',
    "<math><mtext><img src=x onerror=alert(1)></mtext></math><strong>ok</strong>",
    "<ScRiPt\n>globalThis.pwned=1</sCrIpT><u>ok</u>",
    '<div onclick="alert(1)" style="background-image:url(javascript:alert(1)); color: red">x</div>',
    '<span style="color: red; background-color: u\\72l(javascript:alert(1))">x</span>',
    '<a href="java&#x73;cript:alert(1)">link</a>',
    '<font color="red" onmouseover="alert(1)">x</font>',
  ])("removes executable markup from %s", (input) => {
    const result = sanitizeContactCustomFieldHtml(input);
    expect(result).not.toMatch(
      /script|onerror|onclick|onmouseover|javascript:|<img|<svg|url\s*\(/i,
    );
  });

  it("only enables HTML sanitization for the explicit HTML field variant", () => {
    expect(isHtmlContactCustomField('{"text":{"variant":"html"}}')).toBe(true);
    expect(isHtmlContactCustomField('{"text":{"variant":"long"}}')).toBe(false);
    expect(isHtmlContactCustomField("invalid")).toBe(false);
  });

  it("sanitizes a legacy plain-text value when its field is later switched to HTML", () => {
    expect(
      sanitizeContactCustomFieldValueForOutput(
        { type: "TEXT", mask: '{"text":{"variant":"html"}}' },
        '<img src=x onerror="alert(1)"><b>mantido</b>',
      ),
    ).toBe("<b>mantido</b>");
  });

  it("does not rewrite values for non-HTML field variants", () => {
    expect(
      sanitizeContactCustomFieldValueForOutput(
        { type: "TEXT", mask: '{"text":{"variant":"short"}}' },
        "<texto literal>",
      ),
    ).toBe("<texto literal>");
  });

  it("preserves null values without attempting HTML parsing", () => {
    expect(
      sanitizeContactCustomFieldValueForOutput(
        { type: "TEXT", mask: '{"text":{"variant":"html"}}' },
        null,
      ),
    ).toBeNull();
  });
});
