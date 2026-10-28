// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  pending: true,
  error: false,
  features: undefined as Record<string, boolean> | undefined,
  navigate: vi.fn(),
  pathname: "/inbox/synthetic-conversation",
  user: {
    id: "synthetic-user",
    role: "admin",
    roleKey: "tenant_admin",
    permissions: ["conversations.read", "dashboard.read"],
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
  useNavigate: () => state.navigate,
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname }, isLoading: false, isTransitioning: false }),
}));
vi.mock("@/lib/session", async () => ({
  ...(await vi.importActual<typeof import("@/lib/session")>("@/lib/session")),
  useSession: (selector: (value: unknown) => unknown) =>
    selector({ user: state.user, hydrated: true, loginPath: "/login" }),
}));
vi.mock("@/hooks/use-tenant-entitlements", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/use-tenant-entitlements")>(
    "@/hooks/use-tenant-entitlements",
  )),
  useTenantEntitlements: () => ({
    data: state.features ? { features: state.features } : undefined,
    isPending: state.pending,
    isError: state.error,
  }),
}));
vi.mock("@/lib/realtime/hooks", () => ({ useInstanceAccessUpdates: () => {} }));
import { AppShellFull } from "./app-shell";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.pending = true;
  state.error = false;
  state.features = undefined;
  state.navigate.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated Chat shell test");
    }),
  );
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
async function render() {
  await React.act(async () =>
    root.render(
      <AppShellFull>
        <div>Protected Chat content</div>
      </AppShellFull>,
    ),
  );
}
it("does not mount Chat or navigate before entitlements resolve", async () => {
  await render();
  expect(host.textContent).not.toContain("Protected Chat content");
  expect(state.navigate).not.toHaveBeenCalled();
});
it("redirects a disabled Chat route to the permitted shared dashboard", async () => {
  state.pending = false;
  state.features = { chat: false, campaigns: false, tickets: true };
  await render();
  expect(host.textContent).not.toContain("Protected Chat content");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/" });
});
it("does not fail open after an entitlement error even if stale features enabled Chat", async () => {
  state.pending = false;
  state.error = true;
  state.features = { chat: true, campaigns: true, tickets: true };
  await render();
  expect(host.textContent).not.toContain("Protected Chat content");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/" });
});
