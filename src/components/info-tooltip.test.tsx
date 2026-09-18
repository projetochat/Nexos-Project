// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InfoTooltip } from "./info-tooltip";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <label>
        <input type="checkbox" />
        <InfoTooltip label="teste">Nota explicativa</InfoTooltip>
      </label>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const button = () => host.querySelector("button")!;
function pointer(type: string, pointerType = "mouse") {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

it("opens on touch/click without changing the surrounding checkbox and closes on another click", async () => {
  await act(async () => button().dispatchEvent(pointer("pointerover", "touch")));
  expect(button().getAttribute("aria-expanded")).toBe("false");
  await act(async () => button().click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toBe("Nota explicativa");
  expect(host.querySelector("input")!.checked).toBe(false);
  await act(async () => button().click());
  expect(button().getAttribute("aria-expanded")).toBe("false");
});

it("opens on hover, stays open when pinned by click and closes with Escape", async () => {
  vi.useFakeTimers();
  await act(async () => button().dispatchEvent(pointer("pointerover")));
  expect(button().getAttribute("aria-expanded")).toBe("true");
  await act(async () => button().click());
  await act(async () => {
    button().dispatchEvent(pointer("pointerout"));
    vi.advanceTimersByTime(200);
  });
  expect(button().getAttribute("aria-expanded")).toBe("true");
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(button().getAttribute("aria-expanded")).toBe("false");
});

it("closes an unpinned hover note after the pointer leaves", async () => {
  vi.useFakeTimers();
  await act(async () => button().dispatchEvent(pointer("pointerover")));
  await act(async () => {
    button().dispatchEvent(pointer("pointerout"));
    vi.advanceTimersByTime(200);
  });
  expect(button().getAttribute("aria-expanded")).toBe("false");
});
