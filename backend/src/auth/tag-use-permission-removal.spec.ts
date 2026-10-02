import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions.constants";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261002230000_contact_edit_controls_tag_usage/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("tag usage permission removal", () => {
  it("removes the independent grant without deleting the rollback catalog row", () => {
    expect(PERMISSIONS).not.toContain("chat.tags.use");
    expect(migration).toContain('DELETE FROM "role_permissions"');
    expect(migration).toContain("'chat.tags.use'");
    expect(migration).not.toContain('DELETE FROM "permissions"');
  });
});
