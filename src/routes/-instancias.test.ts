import { describe, expect, it } from "vitest";
import { NexosApiError } from "@/lib/nexos-api";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";

describe("instancias removal UX", () => {
  it("shows a specific message for in-use connection conflicts", () => {
    expect(
      connectionRemoveErrorMessage(new NexosApiError("Conflict", 409, "CONNECTION_IN_USE")),
    ).toContain("ainda esta em uso");
  });

  it("shows degraded provider copy for Evolution temporary failures", () => {
    expect(
      connectionRemoveErrorMessage(
        new NexosApiError("Unavailable", 503, "EVOLUTION_PROVIDER_UNAVAILABLE"),
      ),
    ).toContain("Evolution indisponivel");
  });
});
