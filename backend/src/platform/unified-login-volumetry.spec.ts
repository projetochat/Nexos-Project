import { describe, expect, it } from "vitest";
import { consolidateUnifiedLogins, type UnifiedLoginCounts } from "./unified-login-volumetry";
const rows = [
  { clientId: "client-a", logins: 99, contacts: 10 },
  { clientId: "client-b", logins: 10, contacts: 5 },
];
const totals = { logins: 109, contacts: 15 };
const counts: UnifiedLoginCounts = {
  status: "available",
  countsByTenant: [
    { tenantId: "tenant-a", local: 2, homologation: 3, production: 5, total: 10 },
    { tenantId: "tenant-b", local: 1, homologation: 0, production: 2, total: 3 },
  ],
};
describe("unified logins in client volumetry", () => {
  it("replaces local counts without counting the same local sessions twice", () => {
    const result = consolidateUnifiedLogins(
      rows,
      totals,
      [
        { tenantId: "tenant-a", clientId: "client-a" },
        { tenantId: "tenant-b", clientId: "client-a" },
      ],
      counts,
    );
    expect(result.rows[0]).toMatchObject({
      logins: 13,
      contacts: 10,
      loginEnvironments: { local: 3, homologation: 3, production: 7 },
    });
    expect(result.rows[1]).toMatchObject({ logins: 0, contacts: 5 });
    expect(result.totals).toMatchObject({ logins: 13, contacts: 15 });
  });
  it("respects selected tenants even when central response contains more tenants", () => {
    const result = consolidateUnifiedLogins(
      rows,
      totals,
      [{ tenantId: "tenant-a", clientId: "client-a" }],
      counts,
    );
    expect(result.totals.logins).toBe(10);
  });
  it.each(["unavailable", "ambiguous"] as const)(
    "shows missing counts as unknown for %s",
    (status) => {
      const result = consolidateUnifiedLogins(
        rows,
        totals,
        [{ tenantId: "tenant-a", clientId: "client-a" }],
        { ...counts, status },
      );
      expect(result.rows[0].logins).toBeNull();
      expect(result.totals.logins).toBeNull();
      expect(result.rows[0].contacts).toBe(10);
    },
  );
  it("fails closed for a missing tenant, invalid counts or inconsistent totals", () => {
    for (const invalid of [
      [],
      [{ ...counts.countsByTenant[0], total: 999 }],
      [{ ...counts.countsByTenant[0], local: -1 }],
    ]) {
      expect(
        consolidateUnifiedLogins(rows, totals, [{ tenantId: "tenant-a", clientId: "client-a" }], {
          status: "available",
          countsByTenant: invalid,
        }).totals.logins,
      ).toBeNull();
    }
  });
  it("preserves local behavior only when federation is explicitly disabled", () => {
    const result = consolidateUnifiedLogins(rows, totals, [], {
      status: "disabled",
      countsByTenant: [],
    });
    expect(result.rows).toBe(rows);
    expect(result.totals).toBe(totals);
  });
});

it("rejects duplicate tenant counts instead of silently choosing a value", () => {
  expect(
    consolidateUnifiedLogins(rows, totals, [{ tenantId: "tenant-a", clientId: "client-a" }], {
      ...counts,
      countsByTenant: [counts.countsByTenant[0], counts.countsByTenant[0]],
    }).totals.logins,
  ).toBeNull();
});
