import { PermissionKey } from "./permissions.constants";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  roleKey: string;
  platformRole: "USER" | "ADMIN" | "SUPPORT" | "READONLY";
  surface: "platform" | "tenant";
  aud: "trixus-platform" | "trixus-tenant";
  typ: "access" | "refresh" | "password_setup" | "tenant_selection";
  iatMs?: number;
  exp?: number;
  sid?: string;
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
  surface?: "platform" | "tenant";
  context?: "tenant" | "platform";
  platformPermissions?: string[];
  permissions?: PermissionKey[];
  assignedPermissionIds?: string[];
  connectionIds?: string[] | null;
  chatDepartmentIds?: string[] | null;
  chatScopes?: ChatScope[] | null;
  iatMs?: number;
  sid?: string;
  impersonationSessionId?: string;
  actorPlatformUserId?: string;
};

export type ChatScope = {
  connectionId: string;
  departmentIds: string[];
  favoriteDepartmentId: string | null;
};
