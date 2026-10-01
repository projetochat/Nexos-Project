import { describe, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";

describe("AuthService session hydration", () => {
  it("fails closed for a new identity when the bounded login-attempt registry is saturated", async () => {
    const prisma = { user: { findUnique: vi.fn() } };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    const attempts = (
      service as unknown as {
        failedLoginAttempts: Map<string, { count: number; resetAt: number }>;
      }
    ).failedLoginAttempts;
    for (let index = 0; index < 10_000; index += 1) {
      attempts.set(`spray-${index}@example.test`, { count: 1, resetAt: Date.now() + 60_000 });
    }

    await expect(
      service.login({ email: "target-not-seen@example.test", password: "invalid-password" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("purges expired identities before applying the saturation fail-closed rule", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    const attempts = (
      service as unknown as {
        failedLoginAttempts: Map<string, { count: number; resetAt: number }>;
      }
    ).failedLoginAttempts;
    for (let index = 0; index < 10_000; index += 1) {
      attempts.set(`expired-${index}@example.test`, { count: 1, resetAt: Date.now() - 1 });
    }

    await expect(
      service.login({ email: "new@example.test", password: "invalid-password" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(attempts.size).toBe(1);
  });

  it("rejects a refresh token whose tenant and user claims do not match its membership", async () => {
    const prisma = {
      authSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-a" }),
      },
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: "user-a",
        tenantId: "tenant-a",
        membershipId: "membership-from-another-scope",
        roleId: "role-a",
        roleKey: "agent",
        platformRole: "USER",
        typ: "refresh",
        sid: "session-a",
      }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    await expect(service.refresh("signed-but-inconsistent-token")).rejects.toThrow(
      "Sessão expirada",
    );
    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "membership-from-another-scope",
          tenantId: "tenant-a",
          userId: "user-a",
        },
      }),
    );
  });

  it("restores an active owner session without requiring a tenant membership", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "owner-1",
          email: "platform@trixus.app",
          name: "Platform Admin",
          avatarUrl: null,
          keepSidebarCollapsed: false,
          status: "ACTIVE",
          platformRole: "ADMIN",
        }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(service.me(owner())).resolves.toMatchObject({
      user: {
        id: "owner-1",
        email: "platform@trixus.app",
        roleKey: "platform_admin",
        roleName: "Dono",
        platformRole: "ADMIN",
      },
      tenant: { id: "platform", slug: "platform" },
      membership: { id: "", role: "platform_admin" },
    });
  });

  it("keeps tenant hydration restricted to an active matching membership", async () => {
    const prisma = {
      tenantMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.me({
        ...owner(),
        tenantId: "tenant-1",
        membershipId: "membership-1",
        roleId: "role-1",
        roleKey: "tenant_admin",
        platformRole: "USER",
      }),
    ).rejects.toThrow("Membership inativa ou inválida.");
  });

  it("returns only a short password setup token on the first temporary-password login", async () => {
    const user = {
      id: "admin-1",
      email: "admin@tenant.test",
      name: "Admin",
      passwordHash: await hash("Trixus@2026", 4),
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [
        {
          id: "membership-1",
          tenantId: "tenant-1",
          roleId: "role-1",
          status: "ACTIVE",
          presentationName: "Admin",
          user: { name: "Admin" },
          tenant: { id: "tenant-1", slug: "tenant", name: "Tenant", status: "ACTIVE" },
          role: { key: "tenant_admin", permissions: [] },
        },
      ],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      userInvitation: { findFirst: vi.fn().mockResolvedValue({ id: "marker-1" }) },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("setup-token") };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const result = await service.login({ email: user.email, password: "Trixus@2026" });

    expect(result).toMatchObject({
      passwordChangeRequired: true,
      passwordSetupToken: "setup-token",
      user: { email: user.email },
      tenant: { id: "tenant-1" },
    });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
    expect(jwt.signAsync).toHaveBeenCalledOnce();
  });

  it("returns only a Tenant selection token when the user has multiple eligible memberships", async () => {
    const membership = (id: string, tenantId: string, slug: string) => ({
      id,
      tenantId,
      roleId: `role-${tenantId}`,
      status: "ACTIVE",
      presentationName: "Admin",
      user: { name: "Admin" },
      tenant: { id: tenantId, slug, name: `Tenant ${slug}`, status: "ACTIVE" },
      role: { key: "tenant_admin", permissions: [] },
    });
    const user = {
      id: "admin-1",
      email: "admin@tenant.test",
      name: "Admin",
      passwordHash: await hash("SenhaDefinitiva@2026", 4),
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [
        membership("membership-a", "tenant-a", "alpha"),
        membership("membership-b", "tenant-b", "beta"),
      ],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("selection-token") };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const result = await service.login({ email: user.email, password: "SenhaDefinitiva@2026" });

    expect(result).toMatchObject({
      tenantSelectionRequired: true,
      tenantSelectionToken: "selection-token",
      tenants: [{ id: "tenant-a" }, { id: "tenant-b" }],
    });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
  });

  it("changes the initial password once and only then creates a normal session", async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "membership-1",
          tenantId: "tenant-1",
          userId: "admin-1",
          roleId: "role-1",
          status: "ACTIVE",
          user: {
            id: "admin-1",
            email: "admin@tenant.test",
            status: "ACTIVE",
            platformRole: "USER",
            passwordHash: await hash("Trixus@2026", 4),
          },
          tenant: { id: "tenant-1", slug: "tenant", status: "ACTIVE" },
          role: { id: "role-1", key: "tenant_admin" },
        }),
      },
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({ id: "marker-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: userUpdate },
      passwordResetToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tenant: { update: vi.fn().mockResolvedValue({}) },
      platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: "admin-1",
        tenantId: "tenant-1",
        membershipId: "membership-1",
        roleId: "role-1",
        roleKey: "tenant_admin",
        platformRole: "USER",
        typ: "password_setup",
      }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);
    vi.spyOn(service, "login").mockResolvedValue({ accessToken: "normal-access" } as never);

    await expect(
      service.completeRequiredPasswordChange({
        setupToken: "setup-token",
        newPassword: "NovaSenha@2026",
        confirmPassword: "NovaSenha@2026",
      }),
    ).resolves.toEqual({ accessToken: "normal-access" });

    const nextHash = userUpdate.mock.calls[0]?.[0].data.passwordHash;
    await expect(compare("NovaSenha@2026", nextHash)).resolves.toBe(true);
    expect(tx.userInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "admin-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(service.login).toHaveBeenCalledWith({
      email: "admin@tenant.test",
      password: "NovaSenha@2026",
      tenantSlug: "tenant",
    });
  });

  it("links an existing account without replacing its global credentials or name", async () => {
    const passwordHash = await hash("SenhaExistente@2026", 4);
    const existingUser = {
      id: "shared-user",
      email: "shared@example.test",
      name: "Nome Global",
      passwordHash,
      status: "ACTIVE",
    };
    const userUpdate = vi.fn();
    const membershipUpsert = vi.fn().mockResolvedValue({ id: "membership-b" });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(existingUser),
        create: vi.fn(),
        update: userUpdate,
      },
      tenantMembership: { upsert: membershipUpsert },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      userInvitation: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-b",
          tokenHash: "hash",
          email: existingUser.email,
          tenantId: "tenant-b",
          roleId: "role-b",
          departmentIds: [],
          tenant: { slug: "beta" },
          role: { id: "role-b" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    vi.spyOn(service, "login").mockResolvedValue({ accessToken: "access" } as never);

    await expect(
      service.acceptInvitation({
        token: "invite-token",
        password: "SenhaExistente@2026",
        name: "Nome apenas no tenant B",
      }),
    ).resolves.toEqual({ accessToken: "access" });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(membershipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ presentationName: "Nome apenas no tenant B" }),
      }),
    );
  });

  it("refuses to treat an invitation as permission to replace an existing password", async () => {
    const existingHash = await hash("SenhaExistente@2026", 4);
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "shared-user",
          email: "shared@example.test",
          name: "Global",
          passwordHash: existingHash,
          status: "ACTIVE",
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
      tenantMembership: { upsert: vi.fn() },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      userInvitation: { update: vi.fn() },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-b",
          email: "shared@example.test",
          tenantId: "tenant-b",
          roleId: "role-b",
          departmentIds: [],
          tenant: { slug: "beta" },
          role: { id: "role-b" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.acceptInvitation({ token: "invite-token", password: "NovaSenhaQueNaoDeveEntrar" }),
    ).rejects.toThrow("senha atual");
    expect(tx.tenantMembership.upsert).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects passwords above bcrypt's 72-byte boundary before accepting an invitation", async () => {
    const prisma = { userInvitation: { findFirst: vi.fn() } };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.acceptInvitation({ token: "invite-token", password: "á".repeat(37) }),
    ).rejects.toMatchObject({ response: { code: "PASSWORD_TOO_LONG" } });
    expect(prisma.userInvitation.findFirst).not.toHaveBeenCalled();
  });

  it("revokes all active sessions atomically with a password reset", async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    const tokenUpdate = vi.fn().mockResolvedValue({});
    const sessionUpdate = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      passwordResetToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: "reset-a",
          userId: "user-a",
          user: { status: "ACTIVE", email: "user@example.test" },
        }),
        update: tokenUpdate,
      },
      userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { update: userUpdate },
      authSession: { updateMany: sessionUpdate },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(service.resetPassword("reset-token", "NovaSenha@2026")).resolves.toEqual({
      ok: true,
    });

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { userId: "user-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

function owner(): AuthenticatedUser {
  return {
    userId: "owner-1",
    tenantId: "",
    membershipId: "",
    roleId: "",
    roleKey: "platform_admin",
    platformRole: "ADMIN",
    iatMs: Date.now(),
  };
}
