import { compare, hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PlatformService } from "./platform.service";

const current: AuthenticatedUser = {
  userId: "platform-user-current",
  tenantId: "",
  membershipId: "",
  roleId: "",
  roleKey: "",
  platformRole: "ADMIN",
  surface: "platform",
};

function fixture(passwordHash: string) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: current.userId, passwordHash }),
      update: vi.fn().mockResolvedValue({ id: current.userId }),
    },
    passwordResetToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    impersonationSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    platformAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new PlatformService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, tx };
}

describe("PlatformService changeOwnPassword", () => {
  const currentCredential = "SenhaAtual@2026";
  const invalidCredential = "SenhaIncorreta@2026";
  const mismatchedCredential = "OutraSenha@2026";
  const replacementCredential = "NovaSenha@2026";

  it("updates only the authenticated Platform user and revokes all related sessions", async () => {
    const { service, tx } = fixture(await hash(currentCredential, 4));

    await expect(
      service.changeOwnPassword(
        {
          currentPassword: currentCredential,
          newPassword: replacementCredential,
          confirmPassword: replacementCredential,
        },
        current,
      ),
    ).resolves.toEqual({ ok: true, sessionsRevoked: 3 });

    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: { id: current.userId, status: "ACTIVE", platformRole: { not: "USER" } },
      select: { id: true, passwordHash: true },
    });
    const updatedHash = tx.user.update.mock.calls[0]?.[0]?.data.passwordHash as string;
    await expect(compare(replacementCredential, updatedHash)).resolves.toBe(true);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: current.userId },
      data: { passwordHash: updatedHash },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: current.userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: { actorUserId: current.userId, status: "ACTIVE" },
      data: { status: "STOPPED", stoppedAt: expect.any(Date) },
    });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: current.userId,
        targetId: current.userId,
        action: "platform_user.password_changed",
      }),
    });
  });

  it("rejects an invalid current password before changing credentials or sessions", async () => {
    const { service, tx } = fixture(await hash(currentCredential, 4));

    await expect(
      service.changeOwnPassword(
        {
          currentPassword: invalidCredential,
          newPassword: replacementCredential,
          confirmPassword: replacementCredential,
        },
        current,
      ),
    ).rejects.toThrow("Senha atual inválida.");

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation without opening a transaction", async () => {
    const { service, tx } = fixture(await hash(currentCredential, 4));

    await expect(
      service.changeOwnPassword(
        {
          currentPassword: currentCredential,
          newPassword: replacementCredential,
          confirmPassword: mismatchedCredential,
        },
        current,
      ),
    ).rejects.toThrow("A confirmação da nova senha não confere.");

    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });
});
