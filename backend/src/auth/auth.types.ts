import { PermissionKey } from "./permissions.constants";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  typ: "access" | "refresh" | "password_setup" | "tenant_selection";
  iatMs?: number;
  impersonationSessionId?: string;
  actorPlatformUserId?: string;
};

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  context?: "tenant" | "platform";
  platformPermissions?: string[];
  permissions?: PermissionKey[];
  assignedPermissionIds?: string[];
  connectionIds?: string[] | null;
  iatMs?: number;
  impersonationSessionId?: string;
  actorPlatformUserId?: string;
};
