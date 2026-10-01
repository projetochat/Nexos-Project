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
        update: vi.fn(),
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

  it("restores a hidden inactive department instead of reporting a false duplicate", async () => {
    const timestamp = new Date("2026-10-01T12:00:00.000Z");
    const restored = {
      id: "department-inactive",
      tenantId: "tenant-a",
      name: "Financeiro",
      description: "Restaurado",
      color: "#10B981",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "tenant-a" }]),
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "department-inactive", name: "FINANCEIRO", active: false }]),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(restored),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const entitlements = { assertTenantOperational: vi.fn().mockResolvedValue(undefined) };
    const controller = new DepartmentsController(prisma as never, entitlements as never);

    await expect(
      controller.create({ name: "Financeiro", description: "Restaurado", color: "#10B981" }, {
        tenantId: "tenant-a",
      } as never),
    ).resolves.toMatchObject({ id: "department-inactive", active: true });

    expect(tx.department.create).not.toHaveBeenCalled();
    expect(tx.department.update).toHaveBeenCalledWith({
      where: { id: "department-inactive" },
      data: {
        name: "Financeiro",
        description: "Restaurado",
        color: "#10B981",
        active: true,
      },
    });
  });
});
