// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => () => ({}) }));
import { AtendenteForm, ReactivateAttendantModal } from "./atendentes";
const initial = {
  id: "blocked",
  nome: "Pessoa teste",
  email: "pessoa@example.test",
  cargo: "Atendente",
  perfilId: "agent",
  perfilKey: "agent",
  status: "offline" as const,
  csat: 0,
  emAtendimento: 0,
  resolvidas: 0,
  ativo: false,
};
const profiles = [{ id: "agent", nome: "Atendente" }];
async function type(input: HTMLInputElement, value: string) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("requires a new password to unlock and submits it only after six characters", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const submit = vi.fn();
  try {
    await React.act(async () =>
      root.render(
        <ReactivateAttendantModal
          open
          name="Pessoa teste"
          busy={false}
          onClose={vi.fn()}
          onSubmit={submit}
        />,
      ),
    );
    const input = document.querySelector<HTMLInputElement>(
      '[aria-label="Nova senha do atendente"]',
    )!;
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Desbloquear",
    )!;
    expect(input.required).toBe(true);
    expect(input.closest("label")?.querySelector(".text-destructive")?.textContent).toBe("*");
    expect(button.disabled).toBe(true);
    await type(input, "12345");
    expect(button.disabled).toBe(true);
    await type(input, "Nova123!");
    expect(button.disabled).toBe(false);
    await React.act(async () => button.click());
    expect(submit).toHaveBeenCalledWith("Nova123!");
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
  }
});
it("requires password when editing an inactive account to active and preserves active account lock", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const submit = vi.fn();
  try {
    await React.act(async () =>
      root.render(
        <AtendenteForm
          open
          initial={initial}
          atendentes={[initial]}
          perfis={profiles}
          onClose={vi.fn()}
          onSubmit={submit}
        />,
      ),
    );
    let password = document.querySelector<HTMLInputElement>('[aria-label="Senha do atendente"]')!;
    expect(password.disabled).toBe(true);
    await React.act(async () =>
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    password = document.querySelector<HTMLInputElement>('[aria-label="Senha do atendente"]')!;
    expect(password.disabled).toBe(false);
    expect(password.getAttribute("aria-required")).toBe("true");
    expect(password.closest(".space-y-4")).toBeTruthy();
    const save = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Salvar",
    )!;
    await React.act(async () => save.click());
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Senha mínima de 6 caracteres.");
    await type(password, "Nova123!");
    await React.act(async () => save.click());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ ativo: true, senha: "Nova123!" }),
    );
    const active = { ...initial, ativo: true };
    await React.act(async () =>
      root.render(
        <AtendenteForm
          open
          initial={active}
          atendentes={[active]}
          perfis={profiles}
          onClose={vi.fn()}
          onSubmit={submit}
        />,
      ),
    );
    password = document.querySelector<HTMLInputElement>('[aria-label="Senha do atendente"]')!;
    expect(password.disabled).toBe(true);
    expect(password.getAttribute("aria-required")).toBe("false");
    expect(document.querySelector('[aria-label="Desbloquear alteração de senha"]')).not.toBeNull();
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
  }
});

it("sends the required password in the activation API body", async () => {
  const { organizationApi } = await import("@/lib/trixus-api");
  const mockedFetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
  try {
    await organizationApi.activateUser("isolated-member", { password: "Nova123!" });
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/isolated-member/activate"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ password: "Nova123!" }) }),
    );
  } finally {
    mockedFetch.mockRestore();
  }
});
