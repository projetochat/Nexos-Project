import "reflect-metadata";
import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { UsersController } from "./users.controller";

describe("administrator credential confirmation", () => {
  const currentUser: AuthenticatedUser = {
    userId: "user-1",
    tenantId: "tenant-1",
    membershipId: "membership-1",
    roleId: "role-1",
    roleKey: "tenant_admin",
    platformRole: "USER",
  };

  const membershipUpdate = vi.fn();
  const userUpdate = vi.fn();
  const findFirstOrThrow = vi.fn();
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({
      tenantMembership: { update: membershipUpdate },
      user: { update: userUpdate },
    }),
  );
  const controller = new UsersController(
    {
      tenantMembership: { findFirstOrThrow },
      $transaction: transaction,
    } as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty update before touching persistence", async () => {
    await expect(controller.updateAdministratorCredentials({}, currentUser)).rejects.toThrow(
      "Nenhuma alteração foi informada.",
    );
    expect(findFirstOrThrow).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires the current password for a presentation name update", async () => {
    await expect(
      controller.updateAdministratorCredentials({ presentationName: "Administrador" }, currentUser),
    ).rejects.toThrow("Informe a senha atual.");
    expect(findFirstOrThrow).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires the current password for an avatar update", async () => {
    await expect(
      controller.updateAdministratorCredentials({ avatarUrl: null }, currentUser),
    ).rejects.toThrow("Informe a senha atual.");
    expect(findFirstOrThrow).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not write when the current password is invalid", async () => {
    findFirstOrThrow.mockResolvedValue({
      id: "membership-1",
      userId: "user-1",
      presentationName: "Antes",
      role: { key: "tenant_admin" },
      user: { passwordHash: await hash("senha-correta", 4), avatarUrl: null },
    });

    await expect(
      controller.updateAdministratorCredentials(
        { presentationName: "Depois", currentPassword: "senha-incorreta" },
        currentUser,
      ),
    ).rejects.toThrow("Senha atual inválida.");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("updates the trimmed presentation name only after password confirmation", async () => {
    findFirstOrThrow.mockResolvedValue({
      id: "membership-1",
      userId: "user-1",
      presentationName: "Antes",
      role: { key: "tenant_admin" },
      user: { passwordHash: await hash("senha-correta", 4), avatarUrl: null },
    });

    await expect(
      controller.updateAdministratorCredentials(
        { presentationName: "  Depois  ", currentPassword: "senha-correta" },
        currentUser,
      ),
    ).resolves.toMatchObject({ ok: true, presentationName: "Depois" });
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { presentationName: "Depois" },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("updates the avatar only after password confirmation", async () => {
    findFirstOrThrow.mockResolvedValue({
      id: "membership-1",
      userId: "user-1",
      presentationName: "Administrador",
      role: { key: "tenant_admin" },
      user: {
        passwordHash: await hash("senha-correta", 4),
        avatarUrl: "data:image/png;base64,old",
      },
    });

    await expect(
      controller.updateAdministratorCredentials(
        { avatarUrl: null, currentPassword: "senha-correta" },
        currentUser,
      ),
    ).resolves.toMatchObject({ ok: true, avatarUrl: null });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { avatarUrl: null },
    });
    expect(membershipUpdate).not.toHaveBeenCalled();
  });
});
