import { SetMetadata } from "@nestjs/common";
import { PermissionKey } from "./permissions.constants";

export const PERMISSIONS_KEY = "permissions";
export const ANY_PERMISSIONS_KEY = "any-permissions";
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
