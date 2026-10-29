// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiMessagingConnection } from "@/lib/trixus-api";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  status: vi.fn(),
  remove: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock("@/lib/trixus-api", async (original) => ({
  ...(await original<typeof import("@/lib/trixus-api")>()),
  connectionsApi: { list: mocks.list, status: mocks.status, remove: mocks.remove },
  crmApi: { listContactCustomFields: async () => [] },
}));
vi.mock("@/lib/session", () => ({
  useSession: (select: (state: unknown) => unknown) =>
    select({ user: { permissions: ["connections.read", "connections.delete"] } }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
  PageContainer: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("@/components/modal", () => ({
  ConfirmDialog: () => null,
  Modal: ({
    open,
    title,
    children,
    footer,
  }: React.PropsWithChildren<{ open: boolean; title: string; footer: React.ReactNode }>) =>
    open ? (
      <section role="dialog" aria-label={title}>
        {children}
        {footer}
      </section>
    ) : null,
}));
import { Route } from "./instancias";
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const connection = (
  status: ApiMessagingConnection["status"],
  extra = {},
): ApiMessagingConnection => ({
  id: "isolated-instance",
  tenantId: "isolated-tenant",
  name: "Instância teste",
  providerType: "evolution",
  status,
  externalReference: "test",
  logoUrl: "data:,test",
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  ...extra,
});
const removeButton = () => host.querySelector<HTMLButtonElement>('button[aria-label="Remover"]')!;
const dialog = () => host.querySelector('[role="dialog"]');
async function mount(item = connection("disconnected")) {
  mocks.list.mockResolvedValue([item]);
  const Component = (
    Route as unknown as {
      component: React.ComponentType & { preload?: () => Promise<unknown> };
    }
  ).component;
  await Component.preload?.();
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Component />
      </QueryClientProvider>,
    ),
  );
  await vi.waitFor(() => expect(removeButton()).toBeTruthy());
}
async function clickRemove() {
  await act(async () => removeButton().click());
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK_BLOCKED");
    }),
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
describe("Remoção de instância: prévia real de status com APIs isoladas", () => {
  it("bloqueia conectada no status atualizado mesmo quando listada desconectada", async () => {
    mocks.status.mockResolvedValue(connection("connected"));
    await mount();
    await clickRemove();
    await vi.waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Desconecte a instância antes de removê-la."),
    );
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith("isolated-instance");
    expect(dialog()).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("abre confirmação somente após status desconectado e exige REMOVER antes do DELETE", async () => {
    mocks.status.mockResolvedValue(connection("disconnected"));
    await mount(connection("connected"));
    await clickRemove();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    const confirm = host.querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    expect(confirm.disabled).toBe(true);
    await act(async () => confirm.click());
    expect(mocks.remove).not.toHaveBeenCalled();
    const input = host.querySelector<HTMLInputElement>("[data-remove-confirmation]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "REMOVER",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirm.disabled).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.remove.mockResolvedValue({});
    await act(async () => confirm.click());
    await vi.waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("isolated-instance"),
    );
  });
  it.each(["connecting", "error", "disconnected"] as const)(
    "permite confirmar remoção no estado %s sem DELETE antecipado",
    async (status) => {
      mocks.status.mockResolvedValue(connection(status));
      await mount(connection(status));
      await clickRemove();
      await vi.waitFor(() => expect(dialog()).not.toBeNull());
      expect(mocks.remove).not.toHaveBeenCalled();
    },
  );
  it("falha fechada se a consulta de status falhar", async () => {
    mocks.status.mockRejectedValue(new Error("Status indisponível"));
    await mount();
    await clickRemove();
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Status indisponível"));
    expect(dialog()).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("desabilita remoção enquanto aguarda status sem executar DELETE", async () => {
    let resolve!: (value: ApiMessagingConnection) => void;
    mocks.status.mockReturnValue(
      new Promise<ApiMessagingConnection>((done) => {
        resolve = done;
      }),
    );
    await mount();
    await clickRemove();
    await vi.waitFor(() => expect(removeButton().disabled).toBe(true));
    expect(dialog()).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => resolve(connection("disconnected")));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("permite retomar remoção parcial desabilitada sem chamar status ou DELETE antecipadamente", async () => {
    await mount(connection("error", { serviceEnabled: false }));
    await clickRemove();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
