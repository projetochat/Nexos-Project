export type UnifiedLoginCounts = {
  status: "disabled" | "available" | "unavailable" | "ambiguous";
  countsByTenant: Array<{
    tenantId: string;
    local: number | null;
    homologation: number | null;
    production: number | null;
    total: number | null;
  }>;
  updatedAt?: string;
};

type Environments = { local: number; homologation: number; production: number };
const zeroes = (): Environments => ({ local: 0, homologation: 0, production: 0 });

/** Replace only login counts; other BI metrics remain scoped to the local installation. */
export function consolidateUnifiedLogins<
  T extends { clientId: string | null; logins: number },
  U extends { logins: number },
>(
  rows: T[],
  totals: U,
  tenants: Array<{ tenantId: string; clientId: string | null }>,
  aggregate: UnifiedLoginCounts,
) {
  const loginAggregation = { status: aggregate.status, updatedAt: aggregate.updatedAt ?? null };
  if (aggregate.status === "disabled") return { rows, totals, loginAggregation };
  const counts = new Map(aggregate.countsByTenant.map((item) => [item.tenantId, item]));
  const complete =
    aggregate.status === "available" &&
    counts.size === aggregate.countsByTenant.length &&
    tenants.every(({ tenantId }) => {
      const count = counts.get(tenantId);
      if (!count) return false;
      const values = [count.local, count.homologation, count.production, count.total];
      return (
        values.every(
          (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
        ) && count.total === count.local! + count.homologation! + count.production!
      );
    }) &&
    Number.isSafeInteger(
      tenants.reduce((sum, tenant) => sum + counts.get(tenant.tenantId)!.total!, 0),
    );
  if (!complete) {
    return {
      rows: rows.map((row) => ({ ...row, logins: null, loginEnvironments: null })),
      totals: { ...totals, logins: null, loginEnvironments: null },
      loginAggregation: {
        ...loginAggregation,
        status:
          aggregate.status === "ambiguous" ? ("ambiguous" as const) : ("unavailable" as const),
      },
    };
  }
  const byClient = new Map<string | null, Environments>();
  for (const tenant of tenants) {
    const count = counts.get(tenant.tenantId)!;
    const current = byClient.get(tenant.clientId) ?? zeroes();
    current.local += count.local!;
    current.homologation += count.homologation!;
    current.production += count.production!;
    byClient.set(tenant.clientId, current);
  }
  const totalEnvironments = zeroes();
  const unifiedRows = rows.map((row) => {
    const environment = byClient.get(row.clientId) ?? zeroes();
    totalEnvironments.local += environment.local;
    totalEnvironments.homologation += environment.homologation;
    totalEnvironments.production += environment.production;
    return {
      ...row,
      logins: environment.local + environment.homologation + environment.production,
      loginEnvironments: environment,
    };
  });
  return {
    rows: unifiedRows,
    totals: {
      ...totals,
      logins:
        totalEnvironments.local + totalEnvironments.homologation + totalEnvironments.production,
      loginEnvironments: totalEnvironments,
    },
    loginAggregation,
  };
}
