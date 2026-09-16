import { describe, expect, it } from "vitest";
import { TrixusApiError } from "@/lib/trixus-api";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";

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
