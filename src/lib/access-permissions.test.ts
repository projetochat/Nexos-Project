import { describe, expect, it } from "vitest";
import { effectiveSessionPermissions, TENANT_ADMIN_PERMISSIONS } from "@/lib/access-permissions";

describe("effectiveSessionPermissions", () => {
  it("keeps the tenant administrator at full access even with a stale session", () => {
    const permissions = effectiveSessionPermissions("admin", ["conversations.read"]);

    expect(permissions).toEqual(TENANT_ADMIN_PERMISSIONS);
    expect(permissions).toContain("dashboard.read");
    expect(permissions).toContain("roles.create");
    expect(permissions).toContain("roles.update");
    expect(permissions).toContain("settings.manage");
    expect(permissions).toContain("groups.leave");
    expect(permissions).not.toContain("conversations.manage");
    expect(permissions).not.toContain("chat.contacts.read");
    expect(permissions).not.toContain("chat.customer_link.edit");
    expect(permissions).not.toContain("chat.contacts.block");
    expect(permissions).not.toContain("chat.tags.use");
  });

  it("does not elevate a regular user", () => {
    expect(effectiveSessionPermissions("operator", ["conversations.read"])).toEqual([
      "conversations.read",
    ]);
  });
});
