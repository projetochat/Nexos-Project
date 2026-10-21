// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DepartmentInstanceMultiSelect } from "./departamentos";
import { DepartmentIconSelect } from "../components/department-icon";

describe("DepartmentInstanceMultiSelect", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  it("opens checkbox options, emits ids and presents compact selected chips", async () => {
    const onChange = vi.fn();
    const connections = [
      { id: "connection-a", name: "Douglas", color: "#2563EB" },
      { id: "connection-b", name: "Pessoal", color: "#10B981" },
    ];

    await act(async () => {
      root.render(
        <DepartmentInstanceMultiSelect
          connections={connections}
          selectedIds={["connection-a"]}
          onChange={onChange}
        />,
      );
    });

    expect(document.body.textContent).toContain("Douglas");
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => {
      (document.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement).click();
    });

    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
      "Douglas",
    );

    const pessoal = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.includes("Pessoal"),
    );
    await act(async () => pessoal?.click());
    expect(onChange).toHaveBeenLastCalledWith(["connection-a", "connection-b"]);
  });

  it("clears the current instance ids without opening the option list", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DepartmentInstanceMultiSelect
          connections={[{ id: "connection-a", name: "Douglas", color: null }]}
          selectedIds={["connection-a"]}
          onChange={onChange}
        />,
      );
    });

    await act(async () => {
      (document.querySelector('[aria-label="Limpar seleção"]') as HTMLElement).click();
    });

    expect(onChange).toHaveBeenCalledWith([]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("keeps the icon selector at the same minimum external height as the instances selector", async () => {
    await act(async () => {
      root.render(
        <div>
          <DepartmentInstanceMultiSelect connections={[]} selectedIds={[]} onChange={() => {}} />
          <DepartmentIconSelect value="department" onChange={() => {}} />
        </div>,
      );
    });

    const instances = document.querySelector('[aria-haspopup="listbox"]');
    const icon = document.querySelector('[aria-label^="Selecionar ícone"]');
    expect(instances?.className).toContain("min-h-10");
    expect(icon?.className).toContain("min-h-10");
    expect(icon?.className).not.toContain("min-h-11");
  });
});
