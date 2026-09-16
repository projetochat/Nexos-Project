import { describe, expect, it } from "vitest";
import { TrixusApiError } from "@/lib/trixus-api";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import { canEditInstance, instanceEditUnavailableReason } from "./instancias";
import type { ApiMessagingConnection } from "@/lib/trixus-api";

function connection(overrides: Partial<ApiMessagingConnection>): ApiMessagingConnection {
  return {
    id: "connection-id",
    tenantId: "tenant-id",
    name: "WhatsApp",
    providerType: "evolution",
    status: "connected",
    externalReference: "whatsapp",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("instancias removal UX", () => {
  it("shows a specific message for in-use connection conflicts", () => {
    expect(
      connectionRemoveErrorMessage(new TrixusApiError("Conflict", 409, "CONNECTION_IN_USE")),
    ).toContain("ainda está em uso");
  });

  it("shows degraded provider copy for Evolution temporary failures", () => {
    expect(
      connectionRemoveErrorMessage(
        new TrixusApiError("Unavailable", 503, "EVOLUTION_PROVIDER_UNAVAILABLE"),
      ),
    ).toContain("Evolution indisponível");
  });
});

describe("instâncias editáveis", () => {
  it("allows only connected or disconnected instances with a WhatsApp number", () => {
    expect(canEditInstance(connection({ ownerPhone: "5511999999999", status: "connected" }))).toBe(
      true,
    );
    expect(
      canEditInstance(connection({ ownerPhoneMasked: "(11) 99999-9999", status: "disconnected" })),
    ).toBe(true);
    expect(canEditInstance(connection({ status: "connecting" }))).toBe(false);
    expect(canEditInstance(connection({ status: "error", ownerPhone: "5511999999999" }))).toBe(
      false,
    );
    expect(canEditInstance(connection({ status: "connected" }))).toBe(false);
  });

  it("explains when the WhatsApp number is missing", () => {
    expect(instanceEditUnavailableReason(connection({ status: "connected" }))).toContain(
      "cadastrar o número",
    );
  });
});
