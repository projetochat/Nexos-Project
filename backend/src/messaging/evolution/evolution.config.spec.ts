import { describe, expect, it } from "vitest";
import { evolutionConfigFromEnv, normalizeSecret } from "./evolution.config";

describe("evolutionConfigFromEnv", () => {
  it("normalizes webhook secrets with surrounding whitespace or quotes", () => {
    expect(normalizeSecret("  webhook-secret  ")).toBe("webhook-secret");
    expect(normalizeSecret('"webhook-secret"')).toBe("webhook-secret");
    expect(normalizeSecret(" 'webhook-secret' ")).toBe("webhook-secret");
  });

  it("does not expose raw spacing in the loaded webhook secret", () => {
    expect(
      evolutionConfigFromEnv({
        EVOLUTION_BASE_URL: " http://evolution.local/ ",
        EVOLUTION_API_KEY: ' "api-key" ',
        EVOLUTION_WEBHOOK_PUBLIC_URL: " http://host.docker.internal:3001/api/webhooks/evolution/ ",
        EVOLUTION_WEBHOOK_SECRET: " 'webhook-secret' ",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      baseUrl: "http://evolution.local",
      apiKey: "api-key",
      webhookPublicUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "webhook-secret",
    });
  });
});
