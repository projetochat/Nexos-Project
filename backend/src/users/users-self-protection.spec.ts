import { describe, expect, it, vi } from "vitest";
import { UsersController } from "./users.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "custom",
  platformRole: "USER",
  permissions: ["users.read", "users.manage", "users.delete"],
};

function setup() {
  const membership = {
    id: "membership-a",
    tenantId: "tenant-a",
    userId: "user-a",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    presentationName: null,
    user: {
      id: "user-a",
      email: "user@example.com",
      name: "Usuário",
      passwordHash: "hash",
      avatarUrl: null,
      keepSidebarCollapsed: false,
      status: "ACTIVE",
      platformRole: "USER",
    },
    role: { id: "role-a", key: "custom", name: "Custom" },
    departments: [],
  };
  const update = vi.fn();
  const prisma = {
    tenantMembership: { findFirst: vi.fn().mockResolvedValue(membership), update },
  };
  return { controller: new UsersController(prisma as never, {} as never), update };
}

describe("UsersController self protection", () => {
  it.each([{ membershipStatus: "DISABLED" }, { status: "DISABLED" }, { roleId: "role-b" }])(
    "rejects a self-locking administrative update: %o",
    async (dto) => {
      const { controller } = setup();
      await expect(
        controller.update("membership-a", dto as never, current as never),
      ).rejects.toThrow("Você não pode bloquear seu próprio usuário");
    },
  );

  it("rejects the dedicated self-deactivation endpoint", async () => {
    const { controller, update } = setup();
    await expect(controller.deactivate("membership-a", current as never)).rejects.toThrow(
      "Você não pode bloquear seu próprio usuário",
    );
    expect(update).not.toHaveBeenCalled();
  });
});
