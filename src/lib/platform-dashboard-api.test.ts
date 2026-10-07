import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/trixus-api", () => ({ apiRequest }));

import { platformDashboardApi } from "./platform-dashboard-api";

describe("platformDashboardApi", () => {
  beforeEach(() => apiRequest.mockReset());

  it("sends the complete filter contract without empty fields", async () => {
    apiRequest.mockResolvedValue({});
    await platformDashboardApi.dashboard({
      clientId: "client-a",
      tenantId: undefined,
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-07",
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/platform/dashboard?clientId=client-a&period=custom&start=2026-10-01&end=2026-10-07",
    );
  });

  it("sends the optimistic concurrency version with the shared configuration", async () => {
    apiRequest.mockResolvedValue({});
    const configuration = { schemaVersion: 1 as const, components: [] };
    await platformDashboardApi.updateConfiguration(configuration, 7);
    expect(apiRequest).toHaveBeenCalledWith("/platform/dashboard/configuration", {
      method: "PUT",
      body: JSON.stringify({ configuration, version: 7 }),
    });
  });
});
