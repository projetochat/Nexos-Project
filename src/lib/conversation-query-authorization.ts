import type { Query, QueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@/lib/session";

export function conversationAuthorizationScope(user: SessionUser | null | undefined) {
  const canReadAdditionalFields =
    user?.permissions?.includes("contacts.additional_fields.read") ?? false;
  return [
    user?.empresaId ?? "no-tenant",
    user?.id ?? "anonymous",
    canReadAdditionalFields ? "additional-fields" : "basic-contact",
  ].join(":");
}

export function isConversationSensitiveQuery(query: Pick<Query, "queryKey">) {
  const [area, resource] = query.queryKey;
  return (
    (area === "trixus" && (resource === "conversations" || resource === "contacts")) ||
    (area === "operations" && resource === "history")
  );
}

export async function clearStaleConversationAuthorizationCache(
  queryClient: QueryClient,
  retainedScope: string,
) {
  const predicate = (query: Query) =>
    (isConversationSensitiveQuery(query) && !query.queryKey.includes(retainedScope)) ||
    containsAdditionalFields(query.state.data);
  await queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
}

function containsAdditionalFields(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsAdditionalFields(item, seen));
  const record = value as Record<string, unknown>;
  if ("customFields" in record || "customFieldValues" in record || "variableKey" in record) {
    return true;
  }
  return Object.values(record).some((item) => containsAdditionalFields(item, seen));
}
