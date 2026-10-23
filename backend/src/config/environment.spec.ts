import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const validProductionEnvironment = {
  NODE_ENV: "production",
  TRIXUS_ENVIRONMENT: "production",
  DATABASE_URL: "postgresql://trixus:password@postgres:5432/trixus",
  JWT_SECRET: "access-secret-with-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-with-at-least-32-characters",
  AI_CREDENTIALS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  FRONTEND_ORIGIN: "https://app.trixus.com.br",
  TRIXUS_REALTIME_CORS_ORIGIN: "https://app.trixus.com.br",
  TRIXUS_PLATFORM_APP_URL: "https://app.trixus.com.br",
  TRIXUS_TENANT_APP_URL: "https://app.trixus.com.br",
  TRIXUS_PUBLIC_APP_URL: "https://app.trixus.com.br",
  REDIS_URL: "redis://redis:6379",
  RESEND_API_KEY: "re_example",
  TRIXUS_EMAIL_FROM: "Trixus <access@example.com>",
  TENANT_ADMIN_PROVISIONING_MODE: "invitation_email",
  EVOLUTION_BASE_URL: "http://evolution-api:8080",
  EVOLUTION_API_KEY: "evolution-api-key",
  EVOLUTION_WEBHOOK_PUBLIC_URL: "https://api.trixus.com.br/api/webhooks/evolution",
  EVOLUTION_WEBHOOK_SECRET: "evolution-webhook-secret",
  TRIXUS_STORAGE_PROVIDER: "local",
  TRIXUS_STORAGE_LOCAL_PATH: "/var/lib/trixus/storage/tickets",
  TRIXUS_MESSAGE_STORAGE_PROVIDER: "local",
  TRIXUS_MESSAGE_STORAGE_LOCAL_PATH: "/var/lib/trixus/storage/messages",
};

describe("production environment validation", () => {
  it("accepts a complete production configuration", () => {
    expect(validateEnvironment(validProductionEnvironment)).toEqual(validProductionEnvironment);
  });

  it("requires a 32-byte AI credential encryption key without echoing its value", () => {
    const leaked = "too-short-ai-secret";
    expect(() => validateEnvironment({
      ...validProductionEnvironment,
      AI_CREDENTIALS_ENCRYPTION_KEY: leaked,
    })).toThrow(/AI_CREDENTIALS_ENCRYPTION_KEY must encode exactly 32 bytes/);
    try {
      validateEnvironment({ ...validProductionEnvironment, AI_CREDENTIALS_ENCRYPTION_KEY: leaked });
    } catch (error) {
      expect(String(error)).not.toContain(leaked);
    }
  });

  it("accepts the exact homologation public contract", () => {
    expect(
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_ENVIRONMENT: "homologation",
        FRONTEND_ORIGIN: "https://hom.trixus.com.br",
        TRIXUS_REALTIME_CORS_ORIGIN: "https://hom.trixus.com.br",
        TRIXUS_PLATFORM_APP_URL: "https://hom.trixus.com.br",
        TRIXUS_TENANT_APP_URL: "https://hom.trixus.com.br",
        TRIXUS_PUBLIC_APP_URL: "https://hom.trixus.com.br",
        EVOLUTION_WEBHOOK_PUBLIC_URL:
          "https://api-hom.trixus.com.br/api/webhooks/evolution",
      }),
    ).toMatchObject({ TRIXUS_ENVIRONMENT: "homologation" });
  });

  it("keeps staging available without applying a production hostname contract", () => {
    expect(
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_ENVIRONMENT: "staging",
        FRONTEND_ORIGIN: "https://staging.example.com",
        TRIXUS_REALTIME_CORS_ORIGIN: "https://staging.example.com",
        TRIXUS_PLATFORM_APP_URL: "https://staging.example.com",
        TRIXUS_TENANT_APP_URL: "https://staging.example.com",
        TRIXUS_PUBLIC_APP_URL: "https://staging.example.com",
        EVOLUTION_WEBHOOK_PUBLIC_URL: "https://api-staging.example.com/api/webhooks/evolution",
      }),
    ).toMatchObject({ TRIXUS_ENVIRONMENT: "staging" });
  });

  it("rejects an unknown or non-canonical Trixus environment", () => {
    for (const environment of ["development", "Staging"]) {
      expect(() =>
        validateEnvironment({
          ...validProductionEnvironment,
          TRIXUS_ENVIRONMENT: environment,
        }),
      ).toThrow(/TRIXUS_ENVIRONMENT must be production, homologation or staging/);
    }
  });

  it("does not impose production integrations on test and development", () => {
    expect(validateEnvironment({ NODE_ENV: "test" })).toEqual({ NODE_ENV: "test" });
    expect(validateEnvironment({ NODE_ENV: "development" })).toEqual({ NODE_ENV: "development" });
  });

  it("rejects the legacy single public URL fallback in controlled environments", () => {
    const { TRIXUS_PLATFORM_APP_URL, TRIXUS_TENANT_APP_URL, ...environment } =
      validProductionEnvironment;
    expect(() =>
      validateEnvironment({
        ...environment,
        TRIXUS_PUBLIC_APP_URL: "https://app.trixus.com.br",
      }),
    ).toThrow(/TRIXUS_PLATFORM_APP_URL must be exactly/);
  });

  it("requires exact HTTPS origins for the HTTP and realtime trust boundaries", () => {
    for (const [name, value] of [
      ["FRONTEND_ORIGIN", "https://app.example.com/path"],
      ["TRIXUS_REALTIME_CORS_ORIGIN", "https://chat.example.com/path"],
      ["TRIXUS_TENANT_APP_URL", "https://chat.example.com/login"],
    ]) {
      expect(() => validateEnvironment({ ...validProductionEnvironment, [name]: value })).toThrow(
        new RegExp(name),
      );
    }
  });

  it("fails before startup when security and dependency settings are unsafe", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        JWT_SECRET: "short",
        JWT_REFRESH_SECRET: "short",
        FRONTEND_ORIGIN: "http://app.example.com",
        REDIS_URL: "not-a-url",
        TRIXUS_STORAGE_LOCAL_PATH: "relative/storage",
      }),
    ).toThrow(/JWT_SECRET must contain at least 32 characters/);
  });

  it("rejects the known temporary-password provisioning mode in production", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TENANT_ADMIN_PROVISIONING_MODE: "temporary_password",
      }),
    ).toThrow(/TENANT_ADMIN_PROVISIONING_MODE must be invitation_email in production/);
  });

  it("rejects development secrets and local token exposure in production", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        JWT_SECRET: "trixus-homologation-access-2026-08-11-local-secret",
      }),
    ).toThrow(/JWT_SECRET must not use a known placeholder value/);
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_EXPOSE_LOCAL_TOKENS: "true",
      }),
    ).toThrow(/TRIXUS_EXPOSE_LOCAL_TOKENS must not be true in production/);
  });

  it("requires the complete Evolution trust boundary when any part is enabled", () => {
    const {
      EVOLUTION_API_KEY,
      EVOLUTION_WEBHOOK_PUBLIC_URL,
      EVOLUTION_WEBHOOK_SECRET,
      ...environment
    } = validProductionEnvironment;
    expect(() =>
      validateEnvironment({
        ...environment,
        EVOLUTION_BASE_URL: "http://evolution-api:8080",
      }),
    ).toThrow(/EVOLUTION_API_KEY is required when Evolution is configured/);
  });

  it("does not include secret values in validation errors", () => {
    const leakedValue = "secret-value-that-must-not-appear";
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        JWT_SECRET: leakedValue,
        JWT_REFRESH_SECRET: leakedValue,
      }),
    ).toThrowError(expect.not.stringContaining(leakedValue));
  });

  it("rejects unknown storage providers instead of silently falling back to local storage", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_STORAGE_PROVIDER: "r22",
      }),
    ).toThrow(/TRIXUS_STORAGE_PROVIDER must be local or r2/);
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_MESSAGE_STORAGE_PROVIDER: "s33",
      }),
    ).toThrow(/TRIXUS_MESSAGE_STORAGE_PROVIDER must be local in this release/);
  });

  it("requires an absolute message-storage path when its provider is local", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_MESSAGE_STORAGE_LOCAL_PATH: "relative/messages",
      }),
    ).toThrow(/TRIXUS_MESSAGE_STORAGE_LOCAL_PATH must be an absolute path/);
  });

  it("returns normalized string values so validation and runtime use the same configuration", () => {
    const result = validateEnvironment({
      ...validProductionEnvironment,
      JWT_SECRET: "  access-secret-with-at-least-32-characters  ",
      REDIS_URL: "  redis://redis:6379  ",
    });
    expect(result.JWT_SECRET).toBe("access-secret-with-at-least-32-characters");
    expect(result.REDIS_URL).toBe("redis://redis:6379");
  });

  it("validates the exact private origins and timeout used by remote media downloads", () => {
    expect(
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS:
          "http://evolution-api:8080,https://media.example.com",
        TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS: "15000",
      }),
    ).toMatchObject({
      TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS: "http://evolution-api:8080,https://media.example.com",
    });
    for (const value of [
      "file:///tmp/media",
      "http://user:pass@evolution-api:8080",
      "http://evolution-api:8080/unexpected-path",
    ]) {
      expect(() =>
        validateEnvironment({
          ...validProductionEnvironment,
          TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS: value,
        }),
      ).toThrow(/TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS/);
    }
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS: "unbounded",
      }),
    ).toThrow(/TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS/);
  });
});
