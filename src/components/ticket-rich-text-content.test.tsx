// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TicketRichTextContent } from "./ticket-rich-text-content";

describe("ticket rich text content", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("renders only sanitized ticket markup", async () => {
    await act(async () => {
      root.render(
        <TicketRichTextContent
          html={'<strong onclick="alert(1)">Seguro</strong><script>alert(1)</script>'}
        />,
      );
    });

    expect(host.querySelector("strong")?.textContent).toBe("Seguro");
    expect(host.querySelector("script, [onclick]")).toBeNull();
  });

  it("re-sanitizes updated content", async () => {
    await act(async () => {
      root.render(<TicketRichTextContent html="<p>Primeiro</p>" />);
    });
    await act(async () => {
      root.render(
        <TicketRichTextContent html={'<img src="javascript:alert(1)"><em>Depois</em>'} />,
      );
    });

    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("em")?.textContent).toBe("Depois");
  });
});
