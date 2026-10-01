import { describe, expect, it, vi } from "vitest";
import { DepartmentsController } from "./departments.controller";

describe("DepartmentsController", () => {
  it("creates departments without applying the removed plan limit", async () => {
    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    const department = {
      id: "department-a",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      active: true,
      createdAt,
      updatedAt: createdAt,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "tenant-a" }]),
      department: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(department),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const entitlements = {
      assertTenantOperational: vi.fn().mockResolvedValue(undefined),
      assertWithinLimit: vi.fn(),
    };
    const controller = new DepartmentsController(prisma as never, entitlements as never);

    await expect(
      controller.create({ name: " Comercial " }, { tenantId: "tenant-a" } as never),
    ).resolves.toMatchObject({ id: "department-a", name: "Comercial" });

    expect(entitlements.assertTenantOperational).toHaveBeenCalledWith("tenant-a");
    expect(entitlements.assertWithinLimit).not.toHaveBeenCalled();
    expect(tx.department.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        name: "Comercial",
        description: null,
        color: "#3B82F6",
        active: true,
      },
    });
  });
});
