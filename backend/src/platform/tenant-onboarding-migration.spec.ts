import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261005120000_tenant_onboarding/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("tenant onboarding migration", () => {
  it("fails before any DDL when active global quick-reply duplicates require review", () => {
    const preflightPosition = migration.indexOf("DO $$");
    const firstDdlPosition = migration.indexOf('CREATE TYPE "TenantOnboardingStatus"');

    expect(preflightPosition).toBe(0);
    expect(firstDdlPosition).toBeGreaterThan(preflightPosition);
    expect(migration).toContain('GROUP BY "tenantId", "normalizedShortcut"');
    expect(migration).toContain("HAVING COUNT(*) > 1");
    expect(migration).toContain("ONBOARDING_MIGRATION_BLOCKED");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"quick_replies"/i);
    expect(migration).not.toMatch(/UPDATE\s+"quick_replies"/i);
  });

  it("creates tenant-scoped state without enrolling existing tenants", () => {
    expect(migration).toContain('CREATE TABLE "tenant_onboarding_states"');
    expect(migration).toContain('PRIMARY KEY ("tenantId")');
    expect(migration).toContain(
      'FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain('CHECK ("currentStep" BETWEEN 1 AND 8)');
    expect(migration).toContain('CHECK ("maxCompletedStep" BETWEEN 0 AND 8)');
    expect(migration).toContain('CHECK ("version" >= 1)');
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"tenant_onboarding_states"/i);
    expect(migration).not.toMatch(/UPDATE\s+"tenant_onboarding_states"/i);
  });

  it("adds optional tag descriptions and protects active global quick-reply shortcuts", () => {
    expect(migration).toContain('ALTER TABLE "tags"');
    expect(migration).toContain('ADD COLUMN "description" TEXT');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "quick_replies_tenant_global_active_shortcut_key"',
    );
    expect(migration).toContain('WHERE "departmentId" IS NULL AND "archivedAt" IS NULL');
  });
});
