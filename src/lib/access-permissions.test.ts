import { describe, expect, it } from "vitest";
import { effectiveSessionPermissions, TENANT_ADMIN_PERMISSIONS } from "@/lib/access-permissions";

describe("effectiveSessionPermissions", () => {
  it("keeps the tenant administrator at full access even with a stale session", () => {
    const permissions = effectiveSessionPermissions("admin", ["conversations.read"]);

    expect(permissions).toEqual(TENANT_ADMIN_PERMISSIONS);
    expect(permissions).toContain("dashboard.read");
    expect(permissions).toContain("roles.manage");
    expect(permissions).toContain("settings.manage");
  });

  it("does not elevate a regular user", () => {
    expect(effectiveSessionPermissions("operator", ["conversations.read"])).toEqual([
      "conversations.read",
    ]);
  });
});
