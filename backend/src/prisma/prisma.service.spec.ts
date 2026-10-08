import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "./prisma.service";

describe("PrismaService environment database guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an allowlisted homologation database", () => {
    vi.stubEnv("TRIXUS_ENVIRONMENT", "homologation");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://trixus:password@localhost:5432/trixus_homolog?schema=public",
    );

    expect(() =>
      Reflect.apply(
        Reflect.get(PrismaService.prototype, "assertHomologationDatabase"),
        new PrismaService(),
        [],
      ),
    ).not.toThrow();
  });

  it("blocks homologation from using a production-like database", () => {
    vi.stubEnv("TRIXUS_ENVIRONMENT", "homologation");
    vi.stubEnv("DATABASE_URL", "postgresql://trixus:password@localhost:5432/trixus?schema=public");

    expect(() =>
      Reflect.apply(
        Reflect.get(PrismaService.prototype, "assertHomologationDatabase"),
        new PrismaService(),
        [],
      ),
    ).toThrow(/TRIXUS_ENVIRONMENT=homologation requires an allowed homologation database/);
  });

  it.each(["production", "staging"])("does not apply the homologation guard to %s", (mode) => {
    vi.stubEnv("TRIXUS_ENVIRONMENT", mode);
    vi.stubEnv("DATABASE_URL", "");

    expect(() =>
      Reflect.apply(
        Reflect.get(PrismaService.prototype, "assertHomologationDatabase"),
        new PrismaService(),
        [],
      ),
    ).not.toThrow();
  });
});
