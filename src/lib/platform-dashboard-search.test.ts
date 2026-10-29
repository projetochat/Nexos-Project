import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizePlatformDashboardSearch,
  platformDashboardFiltersFromSearch,
  platformDashboardSearchFromFilters,
} from "./platform-dashboard-search";

const routeSource = readFileSync(new URL("../routes/admin.index.tsx", import.meta.url), "utf8");

describe("Platform dashboard URL filters", () => {
  it("restores client, tenant and custom dates from a validated URL", () => {
    const search = normalizePlatformDashboardSearch({
      clientId: " client-a ",
      tenantId: "tenant-a",
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-20",
    });

    expect(platformDashboardFiltersFromSearch(search)).toEqual({
      clientId: "client-a",
      tenantId: "tenant-a",
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-20",
    });
  });

  it("keeps only custom dates and rejects unsupported URL values", () => {
    expect(
      normalizePlatformDashboardSearch({
        clientId: 1,
        period: "unsupported",
        start: "2026-02-31",
        end: "javascript:alert(1)",
      }),
    ).toEqual({
      clientId: undefined,
      tenantId: undefined,
      period: undefined,
      start: undefined,
      end: undefined,
    });
  });

  it("serializes non-default filters and clears the default state from the URL", () => {
    expect(
      platformDashboardSearchFromFilters({
        clientId: "client-a",
        tenantId: "tenant-a",
        period: "year",
        start: "2026-01-01",
        end: "2026-12-31",
      }),
    ).toEqual({
      clientId: "client-a",
      tenantId: "tenant-a",
      period: "year",
      start: undefined,
      end: undefined,
    });

    const defaults = platformDashboardFiltersFromSearch({});
    expect(defaults.period).toBe("today");
    expect(
      platformDashboardFiltersFromSearch(normalizePlatformDashboardSearch({ period: "month" }))
        .period,
    ).toBe("month");
    expect(platformDashboardSearchFromFilters(defaults)).toEqual({
      clientId: undefined,
      tenantId: undefined,
      period: undefined,
      start: undefined,
      end: undefined,
    });
  });

  it("wires route search to filter changes while refresh only refetches current filters", () => {
    expect(routeSource).toContain("validateSearch:");
    expect(routeSource).toContain("platformDashboardFiltersFromSearch(search)");
    expect(routeSource).toContain("search: platformDashboardSearchFromFilters");
    expect(routeSource).toContain("onClear={() => void navigate({ search: {}, replace: true })}");
    expect(routeSource).toContain("await dashboardQuery.refetch({ throwOnError: true })");
  });
});
