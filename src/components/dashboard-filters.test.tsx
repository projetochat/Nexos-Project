// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DashboardFiltersBar } from "./dashboard-filters";
import {
  platformAvailableTenants,
  platformClientSelectionPatch,
  platformTenantSelectionPatch,
} from "@/lib/platform-dashboard-filters";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));

it("preserves the selected dates when switching from last year to custom", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <DashboardFiltersBar
          value={{ period: "previous_year", start: "2025-01-01", end: "2025-12-31" }}
          onChange={onChange}
        />,
      ),
    );
    const period = Array.from(container.querySelectorAll("select")).find(
      (select) => select.value === "previous_year",
    )!;
    await React.act(() => {
      period.value = "custom";
      period.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({
      period: "custom",
      start: "2025-01-01",
      end: "2025-12-31",
    });
  } finally {
    await React.act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

describe("Platform dashboard linked filters", () => {
  const tenants = [
    { id: "tenant-a", clientId: "client-a" },
    { id: "tenant-b", clientId: "client-b" },
    { id: "tenant-free", clientId: null },
  ];

  it("lists only tenants linked to the selected client and clears an incompatible tenant", () => {
    expect(platformAvailableTenants(tenants, "client-a")).toEqual([tenants[0]]);
    expect(platformClientSelectionPatch("client-a", "tenant-b", tenants)).toEqual({
      clientId: "client-a",
      tenantId: undefined,
    });
  });

  it("synchronizes the client when a tenant is selected in either direction", () => {
    expect(platformTenantSelectionPatch("tenant-b", "client-a", tenants)).toEqual({
      tenantId: "tenant-b",
      clientId: "client-b",
    });
    expect(platformTenantSelectionPatch("tenant-free", "client-a", tenants)).toEqual({
      tenantId: "tenant-free",
      clientId: undefined,
    });
    expect(platformTenantSelectionPatch("", "client-a", tenants)).toEqual({
      tenantId: undefined,
      clientId: "client-a",
    });
  });
});
