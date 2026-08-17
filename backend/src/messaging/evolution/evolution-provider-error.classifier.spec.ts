import { describe, expect, it } from "vitest";
import { MessagingErrorCode } from "../messaging.contracts";
import {
  classifyEvolutionProviderError,
  sanitizeProviderText,
} from "./evolution-provider-error.classifier";

describe("classifyEvolutionProviderError", () => {
  it("classifies HTTP 500 as retryable with provider diagnostics", () => {
    const error = classifyEvolutionProviderError({
      status: 500,
      statusText: "Internal Server Error",
      data: { message: "Internal Server Error", code: "EVO_500" },
      endpointPath: "/message/sendText/i",
      method: "POST",
    });

    expect(error).toMatchObject({
      code: MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      retryable: true,
      httpStatus: 500,
      providerCode: "EVO_500",
      endpointPath: "/message/sendText/i",
      method: "POST",
    });
  });

  it("classifies auth and invalid payload failures as permanent", () => {
    expect(classifyEvolutionProviderError({ status: 401 }).retryable).toBe(false);
    expect(classifyEvolutionProviderError({ status: 422 })).toMatchObject({
      retryable: false,
      code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD,
    });
  });

  it("classifies Evolution validation arrays as invalid provider payload", () => {
    expect(
      classifyEvolutionProviderError({
        status: 400,
        data: { message: ['instance requires property "text"'] },
      }),
    ).toMatchObject({
      retryable: false,
      code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD,
      providerCode: "VALIDATION_ERROR",
      message: 'instance requires property "text"',
    });
  });

  it("classifies rate limit and network errors as retryable", () => {
    expect(classifyEvolutionProviderError({ status: 429 }).retryable).toBe(true);
    expect(classifyEvolutionProviderError({ code: "ECONNREFUSED" })).toMatchObject({
      code: MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      retryable: true,
    });
  });

  it("marks timeout and connection reset as unknown outcome", () => {
    expect(classifyEvolutionProviderError({ timeout: true })).toMatchObject({
      retryable: true,
      unknownOutcome: true,
    });
    expect(classifyEvolutionProviderError({ code: "ECONNRESET" })).toMatchObject({
      retryable: true,
      unknownOutcome: true,
    });
  });

  it("redacts secrets and long provider bodies", () => {
    expect(
      sanitizeProviderText(
        `apikey=secret token=abc Authorization=Bearer abc.def data:image/png;base64,abc123`,
      ),
    ).not.toContain("secret");
  });
});
