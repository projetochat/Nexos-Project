// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import { Modal } from "@/components/modal";
import { TimezoneSelect } from "@/components/timezone-select";

it("Escape closes only the timezone list before closing the modal", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const closed = vi.fn();
  function Fixture() {
    const [open, setOpen] = React.useState(true);
    return (
      <Modal
        open={open}
        onClose={() => {
          closed();
          setOpen(false);
        }}
        title="Fixture"
      >
        <TimezoneSelect value="America/Sao_Paulo" onChange={() => {}} />
      </Modal>
    );
  }
  await act(async () => root.render(<Fixture />));
  const trigger = document.querySelector('button[aria-label="Selecionar fuso horário"]')!;
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(closed).not.toHaveBeenCalled();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(closed).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  host.remove();
});

it("filters timezones inside the shared selector without changing the selected value", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();

  await act(async () =>
    root.render(<TimezoneSelect value="America/Sao_Paulo" onChange={changed} />),
  );
  const trigger = document.querySelector('button[aria-label="Selecionar fuso horário"]')!;
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });

  const search = document.querySelector<HTMLInputElement>(
    'input[aria-label="Pesquisar fuso horário"]',
  )!;
  expect(search).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      search,
      "manaus",
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(document.body.textContent).toContain("América/Manaus");
  expect(document.body.textContent).not.toContain("América/Rio Branco");
  const option = document.querySelector<HTMLElement>('[role="menuitem"]')!;
  expect(option.className).toContain("data-[highlighted]:bg-surface-2");
  expect(changed).not.toHaveBeenCalled();

  await act(async () => root.unmount());
  host.remove();
});
