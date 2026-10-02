import type { AuthenticatedUser } from "./auth.types";
import type { Prisma } from "../generated/prisma";

export function roleConnectionIds(role: { key: string; metadata?: unknown }): string[] | null {
  if (role.key === "tenant_admin") return null;
  const ids = (role.metadata as { connectionIds?: unknown } | null)?.connectionIds;
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string"))]
    : [];
}

export function roleChatDepartmentIds(role: { key: string; metadata?: unknown }): string[] | null {
  if (role.key === "tenant_admin") return null;
  const ids = (role.metadata as { departmentIds?: unknown } | null)?.departmentIds;
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string"))]
    : [];
}

export function connectionAccess(
  current: Pick<AuthenticatedUser, "roleKey" | "connectionIds">,
): Prisma.ConversationWhereInput {
  return current.roleKey === "tenant_admin"
    ? {}
    : { connectionId: { in: current.connectionIds ?? [] } };
}

export function connectionIdAccess(
  current: Pick<AuthenticatedUser, "roleKey" | "connectionIds">,
): Prisma.MessagingConnectionWhereInput {
  return current.roleKey === "tenant_admin" ? {} : { id: { in: current.connectionIds ?? [] } };
}

export function departmentAccess(
  current: Pick<AuthenticatedUser, "roleKey" | "chatDepartmentIds">,
): Prisma.ConversationWhereInput {
  return current.roleKey === "tenant_admin"
    ? {}
    : { departmentId: { in: current.chatDepartmentIds ?? [] } };
}

export function departmentIdAccess(
  current: Pick<AuthenticatedUser, "roleKey" | "chatDepartmentIds">,
): Prisma.DepartmentWhereInput {
  return current.roleKey === "tenant_admin" ? {} : { id: { in: current.chatDepartmentIds ?? [] } };
}
