import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { UsersController } from "./users.controller";

const current = {
  userId: "user-admin",
  membershipId: "membership-admin",
  tenantId: "tenant-a",
  roleKey: "tenant_admin",
  platformRole: "USER",
  permissions: ["users.create"],
};

function fixture(orphanDeleted: 0 | 1) {
  const existingUser = {
    id: "orphan-user",
    email: "reutilizar@trixus.test",
    name: "Conta antiga",
    passwordHash: "old-hash",
    status: "ACTIVE",
    platformRole: "USER",
  };
  const createdUser = {
    ...existingUser,
    id: "new-user",
    name: "Novo Atendente",
    passwordHash: "new-hash",
  };
  const savedMembership = {
    id: "membership-new",
    tenantId: "tenant-a",
    userId: createdUser.id,
    roleId: "role-agent",
    presentationName: "Novo Atendente",
    status: "ACTIVE",
    createdAt: new Date("2026-10-21T00:00:00.000Z"),
    updatedAt: new Date("2026-10-21T00:00:00.000Z"),
    user: createdUser,
    role: { id: "role-agent", key: "agent", name: "Atendente" },
    departments: [],
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      deleteMany: vi.fn().mockResolvedValue({ count: orphanDeleted }),
      create: vi.fn().mockResolvedValue(createdUser),
    },
    tenantMembership: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(savedMembership),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "membership-new" }),
    },
    departmentMembership: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    role: {
      findFirst: vi.fn().mockResolvedValue({
        id: "role-agent",
        tenantId: "tenant-a",
        key: "agent",
        name: "Atendente",
        active: true,
        permissions: [],
      }),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const entitlements = {
    assertTenantOperational: vi.fn().mockResolvedValue(undefined),
    assertWithinLimit: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new UsersController(prisma as never, entitlements as never), tx };
}

describe("attendant orphan account recovery", () => {
  it("removes a legacy orphan account and allows the e-mail to be registered again", async () => {
    const { controller, tx } = fixture(1);

    await expect(
      controller.create(
        {
          email: "reutilizar@trixus.test",
          name: "Novo Atendente",
          password: "dummy-value",
          roleId: "role-agent",
        },
        current as never,
      ),
    ).resolves.toMatchObject({
      user: { email: "reutilizar@trixus.test", name: "Novo Atendente" },
    });

    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "orphan-user",
        platformRole: "USER",
        memberships: { none: {} },
      },
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "reutilizar@trixus.test", name: "Novo Atendente" }),
      }),
    );
  });

  it("keeps D-004 and rejects an account that is not an orphan", async () => {
    const { controller, tx } = fixture(0);

    await expect(
      controller.create(
        {
          email: "reutilizar@trixus.test",
          name: "Novo Atendente",
          password: "dummy-value",
          roleId: "role-agent",
        },
        current as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
