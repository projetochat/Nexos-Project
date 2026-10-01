import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://trixus:password@postgres:5432/trixus",
  JWT_SECRET: "access-secret-with-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-with-at-least-32-characters",
  FRONTEND_ORIGIN: "https://app.example.com",
  TRIXUS_PUBLIC_APP_URL: "https://app.example.com",
  REDIS_URL: "redis://redis:6379",
  RESEND_API_KEY: "re_example",
  TRIXUS_EMAIL_FROM: "Trixus <access@example.com>",
  TRIXUS_STORAGE_PROVIDER: "local",
  TRIXUS_STORAGE_LOCAL_PATH: "/var/lib/trixus/storage/tickets",
  TRIXUS_MESSAGE_STORAGE_PROVIDER: "local",
  TRIXUS_MESSAGE_STORAGE_LOCAL_PATH: "/var/lib/trixus/storage/messages",
};

describe("production environment validation", () => {
  it("accepts a complete production configuration", () => {
    expect(validateEnvironment(validProductionEnvironment)).toEqual(validProductionEnvironment);
  });

  it("does not impose production integrations on test and development", () => {
    expect(validateEnvironment({ NODE_ENV: "test" })).toEqual({ NODE_ENV: "test" });
    expect(validateEnvironment({ NODE_ENV: "development" })).toEqual({ NODE_ENV: "development" });
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

  it("requires the complete Evolution trust boundary when any part is enabled", () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
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
