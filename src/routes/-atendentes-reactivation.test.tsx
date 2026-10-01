// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
}));
import { AtendenteForm } from "./atendentes";
const initial = {
  id: "blocked",
  userId: "blocked-user",
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
it("reactivates an inactive account without requesting a password", async () => {
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
    expect(password.disabled).toBe(true);
    expect(password.getAttribute("aria-required")).toBe("false");
    const save = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Salvar",
    )!;
    await React.act(async () => save.click());
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ ativo: true, senha: undefined }));
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

it("activates without sending a password in the API body", async () => {
  const { organizationApi } = await import("@/lib/trixus-api");
  const mockedFetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
  try {
    await organizationApi.activateUser("isolated-member");
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/isolated-member/activate"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(mockedFetch.mock.calls[0]?.[1]?.body).toBeUndefined();
  } finally {
    mockedFetch.mockRestore();
  }
});

it("requires a password after unlocking password editing", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const submit = vi.fn();
  const active = { ...initial, ativo: true };
  try {
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
    await React.act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Desbloquear alteração de senha"]')!
        .click(),
    );
    const password = document.querySelector<HTMLInputElement>('[aria-label="Senha do atendente"]')!;
    expect(password.disabled).toBe(false);
    expect(password.getAttribute("aria-required")).toBe("true");
    const save = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Salvar",
    )!;
    await React.act(async () => save.click());
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Senha mínima de 6 caracteres.");
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
  }
});
