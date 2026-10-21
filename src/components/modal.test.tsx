// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConfirmDialog, Modal } from "./modal";

it("uses the shared close-button pattern", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await React.act(() => root.render(<Modal open title="Fixture" onClose={onClose} />));
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!;
    expect(close.className).toContain("h-8");
    expect(close.className).toContain("w-8");
    expect(close.className).toContain("rounded-lg");
    expect(close.className).toContain("border-border");
    expect(close.className).toContain("bg-surface-2");
    expect(close.className).toContain("p-0");
    expect(close.className).toContain("hover:bg-surface-3");
    await React.act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("focuses the delete action each time a confirmation opens", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const render = (open: boolean) =>
    root.render(
      <ConfirmDialog
        open={open}
        title="Excluir?"
        confirmLabel="Excluir"
        destructive
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
  try {
    await React.act(() => render(true));
    expect(document.activeElement?.textContent).toBe("Excluir");
    // Simulate the opening control restoring focus after the portal mounts.
    const cancel = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancelar",
    )!;
    expect(cancel.className).toContain("min-h-8");
    expect(cancel.className).toContain("bg-surface-2");
    expect(cancel.className).toContain("hover:bg-surface-3");
    expect(cancel.className).toContain("text-xs");
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Excluir",
    )!;
    for (const action of [cancel, confirm]) {
      expect(action.className).toContain("h-8");
      expect(action.className).toContain("rounded-lg");
      expect(action.className).toContain("sm:min-w-20");
    }
    expect(confirm.className).toContain("bg-destructive");
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

it("keeps an async confirmation open when deletion fails", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onConfirm = vi.fn().mockRejectedValue(new Error("failure"));
  const onClose = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <ConfirmDialog
          open
          title="Excluir?"
          confirmLabel="Excluir"
          destructive
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      ),
    );
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Excluir",
    )!;
    await React.act(async () => confirm.click());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Excluir?");
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("uses the action-specific pending label", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let finish!: () => void;
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <ConfirmDialog
          open
          title="Transferir contato?"
          confirmLabel="Transferir contato"
          pendingLabel="Transferindo…"
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      ),
    );
    const confirm = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Transferir contato",
    )!;
    await React.act(() => confirm.click());
    expect(document.body.textContent).toContain("Transferindo…");
    await React.act(async () => finish());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("does not expose close affordances for a mandatory modal", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <Modal open title="Troca obrigatória" onClose={onClose} dismissible={false}>
          Conteúdo
        </Modal>,
      ),
    );
    expect(document.querySelector('button[aria-label="Fechar"]')).toBeNull();
    await React.act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("dismisses a focused native color picker before dismissing its parent modal", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <Modal open title="Editar cor" onClose={onClose}>
          <input aria-label="Cor" type="color" defaultValue="#3b82f6" />
        </Modal>,
      ),
    );
    const colorInput = document.querySelector<HTMLInputElement>('input[type="color"]')!;
    const backdrop = document.querySelector<HTMLElement>("[data-modal-backdrop]")!;
    colorInput.focus();

    await React.act(() => backdrop.click());

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(colorInput);

    await React.act(() => backdrop.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});

it("still dismisses the modal when a non-color field is focused", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <Modal open title="Editar nome" onClose={onClose}>
          <input aria-label="Nome" />
        </Modal>,
      ),
    );
    document.querySelector<HTMLInputElement>('input[aria-label="Nome"]')!.focus();

    await React.act(() => document.querySelector<HTMLElement>("[data-modal-backdrop]")!.click());

    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await React.act(() => root.unmount());
    container.remove();
  }
});
