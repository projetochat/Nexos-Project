import { BadGatewayException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { redactAiSecrets, safeProviderError } from "./ai-redaction";

describe("AI secret redaction", () => {
  it("redacts nested credential fields and inline values", () => {
    const redacted = redactAiSecrets({
      apiKey: "sk-visible",
      nested: { authorization: "Bearer visible", message: "token=visible failure" },
    });
    expect(JSON.stringify(redacted)).not.toContain("visible");
    expect(redacted).toMatchObject({
      apiKey: "[redacted]",
      nested: { authorization: "[redacted]" },
    });
  });

  it("exposes only a canonical provider error code", () => {
    const result = safeProviderError(Object.assign(new Error("apiKey=sk-secret"), { status: 401 }));
    expect(result).toEqual({ code: "AI_PROVIDER_401" });
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("preserves a canonical provider code from a wrapped HTTP exception", () => {
    const result = safeProviderError(
      new BadGatewayException({
        code: "AI_PROVIDER_QUOTA_EXCEEDED",
        message: "A cota foi atingida.",
      }),
    );
    expect(result).toEqual({ code: "AI_PROVIDER_QUOTA_EXCEEDED" });
  });
});
