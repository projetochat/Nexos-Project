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

    expect(document.body.textContent).toContain("Configuração de Dashboards");
    expect(document.body.textContent).toContain(
      "Arraste e solte para definir a posição dos componentes.",
    );
    expect(document.querySelector('[role="dialog"]')?.className).toContain("sm:max-w-5xl");
    expect(document.body.textContent).toContain("Contadores de registro");
    const editButton = document.querySelector('[aria-label="Editar Contadores de registro"]');
    expect(editButton).toBeTruthy();
    expect(editButton?.className).toContain("text-foreground");
    expect(editButton?.className).not.toContain("text-muted-foreground");
    expect(editButton?.getAttribute("title")).toBe("Editar");
    expect(document.querySelector(".lucide-pencil")).toBeTruthy();
    expect(document.querySelector('[title^="Mover para"]')).toBeNull();

    await click(buttonByText("Novo componente"));

    expect(document.body.textContent).toContain("Configurar Componente");
    const componentDialog = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    expect(componentDialog?.className).toContain("md:max-w-[57.6rem]");
    expect(document.body.textContent).toContain(
      "Todos os componentes criados respeitam o painel de filtro do dashboard.",
    );
    expect(document.querySelectorAll("button[aria-pressed]")).toHaveLength(8);
    expect(document.querySelector('input[required][aria-invalid="false"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Título do componente *");
    expect(document.querySelector("[data-dashboard-component-title-field]")?.className).toContain(
      "min-w-0",
    );
    const mobileVisibility = document.querySelector("[data-dashboard-mobile-visibility-control]");
    expect(mobileVisibility?.className).toContain("flex-col");
    expect(mobileVisibility?.className).toContain("sm:flex-row");
    expect(mobileVisibility?.querySelector("span")?.textContent).toBe("Visível");
    expect(document.body.textContent).toContain("Quantidade (∑)");
    expect(document.body.textContent).toContain("Percentual (%)");
    expect(document.querySelector("[data-dashboard-mobile-config-grid]")?.className).toContain(
      "grid-cols-2",
    );
    expect(document.querySelector("[data-dashboard-mobile-config-grid]")?.className).toContain(
      "lg:block",
    );
    expect(document.querySelector("[data-dashboard-mobile-preview]")?.className).toContain("h-80");
    expect(document.querySelector("[data-dashboard-mobile-preview]")?.className).toContain(
      "lg:h-auto",
    );
    expect(document.querySelector("[data-dashboard-mobile-preview] > div")?.className).toContain(
      "overflow-auto",
    );
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

    expect(onChange).not.toHaveBeenCalled();
    await click(buttonByText("Salvar"));

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

  it("starts a new component with an empty required title", async () => {
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

    expect(onChange).not.toHaveBeenCalled();
    expect(
      document
        .querySelector("[data-dashboard-component-title-field] input")
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(document.body.textContent).not.toContain("Informe o título do componente.");
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

  it("accepts a platform catalog without exposing tenant-only groupings", async () => {
    const groupingOptions = vi.fn(() => [
      { value: "clientVolume", label: "Volume por cliente", section: "native" as const },
    ]);
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={[]}
          customFields={[]}
          sourceOptions={[{ value: "messages", label: "Mensagens" }]}
          groupingOptions={groupingOptions}
          createComponent={() => ({
            id: "platform-new",
            title: "",
            visible: true,
            visualization: "columns",
            columns: 2,
            dataSource: "messages",
            groupBy: "clientVolume",
            valueMode: "count",
          })}
          resolveData={() => []}
          onChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    await click(buttonByText("Novo componente"));
    expect(document.body.textContent).toContain("Volume por cliente");
    expect(document.body.textContent).not.toContain("Direção da mensagem");
    expect(groupingOptions).toHaveBeenCalledWith("messages", []);
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

    expect(onChange).not.toHaveBeenCalled();
    await click(buttonByText("Salvar"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next).toHaveLength(DEFAULT_DASHBOARD_COMPONENTS.length);
    expect(next.some((component: { id: string }) => component.id === created.id)).toBe(false);
  });

  it("changes visibility directly from the component list", async () => {
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

    const visibility = document.querySelector('[aria-label="Exibir Contadores de registro"]');
    expect((visibility as HTMLButtonElement | null)?.disabled).toBe(false);

    await click(visibility);
    expect(onChange).not.toHaveBeenCalled();
    await click(buttonByText("Salvar"));
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.find((component: { id: string }) => component.id === "counters")?.visible).toBe(
      false,
    );
  });

  it("changes visibility only from the component configuration", async () => {
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

    await click(document.querySelector('[aria-label="Editar Contadores de registro"]'));

    const visibility = document.querySelector(
      '[aria-label="Alterar visibilidade de Contadores de registro"]',
    ) as HTMLButtonElement | null;
    expect(visibility?.disabled).toBe(false);

    await click(visibility);
    expect(onChange).not.toHaveBeenCalled();

    await click(buttonByText("Salvar"));

    expect(onChange).not.toHaveBeenCalled();
    await click(buttonByText("Salvar"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.find((component: { id: string }) => component.id === "counters")?.visible).toBe(
      false,
    );
  });

  it("restores native defaults without deleting custom components", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={[
            { ...DEFAULT_DASHBOARD_COMPONENTS[1], title: "Alterado" },
            { ...DEFAULT_DASHBOARD_COMPONENTS[0], id: "custom", title: "Personalizado" },
          ]}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={onClose}
        />,
      );
    });

    await click(buttonByText("Restaurar padrão"));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Tem certeza de que deseja restaurar o dashboard?");
    await click(buttonsByText("Restaurar padrão").at(-1) ?? null);

    const restored = onChange.mock.calls.at(-1)?.[0];
    expect(restored.slice(0, DEFAULT_DASHBOARD_COMPONENTS.length)).toEqual(
      DEFAULT_DASHBOARD_COMPONENTS,
    );
    expect(restored.at(-1)).toMatchObject({ id: "custom", title: "Personalizado" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the saved dashboard unchanged when edit or restore is cancelled", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={onChange}
          onClose={onClose}
        />,
      );
    });

    await click(document.querySelector('[aria-label="Exibir Contadores de registro"]'));
    await click(buttonByText("Restaurar padrão"));
    await click(buttonsByText("Cancelar").at(-1) ?? null);

    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "Tem certeza de que deseja restaurar o dashboard?",
    );

    await click(buttonByText("Cancelar"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
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

    const handle = document.querySelector('[aria-label="Reordenar Contadores de registro"]');
    await act(async () => {
      handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(onChange).not.toHaveBeenCalled();
    await click(buttonByText("Salvar"));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.slice(0, 2).map((component: { id: string }) => component.id)).toEqual([
      "messages",
      "counters",
    ]);
  });

  it("uses the whole card as the drag area without turning controls into handles", async () => {
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    });

    const card = document.querySelector('[aria-label="Reordenar Contadores de registro"]');
    const visibility = document.querySelector('[aria-label="Exibir Contadores de registro"]');
    const edit = document.querySelector('[aria-label="Editar Contadores de registro"]');

    expect(card?.getAttribute("data-dashboard-component-id")).toBe("counters");
    expect((card as HTMLElement | null)?.draggable).toBe(true);
    expect(card?.className).toContain("cursor-grab");
    expect(card?.querySelector('[aria-hidden="true"].pointer-events-none')).toBeTruthy();
    expect(visibility?.closest("[data-dashboard-interactive]")).toBeTruthy();
    expect(edit?.closest("[data-dashboard-interactive]")).toBeTruthy();
  });

  it("allows creating without exposing update controls", async () => {
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={vi.fn()}
          onClose={vi.fn()}
          canCreate
          canUpdate={false}
          canDelete={false}
        />,
      );
    });

    expect(buttonByText("Novo componente")).toBeTruthy();
    expect(document.querySelector('[aria-label^="Duplicar "]')).toBeTruthy();
    expect(document.querySelector('[aria-label^="Editar "]')).toBeNull();
    expect(document.querySelector('[aria-label^="Reordenar "]')).toBeNull();
  });

  it("allows updating without exposing create controls", async () => {
    await act(async () => {
      root.render(
        <DashboardEditorModal
          open
          components={DEFAULT_DASHBOARD_COMPONENTS}
          customFields={[]}
          resolveData={() => []}
          onChange={vi.fn()}
          onClose={vi.fn()}
          canCreate={false}
          canUpdate
          canDelete={false}
        />,
      );
    });

    expect(document.body.textContent).not.toContain("Novo componente");
    expect(document.querySelector('[aria-label^="Duplicar "]')).toBeNull();
    expect(document.querySelector('[aria-label^="Editar "]')).toBeTruthy();
    expect(document.querySelector('[aria-label^="Reordenar "]')).toBeTruthy();
  });
});

async function click(element: Element | null) {
  if (!element) throw new Error("Elemento não encontrado");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function buttonByText(text: string) {
  return buttonsByText(text)[0]!;
}

function buttonsByText(text: string) {
  return [...document.querySelectorAll("button")].filter(
    (button) => button.textContent?.trim() === text,
  );
}
