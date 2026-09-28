import { PERMISSIONS, type PermissionKey } from "./permissions.constants";

type RoleWithPermissions = {
  key: string;
  permissions: Array<{ permissionId: string }>;
};

export function effectivePermissions(_role: RoleWithPermissions): PermissionKey[] {
  // D-001: individual permission switches remain temporarily paused. Runtime
  // authorization still revalidates the active membership and keeps instance /
  // department scope, but every active tenant role receives the known catalog.
  return [...PERMISSIONS];
}
