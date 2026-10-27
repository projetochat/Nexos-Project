import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CrmController } from "./crm.controller";

function controllerWith(prisma: Record<string, unknown>) {
  return new CrmController(
    prisma as never,
    { publishContactUpdated: () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("unified customer department for contacts", () => {
  it("filters the contact list by customerDepartmentId", async () => {
    const controller = controllerWith({});
    const where = await controller["buildContactListWhere"](
      { customerDepartmentId: "customer-department-a" },
      "tenant-a",
    );

    expect(where).toMatchObject({
      tenantId: "tenant-a",
      customerDepartmentId: "customer-department-a",
    });
    expect(where).not.toHaveProperty("contactDepartmentId");
  });

  it("backfills only one existing match and keeps the legacy catalog", () => {
    const migration = readFileSync(
      new URL(
        "../../prisma/migrations/20261022220000_unify_contact_customer_departments/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain('c."customerDepartmentId" IS NULL');
    expect(migration).toContain("HAVING COUNT(cd.id) = 1");
    expect(migration).toContain('cd."customerId" = c."customerId"');
    expect(migration).toContain('"contacts_customer_department_owner_fkey"');
    expect(migration).toContain('SET "customerDepartmentId" = NULL');
    expect(migration.indexOf('SET "customerDepartmentId" = NULL')).toBeLessThan(
      migration.indexOf("WITH candidates AS"),
    );
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM contact_departments/i);
  });

  it("keeps the legacy department query contract separate during transition", async () => {
    const controller = controllerWith({});
    const where = await controller["buildContactListWhere"](
      { department: "legacy-department-a" },
      "tenant-a",
    );

    expect(where).toMatchObject({ contactDepartmentId: "legacy-department-a" });
    expect(where).not.toHaveProperty("customerDepartmentId");
  });

  it("rejects new writes to the legacy department fields", async () => {
    const controller = controllerWith({});

    await expect(
      controller["resolveContactLinks"]({ contactDepartmentId: "legacy-department-a" }, "tenant-a"),
    ).rejects.toThrow("use um departamento cadastrado para esse cliente");
  });
});
