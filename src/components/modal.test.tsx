// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConfirmDialog } from "./modal";

it("focuses the delete action each time a confirmation opens", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const render = (open: boolean) => root.render(
    <ConfirmDialog open={open} title="Excluir?" confirmLabel="Excluir" destructive onConfirm={onConfirm} onClose={onClose} />,
  );
  try {
    await React.act(() => render(true));
    expect(document.activeElement?.textContent).toBe("Excluir");
    // Simulate the opening control restoring focus after the portal mounts.
    const cancel = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Cancelar")!;
    cancel.focus();
    await React.act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement?.textContent).toBe("Excluir");
    expect(document.activeElement?.classList.contains("focus:ring-2")).toBe(true);
    await React.act(() => (document.activeElement as HTMLButtonElement).click());
    expect(onConfirm).toHaveBeenCalledOnce();
    await React.act(() => render(false));
    await React.act(() => render(true));
    expect(document.activeElement?.textContent).toBe("Excluir");
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});
