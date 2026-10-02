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
};

describe("RolesController permission delegation", () => {
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
      ],
    };
    const createMany = vi.fn();
    const tx = {
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
    const controller = new RolesController(prisma as never, realtime as never);

    const updated = await controller.update(
      "role-a",
      {
        permissionIds: [
          "conversations.read",
          "chat.audio.send",
          "chat.contacts.create",
          "chat.contacts.edit",
          "chat.tickets.create",
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
