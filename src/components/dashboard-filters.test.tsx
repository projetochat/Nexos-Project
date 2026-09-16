// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DashboardFiltersBar } from "./dashboard-filters";

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
