// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  insertTicketEditorHtml,
  normalizeTicketEditorHtml,
  readTicketEditorHtml,
  ticketEditorClipboardHtml,
  writeTicketEditorHtml,
} from "./ticket-editor-dom";

describe("ticket editor DOM boundary", () => {
  it("removes executable markup while preserving safe pasted images", () => {
    const editor = document.createElement("div");
    writeTicketEditorHtml(
      editor,
      '<p onclick="alert(1)">Ok</p><script>alert(1)</script><svg onload="alert(1)"></svg><img src="data:image/png;base64,AAAA" alt="Captura" onerror="alert(1)"><a href="javascript:alert(1)">link</a>',
    );
    expect(editor.querySelector("script, svg, [onclick], [onerror], [onload], [href]")).toBeNull();
    expect(editor.querySelector("p")?.textContent).toBe("Ok");
    expect(editor.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("keeps text formatting, lists and safe links", () => {
    const editor = document.createElement("div");
    writeTicketEditorHtml(
      editor,
      '<div style="text-align: center"><b>Bold</b><i>Italic</i><u>Underline</u></div><ul><li>Item</li></ul><font color="#ff0000" size="3">Color</font><a href="https://example.com">Link</a>',
    );
    expect(editor.querySelector("b")?.textContent).toBe("Bold");
    expect(editor.querySelector("li")?.textContent).toBe("Item");
    expect(editor.querySelector("font")?.getAttribute("color")).toBe("#ff0000");
    expect(editor.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(editor.querySelector("div")?.getAttribute("style")).toBe("text-align: center");
  });

  it("sanitizes outgoing content as well as incoming content", () => {
    const editor = document.createElement("div");
    editor.innerHTML = '<b onclick="alert(1)">Text</b><iframe src="https://example.com"></iframe>';
    expect(readTicketEditorHtml(editor)).toBe("<b>Text</b>");
  });

  it("preserves safe inline images and strips unsafe image sources on output", () => {
    const editor = document.createElement("div");
    editor.innerHTML =
      '<strong>Antes</strong><img src="data:image/webp;base64,AAAA" alt="Captura"><img src="javascript:alert(1)">';
    expect(readTicketEditorHtml(editor)).toBe(
      '<strong>Antes</strong><img src="data:image/webp;base64,AAAA" alt="Captura">',
    );
  });

  it("normalizes the live editor before returning its value", () => {
    const editor = document.createElement("div");
    editor.innerHTML = '<em onmouseover="alert(1)">Texto</em><object>inseguro</object>';

    expect(normalizeTicketEditorHtml(editor)).toBe("<em>Texto</em>inseguro");
    expect(editor.innerHTML).toBe("<em>Texto</em>inseguro");
  });

  it("sanitizes inserted HTML even when a caller passes unsafe markup", () => {
    const editor = document.createElement("div");
    editor.textContent = "Antes";
    document.body.append(editor);
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);

    insertTicketEditorHtml(
      editor,
      '<script>alert(1)</script><a href="javascript:alert(1)">Depois</a>',
      range,
    );

    expect(editor.querySelector("script, [href]")).toBeNull();
    expect(editor.textContent).toBe("AntesDepois");
    editor.remove();
  });

  it("converts a pasted image file into safe inline HTML", async () => {
    const clipboard = {
      files: [new File(["png"], "captura.png", { type: "image/png" })],
      getData: () => "",
    } as unknown as DataTransfer;

    expect(await ticketEditorClipboardHtml(clipboard)).toBe(
      '<img src="data:image/png;base64,cG5n" alt="captura.png">',
    );
  });
});
