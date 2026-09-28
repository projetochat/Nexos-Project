import { describe, expect, it } from "vitest";
import { effectivePermissions } from "./effective-permissions";
import { PERMISSIONS } from "./permissions.constants";

describe("effectivePermissions", () => {
  it("grants the complete catalog to the protected tenant administrator", () => {
    expect(effectivePermissions({ key: "tenant_admin", permissions: [] })).toEqual(PERMISSIONS);
  });

  it("keeps individual permission switches paused for regular roles", () => {
    expect(
      effectivePermissions({
        key: "custom",
        permissions: [
          { permissionId: "contacts.read" },
          { permissionId: "contacts.read" },
          { permissionId: "unknown.permission" },
        ],
      }),
    ).toEqual(PERMISSIONS);
  });
});
