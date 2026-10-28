// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { empresaId: "synthetic-tenant-a", id: "synthetic-user-a" },
  entitlements: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({ user: state.user }),
}));
vi.mock("@/lib/trixus-api", () => ({ organizationApi: { entitlements: state.entitlements } }));
import { useTenantEntitlements } from "./use-tenant-entitlements";
it("never reuses another tenant or user's effective modules during a scope switch", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated entitlement scope test");
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let resolveB!: (value: unknown) => void;
  state.entitlements
    .mockResolvedValueOnce({ features: { chat: true } })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveB = resolve;
        }),
    )
    .mockResolvedValueOnce({ features: { chat: false } });
  function View() {
    const query = useTenantEntitlements();
    return <div>{query.isPending ? "pending" : String(query.data?.features.chat)}</div>;
  }
  const render = () =>
    React.act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <View />
        </QueryClientProvider>,
      ),
    );
  const settle = () =>
    React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  try {
    await render();
    await settle();
    expect(host.textContent).toBe("true");
    state.user = { empresaId: "synthetic-tenant-b", id: "synthetic-user-b" };
    await render();
    expect(host.textContent).toBe("pending");
    expect(state.entitlements).toHaveBeenCalledTimes(2);
    await React.act(async () => resolveB({ features: { chat: false } }));
    await settle();
    expect(host.textContent).toBe("false");
    state.user = { empresaId: "synthetic-tenant-b", id: "synthetic-user-c" };
    await render();
    await settle();
    expect(state.entitlements).toHaveBeenCalledTimes(3);
    expect(host.textContent).toBe("false");
    expect(
      client.getQueryCache().findAll({ queryKey: ["trixus", "tenant-entitlements"] }),
    ).toHaveLength(3);
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    host.remove();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  }
});
