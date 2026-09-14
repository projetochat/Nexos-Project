import { describe, expect, it } from "vitest";
import {
  assertSafeResetTarget,
  databaseNameFromUrl,
  isAllowedHomologationDatabase,
} from "./reset-safety";

describe("homologation reset safety", () => {
  it("extracts and allowlists homologation database names", () => {
    expect(
      databaseNameFromUrl("postgresql://trixus:trixus@localhost:5432/trixus_0802?schema=public"),
    ).toBe("trixus_0802");
    expect(isAllowedHomologationDatabase("trixus_0802")).toBe(true);
    expect(isAllowedHomologationDatabase("trixus_0809")).toBe(true);
    expect(isAllowedHomologationDatabase("trixus_homolog")).toBe(true);
    expect(isAllowedHomologationDatabase("trixus")).toBe(false);
    expect(isAllowedHomologationDatabase("postgres")).toBe(false);
  });

  it("requires explicit confirmation", () => {
    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://trixus:trixus@localhost:5432/trixus_0802?schema=public",
        confirm: false,
      }),
    ).toThrow("RESET_CONFIRM_REQUIRED");
  });

  it("blocks production env, production-like hosts, and disallowed databases", () => {
    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://trixus:trixus@localhost:5432/trixus_0802?schema=public",
        nodeEnv: "production",
        confirm: true,
      }),
    ).toThrow("RESET_PRODUCTION_BLOCKED");

    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://trixus:trixus@prod-db.local:5432/trixus_0802?schema=public",
        confirm: true,
      }),
    ).toThrow("RESET_PRODUCTION_HOST_BLOCKED");

    expect(() =>
      assertSafeResetTarget({
        databaseUrl: "postgresql://trixus:trixus@localhost:5432/trixus?schema=public",
        confirm: true,
      }),
    ).toThrow("RESET_DATABASE_NOT_ALLOWED");
  });

  it("accepts a confirmed local homologation target", () => {
    expect(
      assertSafeResetTarget({
        databaseUrl: "postgresql://trixus:trixus@localhost:5432/trixus_0802?schema=public",
        confirm: true,
      }),
    ).toEqual({ databaseName: "trixus_0802", host: "localhost" });
  });
});
