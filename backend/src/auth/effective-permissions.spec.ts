import { describe, expect, it } from "vitest";
import { effectivePermissions, moduleAwarePermissions } from "./effective-permissions";
import { TENANT_ADMIN_PERMISSIONS } from "./permissions.constants";

describe("effectivePermissions", () => {
  it("grants the complete catalog to the protected tenant administrator", () => {
    expect(effectivePermissions({ key: "tenant_admin", permissions: [] })).toEqual(
      TENANT_ADMIN_PERMISSIONS,
    );
  });

  it("uses only known permissions assigned to regular roles", () => {
    expect(
      effectivePermissions({
        key: "custom",
        permissions: [
          { permissionId: "contacts.read" },
          { permissionId: "contacts.read" },
          { permissionId: "unknown.permission" },
        ],
      }),
    ).toEqual(["contacts.read"]);
  });

  it("removes disabled optional modules from the administrator catalog", async () => {
    const permissions = await moduleAwarePermissions(
      {
        tenantSubscription: {
          findFirst: async () => ({ featuresSnapshot: { chat: true, campaigns: true, tickets: true } }),
        },
      },
      "tenant-a",
      { campaigns: false, tickets: false },
      { key: "tenant_admin", permissions: [] },
    );

    expect(permissions).toContain("conversations.read");
    expect(permissions.some((permission) => permission.startsWith("campaigns."))).toBe(false);
    expect(permissions.some((permission) => permission.startsWith("tickets."))).toBe(false);
  });
});
