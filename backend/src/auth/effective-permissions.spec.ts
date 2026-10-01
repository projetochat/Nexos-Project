import { describe, expect, it } from "vitest";
import { effectivePermissions } from "./effective-permissions";
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
});
