import { describe, expect, it, vi } from "vitest";
import { RolesController } from "./roles.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-editor",
  roleKey: "custom",
  platformRole: "USER",
  permissions: ["roles.create", "roles.update", "contacts.read"],
  connectionIds: ["connection-a"],
  chatDepartmentIds: ["department-a"],
};

describe("RolesController permission delegation", () => {
  it("rejects permissions from a tenant module that is disabled", async () => {
    const controller = new RolesController(
      {} as never,
      {} as never,
      {
        getEntitlements: vi.fn().mockResolvedValue({
          features: { chat: true, campaigns: true, tickets: false },
        }),
      } as never,
    );

    await expect(
      controller["assertEnabledModulePermissions"](["tickets.read", "tickets.create"], "tenant-a"),
    ).rejects.toThrow("O módulo Chamados está desabilitado para esta organização.");
  });

  it("treats a legacy assignment as authority over its canonical replacement", () => {
    const controller = new RolesController({} as never, {} as never);
    const assertCanGrantPermissions = (
      controller as unknown as {
        assertCanGrantPermissions: (
          permissionIds: string[],
          actor: unknown,
          existingPermissionIds?: string[],
        ) => void;
      }
    ).assertCanGrantPermissions.bind(controller);

    expect(() =>
      assertCanGrantPermissions(
        ["messages.send"],
        { ...current, assignedPermissionIds: ["chat.audio.send"] },
        [],
      ),
    ).not.toThrow();
  });

  it("returns canonical permissions for roles that still contain legacy chat aliases", async () => {
    const prisma = {
      role: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "role-a",
            tenantId: "tenant-a",
            key: "custom",
            name: "Custom",
            description: null,
            metadata: {},
            system: false,
            createdAt: new Date("2026-10-01T12:00:00.000Z"),
            updatedAt: new Date("2026-10-01T12:00:00.000Z"),
            permissions: [
              { permissionId: "conversations.read" },
              { permissionId: "chat.audio.send" },
              { permissionId: "messages.send" },
              { permissionId: "chat.tickets.create" },
            ],
          },
        ]),
      },
    };
    const controller = new RolesController(prisma as never, {} as never);

    const roles = await controller.list(current as never);

    expect(roles[0]?.permissionIds).toEqual([
      "conversations.read",
      "messages.send",
      "tickets.read",
      "tickets.create",
    ]);
  });

  it("accepts stale legacy aliases and stores only their canonical replacements", async () => {
    const role = {
      id: "role-a",
      tenantId: "tenant-a",
      key: "custom",
      name: "Custom",
      description: null,
      metadata: {},
      system: false,
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
      updatedAt: new Date("2026-10-01T12:00:00.000Z"),
      permissions: [
        { permissionId: "conversations.read" },
        { permissionId: "chat.audio.send" },
        { permissionId: "chat.contacts.create" },
        { permissionId: "chat.contacts.edit" },
        { permissionId: "chat.tickets.create" },
        { permissionId: "chat.contacts.read" },
        { permissionId: "chat.customer_link.edit" },
        { permissionId: "chat.contacts.block" },
        { permissionId: "conversations.manage" },
      ],
    };
    const createMany = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "tenant-a" }]),
      permission: { upsert: vi.fn() },
      rolePermission: { deleteMany: vi.fn(), createMany },
      role: {
        update: vi.fn().mockImplementation(() => ({
          ...role,
          permissions: createMany.mock.calls[0][0].data.map(
            ({ permissionId }: { permissionId: string }) => ({ permissionId }),
          ),
        })),
      },
    };
    const prisma = {
      role: { findFirst: vi.fn().mockResolvedValue(role) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const realtime = { publish: vi.fn() };
    const controller = new RolesController(
      prisma as never,
      realtime as never,
      {
        getEntitlements: vi.fn().mockResolvedValue({
          features: { chat: true, campaigns: true, tickets: true },
        }),
      } as never,
    );

    const updated = await controller.update(
      "role-a",
      {
        permissionIds: [
          "conversations.read",
          "chat.audio.send",
          "chat.contacts.create",
          "chat.contacts.edit",
          "chat.tickets.create",
          "chat.contacts.read",
          "chat.customer_link.edit",
          "chat.contacts.block",
          "conversations.manage",
        ],
      },
      { ...current, roleKey: "tenant_admin" } as never,
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { roleId: "role-a", permissionId: "conversations.read" },
        { roleId: "role-a", permissionId: "messages.send" },
        { roleId: "role-a", permissionId: "contacts.read" },
        { roleId: "role-a", permissionId: "contacts.create" },
        { roleId: "role-a", permissionId: "contacts.update" },
        { roleId: "role-a", permissionId: "tickets.read" },
        { roleId: "role-a", permissionId: "tickets.create" },
        { roleId: "role-a", permissionId: "conversations.assign" },
      ],
      skipDuplicates: true,
    });
    expect(updated.permissionIds).toEqual([
      "conversations.read",
      "messages.send",
      "contacts.read",
      "contacts.create",
      "contacts.update",
      "tickets.read",
      "tickets.create",
      "conversations.assign",
    ]);
  });

  it("uses the assigned permissions, not the temporarily expanded runtime catalog", async () => {
    const prisma = { messagingConnection: { count: vi.fn() } };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create({ name: "Superior", permissionIds: ["contacts.read", "contacts.delete"] }, {
        ...current,
        permissions: ["roles.create", "roles.update", "contacts.read", "contacts.delete"],
        assignedPermissionIds: ["roles.create", "roles.update", "contacts.read"],
      } as never),
    ).rejects.toThrow("Você não pode adicionar ou remover uma permissão que não possui.");
  });

  it("rejects creating a role with a permission the author does not own", async () => {
    const prisma = { messagingConnection: { count: vi.fn() } };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create(
        {
          name: "Superior",
          permissionIds: ["contacts.read", "contacts.delete"],
        },
        current as never,
      ),
    ).rejects.toThrow("Você não pode adicionar ou remover uma permissão que não possui.");
  });

  it("rejects expanding a role to an instance outside the author's scope", async () => {
    const prisma = {
      messagingConnection: { count: vi.fn().mockResolvedValue(1) },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create(
        {
          name: "Escopo ampliado",
          permissionIds: ["contacts.read"],
          metadata: { connectionIds: ["connection-b"] },
        },
        current as never,
      ),
    ).rejects.toThrow("Você não pode adicionar ou remover uma instância fora do seu escopo.");
  });

  it("rejects expanding a role to a Chat department outside the author's scope", async () => {
    const prisma = {
      messagingConnection: { count: vi.fn() },
      department: { count: vi.fn().mockResolvedValue(1) },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create(
        {
          name: "Escopo de departamento ampliado",
          permissionIds: ["contacts.read"],
          metadata: { departmentIds: ["department-b"] },
        },
        current as never,
      ),
    ).rejects.toThrow("Você não pode adicionar ou remover um departamento fora do seu escopo.");
  });

  it("lists only the Chat scopes the profile editor is allowed to delegate", async () => {
    const prisma = {
      messagingConnection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "connection-a",
            name: "WhatsApp A",
            status: "CONNECTED",
            departments: [
              {
                department: {
                  id: "department-a",
                  name: "Atendimento",
                  description: null,
                  color: "#3B82F6",
                  icon: "department",
                },
              },
            ],
          },
        ]),
      },
      department: {
        findMany: vi.fn().mockResolvedValue([{ id: "department-a", name: "Atendimento" }]),
      },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(controller.scopeOptions(current as never)).resolves.toEqual({
      connections: [
        {
          id: "connection-a",
          name: "WhatsApp A",
          status: "connected",
          departments: [
            {
              id: "department-a",
              name: "Atendimento",
              description: null,
              color: "#3B82F6",
              icon: "department",
            },
          ],
        },
      ],
      departments: [{ id: "department-a", name: "Atendimento" }],
    });
    expect(prisma.messagingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["connection-a"] },
          providerType: "EVOLUTION",
        }),
      }),
    );
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["department-a"] } }),
      }),
    );
  });

  it("rejects a favorite that is not among the allowed departments", async () => {
    const controller = new RolesController({} as never, {} as never);

    await expect(
      controller.create(
        {
          name: "Atendimento",
          permissionIds: ["contacts.read"],
          metadata: {
            chatScopes: [
              {
                connectionId: "connection-a",
                departmentIds: ["department-a"],
                favoriteDepartmentId: "department-b",
              },
            ],
          },
        },
        current as never,
      ),
    ).rejects.toThrow("O departamento favorito precisa estar liberado.");
  });

  it("rejects a department that is not linked to the selected instance", async () => {
    const prisma = {
      departmentConnection: { count: vi.fn().mockResolvedValue(0) },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create(
        {
          name: "Atendimento",
          permissionIds: ["contacts.read"],
          metadata: {
            chatScopes: [
              {
                connectionId: "connection-a",
                departmentIds: ["department-a"],
                favoriteDepartmentId: null,
              },
            ],
          },
        },
        current as never,
      ),
    ).rejects.toThrow("não está vinculado à instância selecionada");
  });

  it("rejects removing a permission the author does not own", async () => {
    const prisma = {
      role: {
        findFirst: vi.fn().mockResolvedValue({
          id: "role-a",
          tenantId: "tenant-a",
          key: "custom",
          name: "Custom",
          metadata: {},
          permissions: [{ permissionId: "contacts.delete" }],
        }),
      },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.update("role-a", { permissionIds: [] }, current as never),
    ).rejects.toThrow("Você não pode adicionar ou remover uma permissão que não possui.");
  });

  it("rejects removing an instance outside the author's scope", async () => {
    const prisma = {
      role: {
        findFirst: vi.fn().mockResolvedValue({
          id: "role-a",
          tenantId: "tenant-a",
          key: "custom",
          name: "Custom",
          metadata: { connectionIds: ["connection-b"] },
          permissions: [],
        }),
      },
      messagingConnection: { count: vi.fn().mockResolvedValue(0) },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.update("role-a", { metadata: { connectionIds: [] } }, current as never),
    ).rejects.toThrow("Você não pode adicionar ou remover uma instância fora do seu escopo.");
  });

  it("allows an edit to preserve a previously archived instance reference", async () => {
    const prisma = {
      messagingConnection: { count: vi.fn() },
    };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      (
        controller as unknown as {
          assertMetadataScope: (
            metadata: unknown,
            actor: unknown,
            existingMetadata?: unknown,
          ) => Promise<void>;
        }
      ).assertMetadataScope(
        { connectionIds: ["archived-connection"] },
        { ...current, roleKey: "tenant_admin" },
        { connectionIds: ["archived-connection"] },
      ),
    ).resolves.toBeUndefined();
    expect(prisma.messagingConnection.count).not.toHaveBeenCalled();
  });

  it("requires the read permission when an access profile enables a child action", async () => {
    const prisma = { messagingConnection: { count: vi.fn() } };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create({ name: "Sem leitura", permissionIds: ["users.create"] }, {
        ...current,
        roleKey: "tenant_admin",
      } as never),
    ).rejects.toThrow("A permissão users.read é obrigatória");
  });

  it("requires conversation visibility for the granular chat permissions", async () => {
    const prisma = { messagingConnection: { count: vi.fn() } };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create({ name: "Telefone sem conversa", permissionIds: ["chat.phone.read"] }, {
        ...current,
        roleKey: "tenant_admin",
      } as never),
    ).rejects.toThrow("A permissão conversations.read é obrigatória");
  });
});
