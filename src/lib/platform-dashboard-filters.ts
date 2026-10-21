import type { PlatformDashboardFilters } from "@/lib/platform-dashboard-api";

export function platformAvailableTenants<T extends { id: string; clientId: string | null }>(
  tenants: T[],
  clientId?: string,
) {
  return clientId ? tenants.filter((tenant) => tenant.clientId === clientId) : tenants;
}

export function platformTenantSelectionPatch(
  tenantId: string,
  currentClientId: string | undefined,
  tenants: Array<{ id: string; clientId: string | null }>,
): Pick<PlatformDashboardFilters, "tenantId" | "clientId"> {
  if (!tenantId) return { tenantId: undefined, clientId: currentClientId };
  const tenant = tenants.find((item) => item.id === tenantId);
  return { tenantId, clientId: tenant?.clientId ?? undefined };
}

export function platformClientSelectionPatch(
  clientId: string,
  tenantId: string | undefined,
  tenants: Array<{ id: string; clientId: string | null }>,
): Pick<PlatformDashboardFilters, "clientId" | "tenantId"> {
  const nextClientId = clientId || undefined;
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId);
  return {
    clientId: nextClientId,
    tenantId:
      selectedTenant && nextClientId && selectedTenant.clientId !== nextClientId
        ? undefined
        : tenantId,
  };
}
