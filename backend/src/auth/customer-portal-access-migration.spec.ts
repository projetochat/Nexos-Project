import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("independent customer portal access migration", () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      "../../prisma/migrations/20261023190000_independent_customer_portal_access/migration.sql",
    ),
    "utf8",
  );

  it("runs the legacy-data preflight before creating any new table", () => {
    const preflight = migration.indexOf("DO $$");
    const firstDdl = migration.indexOf('CREATE TABLE "customer_portal_accesses"');

    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(firstDdl).toBeGreaterThan(preflight);
    expect(migration).toContain("customer portal preflight failed");
    expect(migration).toContain("invalid_shape_count");
    expect(migration).toContain("missing_department_count");
    expect(migration).toContain("invalid_branch_scope_count");
    expect(migration).toContain("invalid_department_scope_count");
  });

  it("revokes only legacy sessions whose membership was backfilled", () => {
    const backfill = migration.indexOf('INSERT INTO "customer_portal_accesses"');
    const revocation = migration.indexOf('UPDATE "auth_sessions" s');

    expect(revocation).toBeGreaterThan(backfill);
    expect(migration.slice(revocation)).toContain('s."portalAccessId" IS NULL');
    expect(migration.slice(revocation)).toContain('a."membershipId" = s."membershipId"');
    expect(migration.slice(revocation)).toContain('SET "revokedAt" = CURRENT_TIMESTAMP');
  });
});
