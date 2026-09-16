// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./ticket-rich-text-editor";

describe("ticket rich text editor", () => {
  it("uses safe rendering and blocks clipboard/drop HTML at the component boundary", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    try {
      await act(async () =>
        root.render(
          <RichTextEditor
            value={'<b>Safe</b><img src=x onerror="alert(1)">'}
            onChange={onChange}
          />,
        ),
      );
      const editor = container.querySelector<HTMLElement>('[role="textbox"]')!;
      expect(editor.querySelector("img")).toBeNull();
      expect(editor.querySelector("b")?.textContent).toBe("Safe");
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: {
          getData: (type: string) =>
            type === "text/plain" ? " pasted" : '<img src=x onerror="alert(1)">',
        },
      });
      await act(async () => {
        editor.dispatchEvent(paste);
      });
      expect(paste.defaultPrevented).toBe(true);
      expect(editor.textContent).toBe("Safe pasted");
      expect(onChange).toHaveBeenLastCalledWith("<b>Safe</b> pasted");
      const drop = new Event("drop", { bubbles: true, cancelable: true });
      editor.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
    } finally {
      await act(async () => root.unmount());
      window.getSelection()?.removeAllRanges();
      container.remove();
    }
  });
});
