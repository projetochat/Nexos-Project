import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma";
import { ApiExceptionFilter, mapApiError } from "./api-exception.filter";
import { MessagingErrorCode, MessagingProviderError } from "../messaging/messaging.contracts";

describe("mapApiError", () => {
  it("keeps WhatsApp rate limits out of the generic internal-error response", () => {
    const mapped = mapApiError(
      new MessagingProviderError(MessagingErrorCode.RATE_LIMITED, "rate-overlimit", true, 429),
    );

    expect(mapped).toMatchObject({ status: 429, code: MessagingErrorCode.RATE_LIMITED });
    expect(mapped.message).toContain("limitando temporariamente");
  });

  it("returns a recoverable message when a WhatsApp action cannot be confirmed", () => {
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
    expect(mapped.message).toContain("concluir esta ação");
  });
});

describe("ApiExceptionFilter", () => {
  it("returns a sanitized response correlated with the request id for an expired transaction", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { "x-request-id": "local-onboarding-p2028" },
          method: "POST",
          originalUrl: "/api/messaging/connections/evolution",
        }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction already closed: A query cannot be executed on an expired transaction.",
      { code: "P2028", clientVersion: "test" },
    );

    new ApiExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      requestId: "local-onboarding-p2028",
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.",
    });
  });
});
