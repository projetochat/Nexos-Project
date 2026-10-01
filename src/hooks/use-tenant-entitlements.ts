import { useQuery } from "@tanstack/react-query";
import { organizationApi } from "@/lib/trixus-api";

export type TenantModuleKey = "chat" | "campaigns" | "tickets";

const SAFE_DEFAULT_MODULES: Record<TenantModuleKey, boolean> = {
  chat: true,
  campaigns: false,
  tickets: false,
};

export function useTenantEntitlements(enabled = true) {
  return useQuery({
    queryKey: ["trixus", "tenant-entitlements"],
    queryFn: organizationApi.entitlements,
    staleTime: 60_000,
    enabled,
  });
}

export function tenantModules(
  features: Record<string, boolean> | undefined,
): Record<TenantModuleKey, boolean> {
  if (!features) return SAFE_DEFAULT_MODULES;
  return {
    chat: true,
    campaigns: features.campaigns === true,
    tickets: features.tickets === true,
  };
}
