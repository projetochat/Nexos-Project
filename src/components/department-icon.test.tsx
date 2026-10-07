// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DepartmentIconSelect } from "@/components/department-icon";

it("keeps the department icon selector compact and opens the icon grid in a popover", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();

  await act(async () =>
    root.render(<DepartmentIconSelect value="shopping-cart" onChange={changed} />),
  );

  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Selecionar ícone. Atual: Comercial"]',
  )!;
  expect(trigger).not.toBeNull();
  expect(document.querySelector('[role="menu"]')).toBeNull();

  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  const finance = document.querySelector<HTMLElement>(
    '[role="menuitem"][aria-label="Financeiro"]',
  )!;
  await act(async () => finance.click());
  expect(changed).toHaveBeenCalledWith("dollar-sign");

  await act(async () => root.unmount());
  host.remove();
});
