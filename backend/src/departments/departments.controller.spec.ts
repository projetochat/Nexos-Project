import { describe, expect, it, vi } from "vitest";
import { DepartmentsController } from "./departments.controller";

describe("DepartmentsController", () => {
  it("lists only profile departments through the Chat catalog", async () => {
    const prisma = { department: { findMany: vi.fn().mockResolvedValue([]) } };
    const controller = new DepartmentsController(prisma as never, {} as never);

    await controller.listChatScope({
      tenantId: "tenant-a",
      roleKey: "agent",
      chatDepartmentIds: ["department-a"],
    } as never);

    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        active: true,
        id: { in: ["department-a"] },
      },
      orderBy: { name: "asc" },
      include: { connections: { select: { connectionId: true } } },
    });
  });

  it("creates departments without applying the removed plan limit", async () => {
    const createdAt = new Date("2026-10-01T12:00:00.000Z");
    const department = {
      id: "department-a",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "department",
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
      messagingConnection: { count: vi.fn().mockResolvedValue(0) },
      departmentConnection: { deleteMany: vi.fn() },
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
      controller.create({ name: " Comercial ", connectionIds: [] }, {
        tenantId: "tenant-a",
      } as never),
    ).resolves.toMatchObject({ id: "department-a", name: "Comercial" });

    expect(entitlements.assertTenantOperational).toHaveBeenCalledWith("tenant-a");
    expect(entitlements.assertWithinLimit).not.toHaveBeenCalled();
    expect(tx.department.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        name: "Comercial",
        description: null,
        color: "#3B82F6",
        icon: "department",
        active: true,
        connections: { create: [] },
      },
      include: { connections: { select: { connectionId: true } } },
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
      icon: "department",
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
      messagingConnection: { count: vi.fn().mockResolvedValue(0) },
      departmentConnection: { deleteMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const entitlements = { assertTenantOperational: vi.fn().mockResolvedValue(undefined) };
    const controller = new DepartmentsController(prisma as never, entitlements as never);

    await expect(
      controller.create(
        {
          name: "Financeiro",
          description: "Restaurado",
          color: "#10B981",
          connectionIds: [],
        },
        { tenantId: "tenant-a" } as never,
      ),
    ).resolves.toMatchObject({ id: "department-inactive", active: true });

    expect(tx.department.create).not.toHaveBeenCalled();
    expect(tx.department.update).toHaveBeenCalledWith({
      where: { id: "department-inactive" },
      data: {
        name: "Financeiro",
        description: "Restaurado",
        color: "#10B981",
        icon: "department",
        active: true,
        connections: { create: [] },
      },
      include: { connections: { select: { connectionId: true } } },
    });
  });
});
