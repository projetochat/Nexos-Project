import { describe, expect, it } from "vitest";
import { mapApiError } from "./api-exception.filter";
import { MessagingErrorCode, MessagingProviderError } from "../messaging/messaging.contracts";

describe("mapApiError", () => {
  it("keeps WhatsApp rate limits out of the generic internal-error response", () => {
    const mapped = mapApiError(
      new MessagingProviderError(MessagingErrorCode.RATE_LIMITED, "rate-overlimit", true, 429),
    );

    expect(mapped).toMatchObject({ status: 429, code: MessagingErrorCode.RATE_LIMITED });
    expect(mapped.message).toContain("limitando temporariamente");
  });

  it("returns a recoverable message when group creation cannot be confirmed", () => {
    const mapped = mapApiError(
      new MessagingProviderError(
        MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
        "timeout",
        true,
        504,
      ),
    );

    expect(mapped).toMatchObject({
      status: 503,
      code: MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
    });
    expect(mapped.message).toContain("criação do grupo");
  });
});
