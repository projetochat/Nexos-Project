import type { AuthenticatedUser } from "./auth.types";
import type { ChatScope } from "./auth.types";
import type { Prisma } from "../generated/prisma";

export function roleConnectionIds(role: { key: string; metadata?: unknown }): string[] | null {
  if (role.key === "tenant_admin") return null;
  const scopes = roleChatScopes(role);
  if (scopes.length) return scopes.map((scope) => scope.connectionId);
  const ids = (role.metadata as { connectionIds?: unknown } | null)?.connectionIds;
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string"))]
    : [];
}

export function roleChatDepartmentIds(role: { key: string; metadata?: unknown }): string[] | null {
  if (role.key === "tenant_admin") return null;
  const scopes = roleChatScopes(role);
  if (scopes.length) return [...new Set(scopes.flatMap((scope) => scope.departmentIds))];
  const ids = (role.metadata as { departmentIds?: unknown } | null)?.departmentIds;
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string"))]
    : [];
}

export function roleChatScopes(role: { key: string; metadata?: unknown }): ChatScope[] {
  if (role.key === "tenant_admin") return [];
  const value = (role.metadata as { chatScopes?: unknown } | null)?.chatScopes;
  if (!Array.isArray(value)) {
    const metadata = role.metadata as
      | { connectionIds?: unknown; departmentIds?: unknown }
      | null
      | undefined;
    const connectionIds = Array.isArray(metadata?.connectionIds)
      ? metadata.connectionIds.filter((id): id is string => typeof id === "string")
      : [];
    const departmentIds = Array.isArray(metadata?.departmentIds)
      ? metadata.departmentIds.filter((id): id is string => typeof id === "string")
      : [];
    return [...new Set(connectionIds)].map((connectionId) => ({
      connectionId,
      departmentIds: [...new Set(departmentIds)],
      favoriteDepartmentId: null,
    }));
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.connectionId !== "string" || !Array.isArray(raw.departmentIds)) return [];
    const departmentIds = [
      ...new Set(raw.departmentIds.filter((id): id is string => typeof id === "string")),
    ];
    const favoriteDepartmentId =
      typeof raw.favoriteDepartmentId === "string" &&
      departmentIds.includes(raw.favoriteDepartmentId)
        ? raw.favoriteDepartmentId
        : null;
    return [{ connectionId: raw.connectionId, departmentIds, favoriteDepartmentId }];
  });
}

export function conversationChatScopeAccess(
  current: Pick<
    AuthenticatedUser,
    "roleKey" | "chatScopes" | "connectionIds" | "chatDepartmentIds"
  >,
): Prisma.ConversationWhereInput {
  if (current.roleKey === "tenant_admin") return {};
  if (current.chatScopes === undefined) {
    return {
      connectionId: { in: current.connectionIds ?? [] },
      ...(current.chatDepartmentIds === undefined
        ? {}
        : { departmentId: { in: current.chatDepartmentIds ?? [] } }),
    };
  }
  return {
    OR: (current.chatScopes ?? []).map((scope) => ({
      connectionId: { in: [scope.connectionId] },
      OR: [{ departmentId: { in: scope.departmentIds } }, { departmentId: null }],
    })),
  };
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
