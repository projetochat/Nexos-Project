// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  DashboardDateInput,
  DashboardFiltersBar,
  PlatformDashboardFiltersBar,
} from "./dashboard-filters";
import {
  platformAvailableTenants,
  platformClientSelectionPatch,
  platformTenantSelectionPatch,
} from "@/lib/platform-dashboard-filters";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));

it("uses the lowercase placeholder by default and accepts an explicit mobile placeholder", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await React.act(() =>
      root.render(
        <DashboardDateInput value="" readOnly mobilePlaceholder="dd/mm/aaaa" onChange={vi.fn()} />,
      ),
    );
    expect(container.querySelector('input[type="text"]')?.getAttribute("placeholder")).toBe(
      "dd/mm/aaaa",
    );

    await React.act(() => root.render(<DashboardDateInput value="" readOnly onChange={vi.fn()} />));
    expect(container.querySelector('input[type="text"]')?.getAttribute("placeholder")).toBe(
      "dd/mm/aaaa",
    );
  } finally {
    await React.act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

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

it("shows the history type filter and reports the selected group scope", async () => {
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
          value={{ period: "today", conversationType: "all" }}
          onChange={onChange}
          showDepartment={false}
          showConversationType
          search={{ value: "", onChange: vi.fn(), placeholder: "Buscar" }}
        />,
      ),
    );
    const type = Array.from(container.querySelectorAll("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "groups"),
    )!;
    expect(Array.from(type.options).map((option) => option.textContent)).toEqual([
      "Todos",
      "Contatos",
      "Grupos",
    ]);
    await React.act(() => {
      type.value = "groups";
      type.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ conversationType: "groups" });
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

  it("uses compact default labels and keeps the mobile period rows grouped", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await React.act(() =>
        root.render(
          <PlatformDashboardFiltersBar
            value={{ period: "month", clientId: "client-a" }}
            clients={[{ id: "client-a", name: "Cliente A", tenantId: "tenant-a" }]}
            tenants={[
              {
                id: "tenant-a",
                name: "Tenant A",
                clientId: "client-a",
                clientName: "Cliente A",
              },
            ]}
            onChange={vi.fn()}
            onClear={vi.fn()}
          />,
        ),
      );

      const selects = Array.from(container.querySelectorAll("select"));
      expect(selects[0]?.options[0]?.textContent).toBe("Todas");
      expect(selects[1]?.options[0]?.textContent).toBe("Todos");

      const labels = Array.from(container.querySelectorAll("label"));
      expect(labels.slice(0, 5).map((label) => label.textContent)).toEqual([
        "Tenant",
        "Cliente",
        "Período",
        "Dt. Inicial",
        "Dt. Final",
      ]);
      const periodField = labels.find((label) => label.textContent === "Período")?.parentElement;
      expect(periodField?.className).toContain("col-span-2");
      expect(periodField?.className).toContain("lg:col-span-1");
      const clearButton = container.querySelector('[aria-label="Limpar filtros"]');
      expect(clearButton).toBeTruthy();
      expect(clearButton?.textContent).toBe("");
      expect(clearButton?.className).toContain("w-10");
    } finally {
      await React.act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
