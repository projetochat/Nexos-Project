import { PermissionKey } from "./permissions.constants";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN";
  typ: "access" | "refresh";
};

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN";
  permissions?: PermissionKey[];
};
