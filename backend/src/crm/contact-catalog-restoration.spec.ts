import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CrmController } from "./crm.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "agent",
  platformRole: "USER",
} satisfies AuthenticatedUser;

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "catalog-a",
    tenantId: "tenant-a",
    name: "Financeiro",
    normalizedName: "financeiro",
    description: null,
    color: "#3B82F6",
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function controllerWith(prisma: Record<string, unknown>) {
  return new CrmController(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

describe("contact catalog restoration", () => {
  it.each([
    ["department", "contactDepartment", "createContactDepartment"],
    ["profile", "contactProfile", "createContactProfile"],
  ] as const)(
    "restores an archived %s in the same tenant without creating a new id",
    async (_, model, method) => {
      const archived = catalogItem({ archivedAt: new Date("2026-09-01T00:00:00.000Z") });
      const restored = catalogItem({ description: "Novo", color: "#112233" });
      const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(archived);
      const update = vi.fn().mockResolvedValue(restored);
      const create = vi.fn();
      const controller = controllerWith({ [model]: { findFirst, update, create } });

      const result = await controller[method](
        { name: "  Financeiro  ", description: "Novo", color: "#112233" },
        current,
      );

      expect(findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            tenantId: "tenant-a",
            normalizedName: "financeiro",
            archivedAt: { not: null },
          },
        }),
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: "catalog-a" },
        data: {
          name: "Financeiro",
          normalizedName: "financeiro",
          description: "Novo",
          color: "#112233",
          archivedAt: null,
        },
      });
      expect(create).not.toHaveBeenCalled();
      expect(result.id).toBe("catalog-a");
    },
  );

  it.each([
    ["contactDepartment", "createContactDepartment"],
    ["contactProfile", "createContactProfile"],
  ] as const)("scopes archived %s lookup to the current tenant", async (model, method) => {
    const created = catalogItem();
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue(created);
    const controller = controllerWith({ [model]: { findFirst, create } });

    await controller[method]({ name: "Financeiro" }, current);

    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        tenantId: "tenant-a",
        normalizedName: "financeiro",
        archivedAt: { not: null },
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant-a", normalizedName: "financeiro" }),
    });
  });

  it.each([
    [
      "department",
      "contactDepartment",
      "createContactDepartment",
      "CONTACT_DEPARTMENT_ALREADY_EXISTS",
    ],
    ["profile", "contactProfile", "createContactProfile", "CONTACT_PROFILE_ALREADY_EXISTS"],
  ] as const)("keeps the specific conflict for an active %s", async (_, model, method, code) => {
    const findFirst = vi.fn().mockResolvedValue({ id: "active-a" });
    const controller = controllerWith({ [model]: { findFirst } });

    await expect(controller[method]({ name: "Financeiro" }, current)).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
  });

  it.each([
    ["contactDepartment", "createContactDepartment", "CONTACT_DEPARTMENT_ALREADY_EXISTS"],
    ["contactProfile", "createContactProfile", "CONTACT_PROFILE_ALREADY_EXISTS"],
  ] as const)("maps a %s unique race to the specific conflict", async (model, method, code) => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const controller = controllerWith({ [model]: { findFirst, create } });

    await expect(controller[method]({ name: "Financeiro" }, current)).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
  });
});
