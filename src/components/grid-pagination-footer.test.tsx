// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridPaginationFooter } from "./grid-pagination-footer";

describe("GridPaginationFooter", () => {
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
  });

  it("repete o padrão compacto de Contatos e mantém a paginação funcional", async () => {
    const onPage = vi.fn();
    const onPageSize = vi.fn();
    await act(async () => {
      root.render(
        <GridPaginationFooter
          visible={25}
          total={60}
          page={2}
          totalPages={3}
          pageSize={25}
          onPage={onPage}
          onPageSize={onPageSize}
          ariaLabelPrefix="registros"
        />,
      );
    });

    expect(host.firstElementChild?.className).toContain(
      "border-t border-border bg-surface-2 px-3 py-1.5",
    );
    expect(host.textContent).toContain("Mostrando 25 de 60");
    expect(host.querySelector("span.block.sm\\:inline")?.textContent).toBe("Mostrando");
    const pageSize = host.querySelector(
      '[aria-label="Itens por página de registros"]',
    ) as HTMLSelectElement;
    expect(pageSize.className).toContain("!h-6");
    expect(host.querySelectorAll("button")).toHaveLength(2);

    await act(async () => {
      (host.querySelector('[aria-label="Página anterior de registros"]') as HTMLElement).click();
    });
    expect(onPage).toHaveBeenCalledWith(1);

    await act(async () => {
      (host.querySelector('[aria-label="Próxima página de registros"]') as HTMLElement).click();
    });
    expect(onPage).toHaveBeenCalledWith(3);

    await act(async () => {
      pageSize.value = "50";
      pageSize.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPageSize).toHaveBeenCalledWith(50);
  });
});
