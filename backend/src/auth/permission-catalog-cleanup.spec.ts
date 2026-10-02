import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions.constants";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261002180000_permission_catalog_cleanup/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const obsoletePermissions = [
  "chat.audio.send",
  "chat.contacts.create",
  "chat.contacts.edit",
  "chat.tickets.create",
  "chat.contacts.read",
  "chat.customer_link.edit",
  "chat.contacts.block",
  "conversations.manage",
] as const;

describe("permission catalog cleanup migration", () => {
  it("copies every obsolete grant while keeping catalog rows for rollback compatibility", () => {
    expect(migration).toContain('INSERT INTO "role_permissions"');
    expect(migration).not.toContain('DELETE FROM "permissions"');
    for (const permission of obsoletePermissions) {
      expect(migration).toContain(`('${permission}',`);
      expect(PERMISSIONS).not.toContain(permission);
    }
  });

  it("adds and migrates the dedicated permission for leaving groups", () => {
    expect(PERMISSIONS).toContain("groups.leave");
    expect(migration).toContain("('groups.update', 'groups.leave')");
    expect(migration).toContain("SELECT role.\"id\", 'groups.leave'");
  });

  it("preserves chat access when migrating the legacy contact block grant", () => {
    expect(migration).toContain("('chat.contacts.block', 'conversations.read')");
    expect(migration).toContain("('conversations.read', 'Visualizar conversas')");
  });
});
