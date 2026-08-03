import { describe, expect, it } from "vitest";
import { connectedEvolutionConnections, connectionDisplayLabel } from "@/lib/connection-options";
import type { ApiMessagingConnection } from "@/lib/nexos-api";

describe("connection options", () => {
  it("returns zero options for an empty API response and never invents examples", () => {
    expect(connectedEvolutionConnections([])).toEqual([]);
  });

  it("keeps one connected Evolution connection with its real display name", () => {
    const result = connectedEvolutionConnections([
      connection({ id: "real-1", name: "Suporte real", ownerPhoneMasked: "******1234" }),
    ]);

    expect(result).toHaveLength(1);
    expect(connectionDisplayLabel(result[0])).toBe(
      "Suporte real - ******1234 - Evolution - conectada",
    );
  });

  it("keeps multiple connected Evolution connections", () => {
    expect(
      connectedEvolutionConnections([
        connection({ id: "real-1", name: "Suporte" }),
        connection({ id: "real-2", name: "Financeiro" }),
      ]).map((item) => item.name),
    ).toEqual(["Suporte", "Financeiro"]);
  });

  it("excludes disconnected and non-Evolution providers", () => {
    expect(
      connectedEvolutionConnections([
        connection({ id: "real-1", name: "Conectada" }),
        connection({ id: "real-2", name: "Desconectada", status: "disconnected" }),
        connection({ id: "dev-1", name: "Development Provider", providerType: "development" }),
      ]).map((item) => item.name),
    ).toEqual(["Conectada"]);
  });

  it("does not leak cross-tenant data when the API response is already tenant scoped", () => {
    const tenantScopedResponse = [connection({ tenantId: "tenant-a", name: "Tenant A" })];

    expect(connectedEvolutionConnections(tenantScopedResponse)).toEqual(tenantScopedResponse);
  });
});

function connection(overrides: Partial<ApiMessagingConnection> = {}): ApiMessagingConnection {
  return {
    id: "connection-a",
    tenantId: "tenant-a",
    name: "Real Connection",
    providerType: "evolution",
    status: "connected",
    externalReference: "tenant-a-real",
    ownerPhoneMasked: null,
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}
