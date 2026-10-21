import { describe, expect, it, vi } from "vitest";
import { validate } from "class-validator";
import { DepartmentsController } from "./departments.controller";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { CreateDepartmentDto } from "./dto/create-department.dto";

describe("DepartmentsController", () => {
  it("returns department connection options using the public lowercase contract", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "connection-a",
        name: "WhatsApp HML",
        status: "CONNECTED",
        serviceEnabled: false,
        color: "#22c55e",
        logoUrl: null,
      },
    ]);
    const controller = new DepartmentsController(
      { messagingConnection: { findMany } } as never,
      {} as never,
    );

    await expect(controller.connectionOptions({ tenantId: "tenant-a" } as never)).resolves.toEqual([
      expect.objectContaining({
        id: "connection-a",
        status: "connected",
        serviceEnabled: false,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          providerType: "EVOLUTION",
          archivedAt: null,
        },
      }),
    );
  });

  it("lists inactive departments only when administration explicitly requests all", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new DepartmentsController(
      { department: { findMany } } as never,
      {} as never,
    );

    await controller.list({ tenantId: "tenant-a" } as never, { status: "all" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ active: expect.anything() }),
      }),
    );
  });

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

  it("filters departments through the selected active Evolution instance", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new DepartmentsController(
      { department: { findMany } } as never,
      {} as never,
    );

    await controller.list({ tenantId: "tenant-a" } as never, { connectionId: "connection-a" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          connections: {
            some: {
              tenantId: "tenant-a",
              connectionId: "connection-a",
              connection: { providerType: "EVOLUTION", archivedAt: null },
            },
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

  it("allows removing every instance link from a department", async () => {
    const timestamp = new Date("2026-10-08T12:00:00.000Z");
    const existing = {
      id: "department-a",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "department",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      connections: [{ connectionId: "connection-a" }],
    };
    const updated = { ...existing, connections: [] };
    const tx = {
      messagingConnection: { count: vi.fn().mockResolvedValue(0) },
      departmentConnection: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      department: { update: vi.fn().mockResolvedValue(updated) },
    };
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const controller = new DepartmentsController(prisma as never, {} as never);

    await expect(
      controller.update("department-a", { connectionIds: [] }, {
        tenantId: "tenant-a",
      } as never),
    ).resolves.toMatchObject({ connectionIds: [] });

    expect(tx.messagingConnection.count).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        providerType: "EVOLUTION",
        archivedAt: null,
        id: { in: [] },
      },
    });
    expect(tx.departmentConnection.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", departmentId: "department-a" },
    });
  });

  it("updates a department whose optional description is null", async () => {
    const timestamp = new Date("2026-10-05T12:00:00.000Z");
    const existing = {
      id: "department-a",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "department",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      connections: [],
    };
    const tx = {
      department: { update: vi.fn().mockResolvedValue({ ...existing, color: "#10B981" }) },
    };
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const controller = new DepartmentsController(prisma as never, {} as never);

    await expect(
      controller.update("department-a", { description: null, color: "#10B981" }, {
        tenantId: "tenant-a",
      } as never),
    ).resolves.toMatchObject({ description: null, color: "#10B981" });

    expect(tx.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "department-a" },
        data: expect.objectContaining({ description: null, color: "#10B981" }),
      }),
    );
  });

  it("accepts the null description returned by departments without a note", async () => {
    const dto = new UpdateDepartmentDto();
    dto.description = null;
    dto.color = "#10B981";

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("validates inactivity timeout limits without requiring the setting when disabled", async () => {
    const disabled = new CreateDepartmentDto();
    disabled.name = "Suporte";
    disabled.connectionIds = [];
    disabled.inactivityClosureEnabled = false;
    const invalid = new UpdateDepartmentDto();
    invalid.inactivityTimeoutMinutes = 0;

    await expect(validate(disabled)).resolves.toEqual([]);
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: "inactivityTimeoutMinutes" }),
    ]);
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

  it("marks the administrator favorite while keeping every active tenant department visible", async () => {
    const timestamp = new Date("2026-10-20T12:00:00.000Z");
    const prisma = {
      department: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "department-a",
            tenantId: "tenant-a",
            name: "Atendimento",
            description: null,
            color: "#3B82F6",
            icon: "headset",
            active: true,
            inactivityClosureEnabled: false,
            inactivityTimeoutMinutes: null,
            inactivityClosureMessage: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            connections: [{ connectionId: "connection-a" }],
          },
          {
            id: "department-b",
            tenantId: "tenant-a",
            name: "Comercial",
            description: null,
            color: "#10B981",
            icon: "shopping-cart",
            active: true,
            inactivityClosureEnabled: false,
            inactivityTimeoutMinutes: null,
            inactivityClosureMessage: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            connections: [{ connectionId: "connection-b" }],
          },
        ]),
      },
    };
    const controller = new DepartmentsController(prisma as never, {} as never);

    const result = await controller.listChatScope({
      tenantId: "tenant-a",
      roleKey: "tenant_admin",
      connectionIds: null,
      chatDepartmentIds: null,
      chatScopes: [
        {
          connectionId: "connection-a",
          departmentIds: ["department-a"],
          favoriteDepartmentId: "department-a",
        },
      ],
    } as never);

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-a", active: true },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "department-a",
        connectionIds: ["connection-a"],
        favoriteConnectionIds: ["connection-a"],
      }),
      expect.objectContaining({
        id: "department-b",
        connectionIds: ["connection-b"],
        favoriteConnectionIds: [],
      }),
    ]);
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
        inactivityClosureEnabled: false,
        inactivityTimeoutMinutes: null,
        inactivityClosureMessage: null,
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
        inactivityClosureEnabled: false,
        inactivityTimeoutMinutes: null,
        inactivityClosureMessage: null,
        connections: { create: [] },
      },
      include: { connections: { select: { connectionId: true } } },
    });
  });

  it("blocks direct PATCH deactivation so open conversations cannot be bypassed", async () => {
    const prisma = { $transaction: vi.fn() };
    const controller = new DepartmentsController(prisma as never, {} as never);

    await expect(
      controller.update("department-a", { active: false }, { tenantId: "tenant-a" } as never),
    ).rejects.toThrow("Use o fluxo de inativação");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("migrates open conversations with history before atomically deactivating", async () => {
    const timestamp = new Date("2026-10-08T12:00:00.000Z");
    const source = {
      id: "department-source",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "department",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      connections: [{ connectionId: "connection-a" }],
    };
    const target = { id: "department-target", name: "Financeiro" };
    const conversation = {
      id: "conversation-a",
      connectionId: "connection-a",
      assignedMembershipId: "membership-a",
    };
    const migrated = {
      id: conversation.id,
      assignedMembershipId: conversation.assignedMembershipId,
      departmentId: target.id,
      updatedAt: timestamp,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: source.id }]),
      department: {
        findFirst: vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(target),
        update: vi.fn().mockResolvedValue({ ...source, active: false }),
      },
      conversation: {
        findMany: vi.fn().mockResolvedValue([conversation]),
        update: vi.fn().mockResolvedValue(migrated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(migrated),
      },
      tenantMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "membership-a",
            status: "ACTIVE",
            user: { status: "ACTIVE" },
            role: { key: "tenant_admin", metadata: {} },
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const messages = { createSystemMessage: vi.fn().mockResolvedValue(undefined) };
    const realtime = {
      publishAssignmentUpdated: vi.fn(),
      publishConversationUpdated: vi.fn(),
    };
    const controller = new DepartmentsController(
      prisma as never,
      {} as never,
      messages as never,
      realtime as never,
    );

    await expect(
      controller.deactivateWithMigration(
        source.id,
        { targets: [{ connectionId: "connection-a", departmentId: target.id }] },
        { tenantId: "tenant-a", membershipId: "actor-a", roleKey: "tenant_admin" } as never,
      ),
    ).resolves.toMatchObject({ id: source.id, active: false });

    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: conversation.id },
      data: { departmentId: target.id },
    });
    expect(messages.createSystemMessage).toHaveBeenCalledWith(
      tx,
      conversation.id,
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.stringContaining("Comercial para o departamento Financeiro"),
    );
    expect(tx.department.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(realtime.publishAssignmentUpdated).toHaveBeenCalledOnce();
    expect(realtime.publishConversationUpdated).toHaveBeenCalledOnce();
  });

  it("does not deactivate when writing migration history fails", async () => {
    const timestamp = new Date("2026-10-08T12:00:00.000Z");
    const source = {
      id: "department-source",
      tenantId: "tenant-a",
      name: "Comercial",
      description: null,
      color: "#3B82F6",
      icon: "department",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      connections: [{ connectionId: "connection-a" }],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce({ id: "department-target", name: "Financeiro" }),
        update: vi.fn(),
      },
      conversation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "conversation-a", connectionId: "connection-a", assignedMembershipId: null },
          ]),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn(),
      },
      tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const messages = {
      createSystemMessage: vi.fn().mockRejectedValue(new Error("history failed")),
    };
    const controller = new DepartmentsController(prisma as never, {} as never, messages as never);

    await expect(
      controller.deactivateWithMigration(
        source.id,
        {
          targets: [{ connectionId: "connection-a", departmentId: "department-target" }],
        },
        { tenantId: "tenant-a", membershipId: "actor-a", roleKey: "tenant_admin" } as never,
      ),
    ).rejects.toThrow("history failed");
    expect(tx.department.update).not.toHaveBeenCalled();
  });
});
