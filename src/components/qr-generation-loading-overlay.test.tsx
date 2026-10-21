// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { QrGenerationLoadingOverlay } from "./qr-generation-loading-overlay";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("QrGenerationLoadingOverlay", () => {
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    host?.remove();
    host = null;
    document.body.innerHTML = "";
  });

  it("blocks dismissal and announces QR generation while open", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => root.render(<QrGenerationLoadingOverlay open />));

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const status = document.querySelector<HTMLElement>('[role="status"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-busy")).toBe("true");
    expect(status?.getAttribute("aria-live")).toBe("assertive");
    expect(status?.textContent).toContain("Aguarde, QR Code está sendo gerado!");

    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    await act(async () => dialog?.dispatchEvent(escape));
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);

    await act(async () => root.render(<QrGenerationLoadingOverlay open={false} />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
