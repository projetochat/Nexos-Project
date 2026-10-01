import { describe, expect, it, vi } from "vitest";
import { RolesController } from "./roles.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-editor",
  roleKey: "custom",
  platformRole: "USER",
  permissions: ["roles.manage", "contacts.read"],
  connectionIds: ["connection-a"],
};

describe("RolesController permission delegation", () => {
  it("uses the assigned permissions, not the temporarily expanded runtime catalog", async () => {
    const prisma = { messagingConnection: { count: vi.fn() } };
    const controller = new RolesController(prisma as never, {} as never);

    await expect(
      controller.create({ name: "Superior", permissionIds: ["contacts.read", "contacts.delete"] }, {
        ...current,
        permissions: ["roles.manage", "contacts.read", "contacts.delete"],
        assignedPermissionIds: ["roles.manage", "contacts.read"],
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
      controller.create({ name: "Sem leitura", permissionIds: ["users.manage"] }, {
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
