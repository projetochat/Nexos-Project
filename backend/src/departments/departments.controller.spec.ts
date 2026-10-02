import { describe, expect, it, vi } from "vitest";
import { DepartmentsController } from "./departments.controller";

describe("DepartmentsController", () => {
  it("does not expose archived or incompatible instance links in department editing", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new DepartmentsController(
      { department: { findMany } } as never,
      {} as never,
    );

    await controller.list({ tenantId: "tenant-a" } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          connections: {
            where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
            select: { connectionId: true },
          },
        }),
      }),
    );
  });

  it("persists an icon change while removing an instance link", async () => {
    const timestamp = new Date("2026-10-02T12:00:00.000Z");
    const existing = {
      id: "department-a",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "cart",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      connections: [{ connectionId: "connection-a" }, { connectionId: "connection-b" }],
    };
    const updated = {
      ...existing,
      icon: "truck",
      connections: [{ connectionId: "connection-a" }],
    };
    const tx = {
      messagingConnection: { count: vi.fn().mockResolvedValue(1) },
      departmentConnection: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      department: { update: vi.fn().mockResolvedValue(updated) },
    };
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const controller = new DepartmentsController(prisma as never, {} as never);

    await expect(
      controller.update("department-a", { icon: "truck", connectionIds: ["connection-a"] }, {
        tenantId: "tenant-a",
      } as never),
    ).resolves.toMatchObject({ icon: "truck", connectionIds: ["connection-a"] });

    expect(tx.messagingConnection.count).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        providerType: "EVOLUTION",
        archivedAt: null,
        id: { in: ["connection-a"] },
      },
    });
    expect(tx.departmentConnection.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", departmentId: "department-a" },
    });
    expect(tx.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "department-a" },
        data: expect.objectContaining({
          icon: "truck",
          connections: { create: [{ connectionId: "connection-a" }] },
        }),
      }),
    );
  });

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
      include: {
        connections: {
          where: { connection: { providerType: "EVOLUTION", archivedAt: null } },
          select: { connectionId: true },
        },
      },
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
