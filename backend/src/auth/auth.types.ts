import { PermissionKey } from "./permissions.constants";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  typ: "access" | "refresh";
  iatMs?: number;
};

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  permissions?: PermissionKey[];
  iatMs?: number;
};
