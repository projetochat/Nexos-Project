import {
  isPermissionKey,
  TENANT_ADMIN_PERMISSIONS,
  type PermissionKey,
} from "./permissions.constants";

type RoleWithPermissions = {
  key: string;
  permissions: Array<{ permissionId: string }>;
};

export function effectivePermissions(role: RoleWithPermissions): PermissionKey[] {
  if (role.key === "tenant_admin") return [...TENANT_ADMIN_PERMISSIONS];
  return [
    ...new Set(
      role.permissions.map((permission) => permission.permissionId).filter(isPermissionKey),
    ),
  ];
}
