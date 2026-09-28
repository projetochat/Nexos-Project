// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DASHBOARD_COMPONENTS } from "@/lib/dashboard-components";
import { DashboardEditorModal } from "./dashboard-editor-modal";

vi.mock("./dashboard-component-renderer", () => ({
  DashboardComponentRenderer: ({ visualization }: { visualization: string }) => (
    <div data-testid={`preview-${visualization}`}>Preview {visualization}</div>
  ),
}));

describe("DashboardEditorModal", () => {
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

  it("separates component management from detailed configuration", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[{ id: "origin", label: "Origem do atendimento" }]}
          resolveData={() => [{ nome: "Site", total: 12 }]}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("Editar Dashboard");
    expect(document.querySelector('[role="dialog"]')?.className).toContain("sm:max-w-2xl");
    expect(document.body.textContent).toContain("Contadores de registro");
    expect(document.querySelector('[aria-label="Configurar Contadores de registro"]')).toBeTruthy();
    expect(document.querySelector('[aria-label^="Editar "]')).toBeNull();

    await click(buttonByText("Novo componente"));

    expect(document.body.textContent).toContain("Configurar Componente");
    expect(document.body.textContent).toContain(
      "Todos os componentes criados respeitam o painel de filtro do dashboard.",
    );
    expect(document.querySelectorAll("button[aria-pressed]")).toHaveLength(8);
    expect(buttonByText("Criar")).toBeTruthy();
  });

  it("opens a copied component in creation mode without persisting it first", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    await click(document.querySelector('[aria-label="Duplicar Tráfego de mensagens"]'));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Configurar Componente");
    expect(buttonByText("Criar")).toBeTruthy();

    await click(buttonByText("Criar"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next).toHaveLength(DEFAULT_DASHBOARD_COMPONENTS.length + 1);
    expect(next.at(-1)).toMatchObject({
      title: "Tráfego de mensagens (cópia)",
      visualization: "line",
      dataSource: "messages",
      groupBy: "hour",
    });
    expect(next.at(-1).id).not.toBe("messages");
  });

  it("creates a configured component from the dedicated modal", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    await click(buttonByText("Novo componente"));
    await click(buttonByText("Donut"));
    await click(buttonByText("Criar"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next).toHaveLength(DEFAULT_DASHBOARD_COMPONENTS.length + 1);
    expect(next.at(-1)).toMatchObject({
      title: "Novo componente",
      visualization: "donut",
      visible: true,
    });
  });

  it("does not allow deleting default components", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    expect(document.querySelector('[aria-label="Excluir Contadores de registro"]')).toBeNull();
    expect(document.querySelector('[aria-label="Excluir Tráfego de mensagens"]')).toBeNull();
  });

  it("requires confirmation before deleting a created component", async () => {
    const onChange = vi.fn();
    const created = {
      ...DEFAULT_DASHBOARD_COMPONENTS[0],
      id: "created-component",
      title: "Componente criado",
    };
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={[...DEFAULT_DASHBOARD_COMPONENTS, created]}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    await click(document.querySelector('[aria-label="Excluir Componente criado"]'));
    expect(document.body.textContent).toContain("Deseja excluir “Componente criado”");
    expect(onChange).not.toHaveBeenCalled();

    await click(buttonByText("Excluir"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next).toHaveLength(DEFAULT_DASHBOARD_COMPONENTS.length);
    expect(next.some((component: { id: string }) => component.id === created.id)).toBe(false);
  });

  it("removes the visibility selection control from the component list", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    expect(document.querySelector('[aria-label="Exibir Contadores de registro"]')).toBeNull();
    expect(document.querySelector('[role="checkbox"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores defaults, persists them and closes the editor", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS.slice(0, 1)}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={onClose}
        />,
      );
    });

    await click(buttonByText("Restaurar padrão"));

    expect(onChange).toHaveBeenCalledWith(DEFAULT_DASHBOARD_COMPONENTS);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers keyboard controls for reordering components", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    });

    const handle = document.querySelector(
      '[aria-label="Reordenar Contadores de registro. Use as setas para cima e para baixo."]',
    );
    await act(async () => {
      handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.slice(0, 2).map((component: { id: string }) => component.id)).toEqual([
      "messages",
      "counters",
    ]);
  });
});

async function click(element: Element | null) {
  if (!element) throw new Error("Elemento não encontrado");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function buttonByText(text: string) {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  )!;
}
