import { describe, expect, it } from "vitest";
import {
  assertSafeResetTarget,
  databaseNameFromUrl,
  isAllowedHomologationDatabase,
} from "./reset-safety";

describe("homologation reset safety", () => {
  it("extracts and allowlists homologation database names", () => {
    expect(
      databaseNameFromUrl("postgresql://nexos:nexos@localhost:5432/nexos_0802?schema=public"),
    ).toBe("nexos_0802");
    expect(isAllowedHomologationDatabase("nexos_0802")).toBe(true);
    expect(isAllowedHomologationDatabase("nexos_0809")).toBe(true);
    expect(isAllowedHomologationDatabase("nexos_homolog")).toBe(true);
    expect(isAllowedHomologationDatabase("nexos")).toBe(false);
    expect(isAllowedHomologationDatabase("postgres")).toBe(false);
  });

  it("requires explicit confirmation", () => {
    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://nexos:nexos@localhost:5432/nexos_0802?schema=public",
        confirm: false,
      }),
    ).toThrow("RESET_CONFIRM_REQUIRED");
  });

  it("blocks production env, production-like hosts, and disallowed databases", () => {
    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://nexos:nexos@localhost:5432/nexos_0802?schema=public",
        nodeEnv: "production",
        confirm: true,
      }),
    ).toThrow("RESET_PRODUCTION_BLOCKED");

    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://nexos:nexos@prod-db.local:5432/nexos_0802?schema=public",
        confirm: true,
      }),
    ).toThrow("RESET_PRODUCTION_HOST_BLOCKED");

    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://nexos:nexos@localhost:5432/nexos?schema=public",
        confirm: true,
      }),
    ).toThrow("RESET_DATABASE_NOT_ALLOWED");
  });

  it("accepts a confirmed local homologation target", () => {
    expect(
      assertSafeResetTarget({
        databaseUrl: "postgresql://nexos:nexos@localhost:5432/nexos_0802?schema=public",
        confirm: true,
      }),
    ).toEqual({ databaseName: "nexos_0802", host: "localhost" });
  });
});
