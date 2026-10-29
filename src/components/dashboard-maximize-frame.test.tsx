// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DashboardMaximizeFrame } from "./dashboard-maximize-frame";

it("shows the maximize action on interaction and opens a full-screen dialog", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DashboardMaximizeFrame title="Tráfego de mensagens">
          <div data-widget-content>Conteúdo do dashboard</div>
        </DashboardMaximizeFrame>,
      ),
    );
    const maximize = host.querySelector(
      '[aria-label="Maximizar Tráfego de mensagens"]',
    ) as HTMLButtonElement;
    expect(maximize.classList.contains("opacity-0")).toBe(true);
    expect(maximize.classList.contains("group-hover:opacity-100")).toBe(true);
    expect(maximize.classList.contains("focus-visible:opacity-100")).toBe(true);
    expect(maximize.classList.contains("focus-visible:ring-2")).toBe(true);
    expect(maximize.classList.contains("focus:opacity-100")).toBe(false);
    expect(maximize.classList.contains("focus:ring-2")).toBe(false);
    expect(maximize.classList.contains("group-focus-within:opacity-100")).toBe(false);
    expect(maximize.querySelector("svg")?.classList.contains("lucide-expand")).toBe(true);

    await act(async () => maximize.click());
    const dialog = document.querySelector("[data-dashboard-maximized]");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.classList.contains("fixed")).toBe(true);
    expect(dialog?.classList.contains("inset-0")).toBe(true);
    expect(dialog?.classList.contains("p-0")).toBe(true);
    const maximizedScroll = document.querySelector("[data-dashboard-maximized-scroll]");
    expect(maximizedScroll?.classList.contains("overflow-auto")).toBe(true);
    const maximizedPadding = maximizedScroll?.firstElementChild;
    expect(maximizedPadding?.classList.contains("p-3")).toBe(true);
    expect(maximizedPadding?.classList.contains("sm:p-6")).toBe(true);
    const maximizedContent = document.querySelector("[data-dashboard-maximized-content]");
    expect(maximizedContent?.classList.contains("m-auto")).toBe(true);
    expect(maximizedContent?.classList.contains("w-full")).toBe(true);
    expect(maximizedContent?.classList.contains("relative")).toBe(true);
    expect(maximizedContent?.classList.contains("h-[calc(100dvh-1.5rem)]")).toBe(true);
    expect(maximizedContent?.classList.contains("sm:h-[calc(100dvh-3rem)]")).toBe(true);
    expect(maximizedContent?.classList.contains("outline-gray-300")).toBe(true);
    expect(maximizedContent?.classList.contains("dark:outline-gray-600")).toBe(true);
    expect(document.querySelector('[aria-label="Restaurar Tráfego de mensagens"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-widget-content]")).toHaveLength(1);

    const restore = document.querySelector(
      '[aria-label="Restaurar Tráfego de mensagens"]',
    ) as HTMLButtonElement;
    expect(restore.querySelector("svg")?.classList.contains("lucide-shrink")).toBe(true);
    expect(restore.classList.contains("right-2")).toBe(true);
    expect(restore.classList.contains("top-2")).toBe(true);
    expect(restore.closest("[data-dashboard-maximized-content]")).toBe(maximizedContent);
    await act(async () => restore.click());
    expect(document.querySelector("[data-dashboard-maximized]")).toBeNull();
    expect(maximize.getAttribute("data-state")).toBe("closed");

    await act(async () => maximize.click());

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-dashboard-maximized]")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("reveals the mobile action only after tapping the BI and hides it after an outside tap", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DashboardMaximizeFrame title="Contatos">
          <div data-content>BI</div>
        </DashboardMaximizeFrame>,
      ),
    );
    const button = host.querySelector("button")!;
    expect(button.classList.contains("max-md:invisible")).toBe(true);
    expect(button.className).not.toContain("[@media(hover:none)]");
    await act(async () => (host.querySelector("[data-content]") as HTMLElement).click());
    expect(button.classList.contains("max-md:opacity-100")).toBe(true);
    expect(document.querySelector("[data-dashboard-maximized]")).toBeNull();
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(button.classList.contains("max-md:invisible")).toBe(true);
    await act(async () => (host.querySelector("[data-content]") as HTMLElement).click());
    await act(async () => button.click());
    expect(document.querySelector("[data-dashboard-maximized]")).not.toBeNull();
    await act(async () =>
      (document.querySelector('[aria-label="Restaurar Contatos"]') as HTMLElement).click(),
    );
    expect(button.classList.contains("max-md:invisible")).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
