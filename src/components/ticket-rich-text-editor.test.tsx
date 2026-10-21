// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./ticket-rich-text-editor";

describe("ticket rich text editor", () => {
  it.each([
    ["z", false, "undo"],
    ["y", false, "redo"],
    ["z", true, "redo"],
  ])("maps the keyboard shortcut %s to the native %s history", async (key, shiftKey, command) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    try {
      await act(async () => root.render(<RichTextEditor value="Texto" onChange={vi.fn()} />));
      const editor = container.querySelector<HTMLElement>('[role="textbox"]')!;
      await act(async () => {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true }),
        );
      });
      expect(execCommand).toHaveBeenCalledWith(command);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("keeps native rich paste behavior and sanitizes formatted HTML on input", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    try {
      await act(async () =>
        root.render(
          <RichTextEditor
            value={'<b>Safe</b><img src="data:image/png;base64,AAAA" alt="Captura">'}
            onChange={onChange}
          />,
        ),
      );
      const editor = container.querySelector<HTMLElement>('[role="textbox"]')!;
      expect(editor.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
      expect(editor.querySelector("b")?.textContent).toBe("Safe");
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: {
          files: [],
          getData: (type: string) =>
            type === "text/plain" ? " pasted" : '<img src=x onerror="alert(1)">',
        },
      });
      await act(async () => {
        editor.dispatchEvent(paste);
      });
      expect(paste.defaultPrevented).toBe(true);
      editor.innerHTML =
        '<div style="text-align: center"><strong>Formatado</strong></div><img src="data:image/png;base64,AAAA" alt="Captura"><script>alert(1)</script>';
      await act(async () => editor.dispatchEvent(new InputEvent("input", { bubbles: true })));
      expect(onChange).toHaveBeenLastCalledWith(
        '<div style="text-align: center"><strong>Formatado</strong></div><img src="data:image/png;base64,AAAA" alt="Captura">',
      );
      expect(editor.querySelector("script")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      window.getSelection()?.removeAllRanges();
      container.remove();
    }
  });
});
