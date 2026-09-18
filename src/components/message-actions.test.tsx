// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MessageReactionPicker } from "./message-reaction-picker";
import { MessageStatusIcon } from "./message-status-icon";

it("opens the emoji selector, submits a reaction and supports removal", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onReact = vi.fn().mockResolvedValue(undefined);
  try {
    await act(async () => root.render(<MessageReactionPicker onReact={onReact} />));
    expect(host.textContent).not.toContain("👍");
    await act(async () => host.querySelector("button")!.click());
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((button) => button.getAttribute("aria-label") === "Reagir com 👍")!
        .click(),
    );
    expect(onReact).toHaveBeenLastCalledWith("👍");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => host.querySelector("button")!.click());
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Remover minha reação")!
        .click(),
    );
    expect(onReact).toHaveBeenLastCalledWith(null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("renders distinct sent, delivered, read and pending indicators", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    for (const [status, icon, color] of [
      ["sent", "lucide-check", "text-slate-300"],
      ["delivered", "lucide-check-check", "text-slate-300"],
      ["read", "lucide-check-check", "text-sky-300"],
      ["sending", "lucide-clock", "text-slate-300"],
    ] as const) {
      await act(async () => root.render(<MessageStatusIcon status={status} />));
      expect(host.querySelector(`.${icon}`)?.classList.contains(color)).toBe(true);
      expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBeTruthy();
    }
  } finally {
    await act(async () => root.unmount());
  }
});
