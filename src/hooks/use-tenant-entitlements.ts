import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { organizationApi } from "@/lib/trixus-api";

export type TenantModuleKey = "chat" | "campaigns" | "tickets";

const SAFE_DEFAULT_MODULES: Record<TenantModuleKey, boolean> = {
  chat: true,
  campaigns: false,
  tickets: false,
};

export function useTenantEntitlements(enabled = true) {
  const tenantId = useSession((state) => state.user?.empresaId);
  const userId = useSession((state) => state.user?.id);
  return useQuery({
    queryKey: ["trixus", "tenant-entitlements", tenantId ?? null, userId ?? null],
    queryFn: organizationApi.entitlements,
    staleTime: 60_000,
    enabled,
  });
}

export function tenantModules(
  features: Record<string, boolean> | undefined,
  resolved = true,
): Record<TenantModuleKey, boolean> {
  if (!resolved) return { chat: false, campaigns: false, tickets: false };
  if (!features) return SAFE_DEFAULT_MODULES;
  return {
    chat: features.chat !== false,
    campaigns: features.campaigns === true,
    tickets: features.tickets === true,
  };
}

export function modulePermissionGroups<T extends { items: Array<{ id: string }> }>(
  groups: T[],
  modules: { chat: boolean; campaigns: boolean; tickets: boolean },
): T[] {
  const chatPrefixes = [
    "conversations.",
    "messages.",
    "leads.",
    "groups.",
    "history.",
    "chat.",
    "schedules.",
    "bot_flows.",
    "automations.",
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(({ id }) => {
        if (!modules.chat && chatPrefixes.some((prefix) => id.startsWith(prefix))) return false;
        if (!modules.chat && !modules.campaigns && id.startsWith("connections.")) return false;
        if (!modules.campaigns && id.startsWith("campaigns.")) return false;
        if (!modules.tickets && id.startsWith("tickets.")) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
