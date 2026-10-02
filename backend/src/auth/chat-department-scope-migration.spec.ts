import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261002193000_chat_scope_separation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Chat department scope migration", () => {
  it("backfills only roles without an explicit department selection", () => {
    expect(migration).toContain("jsonb_agg");
    expect(migration).toContain('department."active" = true');
    expect(migration).toContain(
      "WHERE NOT (COALESCE(role.\"metadata\", '{}'::jsonb) ? 'departmentIds')",
    );
    expect(migration).toContain("conversation.\"conversationType\" = 'GROUP'");
    expect(migration).toContain('conversation."departmentId" IS NULL');
    expect(migration).toContain('ALTER TABLE "notifications" ADD COLUMN "connectionId" TEXT');
    expect(migration).toContain("notification.\"entityType\" IN ('conversation', 'lead')");
  });
});
