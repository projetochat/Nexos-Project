// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  pasteTicketEditorText,
  readTicketEditorHtml,
  writeTicketEditorHtml,
} from "./ticket-editor-dom";

describe("ticket editor DOM boundary", () => {
  it("removes executable markup and inline assets before displaying stored content", () => {
    const editor = document.createElement("div");
    writeTicketEditorHtml(
      editor,
      '<p onclick="alert(1)">Ok</p><script>alert(1)</script><svg onload="alert(1)"></svg><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a>',
    );
    expect(
      editor.querySelector("script, svg, img, [onclick], [onerror], [onload], [href]"),
    ).toBeNull();
    expect(editor.querySelector("p")?.textContent).toBe("Ok");
  });

  it("keeps text formatting, lists and safe links", () => {
    const editor = document.createElement("div");
    writeTicketEditorHtml(
      editor,
      '<b>Bold</b><i>Italic</i><u>Underline</u><ul><li>Item</li></ul><font color="#ff0000" size="3">Color</font><a href="https://example.com">Link</a>',
    );
    expect(editor.querySelector("b")?.textContent).toBe("Bold");
    expect(editor.querySelector("li")?.textContent).toBe("Item");
    expect(editor.querySelector("font")?.getAttribute("color")).toBe("#ff0000");
    expect(editor.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  it("sanitizes outgoing content as well as incoming content", () => {
    const editor = document.createElement("div");
    editor.innerHTML = '<b onclick="alert(1)">Text</b><iframe src="https://example.com"></iframe>';
    expect(readTicketEditorHtml(editor)).toBe("<b>Text</b>");
  });

  it("pastes HTML-looking text literally at the current selection", () => {
    const editor = document.createElement("div");
    editor.textContent = "Before";
    document.body.append(editor);
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    pasteTicketEditorText(editor, '<img src=x onerror="alert(1)">');
    expect(editor.querySelector("img")).toBeNull();
    expect(editor.textContent).toBe('Before<img src=x onerror="alert(1)">');
    window.getSelection()?.removeAllRanges();
    editor.remove();
  });
});
