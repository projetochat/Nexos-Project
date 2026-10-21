import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_PERMISSIONS,
  PERMISSIONS,
  SUPERVISOR_PERMISSIONS,
  TENANT_ADMIN_PERMISSIONS,
} from "./permissions.constants";
import { pendingLeadVisibilityWhere } from "../leads/lead-visibility";

describe("independent leads.read permission", () => {
  it("is in the catalog and preserves the default role access", () => {
    expect(PERMISSIONS).toContain("leads.read");
    expect(TENANT_ADMIN_PERMISSIONS).toContain("leads.read");
    expect(SUPERVISOR_PERMISSIONS).toContain("leads.read");
    expect(AGENT_PERMISSIONS).toContain("leads.read");
  });

  it("hides only pending leads when the permission is absent", () => {
    expect(pendingLeadVisibilityWhere({ permissions: ["conversations.read"] })).toEqual({
      OR: [{ lead: { is: null } }, { lead: { is: { status: { notIn: ["NEW", "QUEUED"] } } } }],
    });
    expect(
      pendingLeadVisibilityWhere({ permissions: ["conversations.read", "leads.read"] }),
    ).toEqual({});
  });

  it("uses an idempotent migration that copies the former conversations.read grants", () => {
    const sql = readFileSync(
      new URL(
        "../../prisma/migrations/20261021120000_independent_leads_read_permission/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain('ON CONFLICT ("id") DO UPDATE');
    expect(sql).toContain("WHERE existing.\"permissionId\" = 'conversations.read'");
    expect(sql).toContain('ON CONFLICT ("roleId", "permissionId") DO NOTHING');
  });
});
