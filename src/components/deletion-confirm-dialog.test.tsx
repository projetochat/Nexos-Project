// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeletionConfirmDialog, type DeletionImpactPreview } from "./deletion-confirm-dialog";

const baseImpact: DeletionImpactPreview = {
  snapshotToken: "revision-1",
  title: "Excluir registro?",
  prompt: "Confira o impacto calculado pelo serviço responsável.",
  record: {
    name: "Registro retornado pelo backend",
    identifiers: [
      { label: "Código", value: "REG-42" },
      { label: "Origem", value: "Contrato de teste" },
    ],
  },
  dependencies: [
    {
      id: "contacts",
      label: "Contatos vinculados",
      count: 7,
      operation: "unlink",
      operationLabel: "Os vínculos serão removidos; os contatos serão preservados.",
      items: [
        { id: "contact-1", label: "Contato um" },
        { id: "contact-2", label: "Contato dois", description: "Identificação C-2" },
      ],
      hasMore: true,
    },
    {
      id: "queues",
      label: "Filas relacionadas",
      count: 2,
      operation: "reassign",
      operationLabel: "Serão reassociadas conforme a regra do domínio.",
    },
    {
      id: "history",
      label: "Históricos relacionados",
      count: 4,
      operation: "delete",
      operationLabel: "Serão excluídos com o registro.",
    },
  ],
  consequences: [
    { id: "audit", text: "Esta consequência foi fornecida pelo backend.", irreversible: true },
  ],
  confirmation: { level: "standard", confirmLabel: "Excluir" },
};

describe("DeletionConfirmDialog", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await React.act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function renderDialog(
    impact: DeletionImpactPreview = baseImpact,
    options: {
      loadImpact?: (signal: AbortSignal) => Promise<DeletionImpactPreview>;
      onConfirm?: () => Promise<{ status: "deleted" }>;
      onOpenChange?: (open: boolean) => void;
    } = {},
  ) {
    const loadImpact = options.loadImpact ?? vi.fn().mockResolvedValue(impact);
    const onConfirm =
      options.onConfirm ?? vi.fn().mockResolvedValue({ status: "deleted" as const });
    const onOpenChange = options.onOpenChange ?? vi.fn();
    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="test:record-42"
          onOpenChange={onOpenChange}
          loadImpact={loadImpact}
          onConfirm={onConfirm}
        />,
      ),
    );
    await React.act(async () => Promise.resolve());
    return { loadImpact, onConfirm, onOpenChange };
  }

  it("renders backend identity, counts, operations and expandable records", async () => {
    await renderDialog();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Registro retornado pelo backend");
    expect(document.body.textContent).toContain("REG-42");
    expect(document.body.textContent).toContain("Contatos vinculados");
    expect(document.body.textContent).toContain("Desvinculação:");
    expect(document.body.textContent).toContain("Reassociação:");
    expect(document.body.textContent).toContain("Exclusão:");
    expect(document.body.textContent).not.toContain("Contato um");

    const expand = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Ver registros"),
    )!;
    await React.act(() => expand.click());

    expect(expand.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("Contato um");
    expect(document.body.textContent).toContain("5 registro(s) adicional(is)");
  });

  it("focuses Cancelar instead of the destructive action", async () => {
    await renderDialog();
    await React.act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement?.textContent).toBe("Cancelar");
  });

  it("keeps cancellation focused and available while dependencies are still loading", async () => {
    const onOpenChange = vi.fn();
    const loadImpact = vi
      .fn()
      .mockImplementation(() => new Promise<DeletionImpactPreview>(() => {}));
    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="test:slow-record"
          onOpenChange={onOpenChange}
          loadImpact={loadImpact}
          onConfirm={vi.fn()}
        />,
      ),
    );
    await React.act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const cancel = findButton("Cancelar")!;
    expect(document.activeElement).toBe(cancel);
    expect(cancel.disabled).toBe(false);
    await React.act(() => cancel.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps deletion unavailable while loading and offers retry after a failure", async () => {
    let reject!: (reason?: unknown) => void;
    const loadImpact = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<DeletionImpactPreview>((_, fail) => (reject = fail)),
      )
      .mockResolvedValueOnce(baseImpact);
    await renderDialog(baseImpact, { loadImpact });

    expect(document.body.textContent).toContain("Carregando dependências");
    expect(findButton("Excluir")?.disabled).toBe(true);

    await React.act(() => reject(new Error("offline")));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível carregar os dados",
    );

    await React.act(() => findButton("Tentar novamente")!.click());
    await React.act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Registro retornado pelo backend");
  });

  it("updates the impact and requires another confirmation when the snapshot changed", async () => {
    const changedImpact: DeletionImpactPreview = {
      ...baseImpact,
      snapshotToken: "revision-2",
      dependencies: [{ ...baseImpact.dependencies[0], count: 8 }],
    };
    const loadImpact = vi
      .fn()
      .mockResolvedValueOnce(baseImpact)
      .mockResolvedValueOnce(changedImpact)
      .mockResolvedValueOnce(changedImpact);
    const onConfirm = vi.fn().mockResolvedValue({ status: "deleted" as const });
    await renderDialog(baseImpact, { loadImpact, onConfirm });

    await React.act(() => findButton("Excluir")!.click());
    await React.act(async () => Promise.resolve());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Dependências atualizadas");
    expect(document.body.textContent).toContain(
      "Os vínculos mudaram desde que este diálogo foi aberto",
    );

    await React.act(() => findButton("Excluir")!.click());
    await React.act(async () => Promise.resolve());
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotToken: "revision-2" }),
    );
  });

  it("requires the backend-provided phrase for a high-impact deletion", async () => {
    const highImpact: DeletionImpactPreview = {
      ...baseImpact,
      confirmation: {
        level: "high",
        confirmLabel: "Excluir permanentemente",
        phrase: "REG-42",
        inputLabel: "Digite o código do registro",
        instruction: "Digite REG-42 para confirmar esta operação.",
      },
    };
    const { onConfirm } = await renderDialog(highImpact);
    const confirm = findButton("Excluir permanentemente")!;
    const input = document.querySelector<HTMLInputElement>("input")!;

    expect(confirm.disabled).toBe(true);
    await React.act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "REG-42");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirm.disabled).toBe(false);

    await React.act(() => confirm.click());
    await React.act(async () => Promise.resolve());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("blocks an invalid high-impact policy with an empty phrase", async () => {
    const invalidPolicy: DeletionImpactPreview = {
      ...baseImpact,
      confirmation: {
        level: "high",
        confirmLabel: "Excluir permanentemente",
        phrase: "   ",
        inputLabel: "Digite a identificação",
        instruction: "Confirme a identificação informada pelo domínio.",
      },
    };
    await renderDialog(invalidPolicy);

    expect(findButton("Excluir permanentemente")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("o domínio não forneceu uma frase válida");
  });

  it("does not offer an automatic resubmit after an unconfirmed commit result", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("unknown commit result"));
    await renderDialog(baseImpact, { onConfirm });

    await React.act(() => findButton("Excluir")!.click());
    await React.act(async () => Promise.resolve());

    expect(document.body.textContent).toContain(
      "Não foi possível confirmar o resultado da exclusão",
    );
    expect(findButton("Excluir")?.disabled).toBe(true);
    expect(findButton("Atualizar dados")).toBeDefined();
  });

  it("reloads the impact when the resource changes without closing the dialog", async () => {
    const secondImpact = {
      ...baseImpact,
      snapshotToken: "resource-b-revision",
      record: { ...baseImpact.record, name: "Segundo registro" },
    };
    const loadFirst = vi.fn().mockResolvedValue(baseImpact);
    const loadSecond = vi.fn().mockResolvedValue(secondImpact);
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue({ status: "deleted" as const });

    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="domain:resource-a"
          onOpenChange={onOpenChange}
          loadImpact={loadFirst}
          onConfirm={onConfirm}
        />,
      ),
    );
    await React.act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Registro retornado pelo backend");

    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="domain:resource-b"
          onOpenChange={onOpenChange}
          loadImpact={loadSecond}
          onConfirm={onConfirm}
        />,
      ),
    );
    await React.act(async () => Promise.resolve());

    expect(loadSecond).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Segundo registro");
  });

  it("does not mix callbacks and snapshots when the resource changes during verification", async () => {
    let resolveOldVerification!: (impact: DeletionImpactPreview) => void;
    const oldVerification = new Promise<DeletionImpactPreview>((resolve) => {
      resolveOldVerification = resolve;
    });
    const secondImpact = {
      ...baseImpact,
      snapshotToken: "resource-b-revision",
      record: { ...baseImpact.record, name: "Segundo registro" },
    };
    const loadFirst = vi
      .fn()
      .mockResolvedValueOnce(baseImpact)
      .mockImplementationOnce(() => oldVerification);
    const loadSecond = vi.fn().mockResolvedValue(secondImpact);
    const confirmFirst = vi.fn().mockResolvedValue({ status: "deleted" as const });
    const confirmSecond = vi.fn().mockResolvedValue({ status: "deleted" as const });
    const onOpenChange = vi.fn();

    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="domain:resource-a"
          onOpenChange={onOpenChange}
          loadImpact={loadFirst}
          onConfirm={confirmFirst}
        />,
      ),
    );
    await React.act(async () => Promise.resolve());
    await React.act(() => findButton("Excluir")!.click());

    await React.act(() =>
      root.render(
        <DeletionConfirmDialog
          open
          resourceKey="domain:resource-b"
          onOpenChange={onOpenChange}
          loadImpact={loadSecond}
          onConfirm={confirmSecond}
        />,
      ),
    );
    await React.act(async () => Promise.resolve());
    await React.act(() => resolveOldVerification(baseImpact));
    await React.act(async () => Promise.resolve());

    expect(confirmFirst).not.toHaveBeenCalled();
    expect(confirmSecond).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Segundo registro");
  });
});

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}
