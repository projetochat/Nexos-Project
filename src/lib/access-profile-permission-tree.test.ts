import { describe, expect, it } from "vitest";
import {
  delegatedPermissionIds,
  permissionDependencyIssue,
  togglePermissionGroupInTree,
  togglePermissionInTree,
  type PermissionTreeGroup,
} from "@/lib/access-profile-permission-tree";

const group: PermissionTreeGroup = {
  title: "Atendentes",
  items: [{ id: "users.read" }, { id: "users.manage" }, { id: "users.delete" }],
};

describe("access profile permission tree", () => {
  it("removes only alterable children when Ver is turned off", () => {
    expect(
      togglePermissionInTree({
        selectedIds: ["users.read", "users.manage"],
        permissionId: "users.read",
        checked: false,
        group,
        grantablePermissionIds: ["users.read", "users.manage"],
      }),
    ).toEqual({ permissionIds: [] });
  });

  it("blocks turning Ver off when that would orphan a protected child", () => {
    const selectedIds = ["users.read", "users.delete"];
    const result = togglePermissionInTree({
      selectedIds,
      permissionId: "users.read",
      checked: false,
      group,
      grantablePermissionIds: ["users.read"],
    });

    expect(result.permissionIds).toEqual(selectedIds);
    expect(result.blockedReason).toContain("não pode remover");
  });

  it("blocks a child while Ver is off", () => {
    const result = togglePermissionInTree({
      selectedIds: [],
      permissionId: "users.manage",
      checked: true,
      group,
      grantablePermissionIds: ["users.read", "users.manage"],
    });

    expect(result.permissionIds).toEqual([]);
    expect(result.blockedReason).toContain("Ative Ver");
  });

  it("does not add or remove a permission outside the actor authority", () => {
    const selectedIds = ["users.read", "users.delete"];
    expect(
      togglePermissionInTree({
        selectedIds,
        permissionId: "users.delete",
        checked: false,
        group,
        grantablePermissionIds: ["users.read"],
      }).permissionIds,
    ).toEqual(selectedIds);

    expect(
      togglePermissionInTree({
        selectedIds: ["users.read"],
        permissionId: "users.delete",
        checked: true,
        group,
        grantablePermissionIds: ["users.read"],
      }).permissionIds,
    ).toEqual(["users.read"]);
  });

  it("preserves permissions outside the actor authority and rejects injected additions", () => {
    expect(
      delegatedPermissionIds({
        selectedIds: ["users.read", "users.manage", "users.delete"],
        originalIds: ["users.delete"],
        grantablePermissionIds: ["users.read", "users.manage"],
      }),
    ).toEqual(["users.read", "users.manage", "users.delete"]);

    expect(
      delegatedPermissionIds({
        selectedIds: ["users.read", "users.delete"],
        originalIds: [],
        grantablePermissionIds: ["users.read"],
      }),
    ).toEqual(["users.read"]);
  });

  it("lets Todos grant only permissions held by the actor with Ver first", () => {
    expect(
      togglePermissionGroupInTree({
        selectedIds: [],
        checked: true,
        group,
        grantablePermissionIds: ["users.read", "users.manage"],
      }),
    ).toEqual({ permissionIds: ["users.read", "users.manage"] });
  });

  it("blocks Todos off when a protected permission is selected", () => {
    const selectedIds = ["users.read", "users.manage", "users.delete"];
    const result = togglePermissionGroupInTree({
      selectedIds,
      checked: false,
      group,
      grantablePermissionIds: ["users.read", "users.manage"],
    });

    expect(result.permissionIds).toEqual(selectedIds);
    expect(result.blockedReason).toBeTruthy();
  });

  it("lets Todos remove alterable children while preserving a protected parent", () => {
    expect(
      togglePermissionGroupInTree({
        selectedIds: ["users.read", "users.manage"],
        checked: false,
        group,
        grantablePermissionIds: ["users.manage"],
      }),
    ).toEqual({ permissionIds: ["users.read"] });
  });

  it("reports an inconsistent child without Ver", () => {
    expect(permissionDependencyIssue(["users.manage"], [group])).toContain("Ative Ver");
    expect(permissionDependencyIssue(["users.read", "users.manage"], [group])).toBeUndefined();
  });
});
