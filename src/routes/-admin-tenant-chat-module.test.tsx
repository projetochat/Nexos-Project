// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ configuration: vi.fn(), update: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (config: unknown) => config,
  Link: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("@/components/admin-shell", () => ({
  AdminContainer: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/trixus-api", () => ({
  platformApi: {
    tenants: vi.fn().mockResolvedValue({
      items: [
        {
          id: "synthetic-tenant",
          slug: "synthetic",
          name: "Tenant sintética",
          status: "ACTIVE",
          createdAt: "2026-10-28T12:00:00Z",
          plan: null,
        },
      ],
      total: 1,
      totalPages: 1,
    }),
    plans: vi.fn().mockResolvedValue({ items: [] }),
    tenantConfiguration: api.configuration,
    updateTenantConfiguration: api.update,
  },
}));
import { Route } from "./admin.tenants";
import { tenantModules } from "@/hooks/use-tenant-entitlements";
const Page = (Route as unknown as { component: React.ComponentType }).component;
let root: Root;
let host: HTMLDivElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated optional Chat render");
    }),
  );
  vi.clearAllMocks();
  api.update.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function openConfiguration(chat?: boolean) {
  await (Page as React.ComponentType & { preload?: () => Promise<unknown> }).preload?.();
  api.configuration.mockResolvedValue({
    tenantId: "synthetic-tenant",
    modules: { ...(chat === undefined ? {} : { chat }), campaigns: false, tickets: true },
    lockedModules: [],
    limits: {},
    overrides: { limits: {}, modules: {} },
  });
  await React.act(async () => root.render(<Page />));
  await React.act(async () => {
    await settle();
    await settle();
  });
  await React.act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Ações da Tenant synthetic"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  const action = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes("Configuração da Tenant"),
  )!;
  await React.act(async () => action.click());
  await React.act(async () => {
    await settle();
    await settle();
  });
}
it("lets Platform enable Chat without forcing it back on when saving a disabled tenant", async () => {
  await openConfiguration(false);
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Habilitar Chat"]')!;
  expect(toggle).not.toBeNull();
  expect(toggle.disabled).toBe(false);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Salvar",
  )!;
  await React.act(async () => save.click());
  expect(api.update.mock.calls[0][1].modules).toEqual({
    chat: false,
    campaigns: false,
    tickets: true,
  });
});
it("allows toggling Chat and preserves legacy responses without a Chat field", async () => {
  await openConfiguration();
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Desabilitar Chat"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await React.act(async () => toggle.click());
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Salvar",
  )!;
  await React.act(async () => save.click());
  expect(api.update.mock.calls[0][1].modules.chat).toBe(false);
});
it("honors explicit Chat opt-out, preserves legacy defaults and blocks unresolved module data", () => {
  expect(tenantModules({ chat: false, tickets: true })).toEqual({
    chat: false,
    campaigns: false,
    tickets: true,
  });
  expect(tenantModules({ tickets: true }).chat).toBe(true);
  expect(tenantModules(undefined).chat).toBe(true);
  expect(tenantModules(undefined, false)).toEqual({
    chat: false,
    campaigns: false,
    tickets: false,
  });
});
