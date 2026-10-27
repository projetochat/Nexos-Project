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
        surface: "tenant",
        aud: "trixus-tenant",
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
        surface: "tenant",
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
      customerPortalAccess: { findMany: vi.fn().mockResolvedValue([]) },
      userInvitation: { findFirst: vi.fn().mockResolvedValue({ id: "marker-1" }) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
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
      customerPortalAccess: { findMany: vi.fn().mockResolvedValue([]) },
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

  it("keeps internal and customer portal authentication isolated for the same identity", async () => {
    const passwordHash = await hash("SenhaCompartilhada@2026", 4);
    const membership = {
      id: "membership-a",
      tenantId: "tenant-a",
      userId: "user-a",
      roleId: "role-admin",
      status: "ACTIVE",
      presentationName: "Natã",
      user: { name: "Natã" },
      tenant: {
        id: "tenant-a",
        slug: "trixus",
        name: "Trixus",
        status: "ACTIVE",
        featureOverrides: null,
      },
      role: { key: "tenant_admin", permissions: [] },
    };
    const user = {
      id: "user-a",
      email: "nata@example.test",
      name: "Natã",
      passwordHash,
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [membership],
    };
    const portalAccess = {
      id: "access-dips",
      tenantId: "tenant-a",
      customerId: "customer-dips",
      contactId: "contact-nata",
      membershipId: "membership-a",
      userId: "user-a",
      login: user.email,
      accessProfile: "COLLABORATOR",
      branchId: "branch-a",
      departmentId: "department-a",
      active: true,
      tenant: membership.tenant,
      customer: { id: "customer-dips", name: "DIPS" },
      contact: { id: "contact-nata", name: "Natã" },
      branch: { id: "branch-a" },
      department: { id: "department-a" },
      membership,
      user,
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          user: { id: user.id, passwordHash },
          membership: { user: { id: user.id, passwordHash } },
        },
      ])
      .mockResolvedValueOnce([portalAccess]);
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      customerPortalAccess: { findMany },
      userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
      authSession: { create: vi.fn().mockResolvedValue({ id: "session-a" }) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: "role-portal",
          key: "customer_portal",
          active: true,
          permissions: [{ permissionId: "tickets.read" }],
        }),
      },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("selection-token") };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const internalResult = await service.loginTenant({
      email: user.email,
      password: "SenhaCompartilhada@2026",
    });
    const portalResult = await service.loginPortal({
      login: user.email,
      password: "SenhaCompartilhada@2026",
    });

    expect(internalResult).toMatchObject({ user: { roleKey: "tenant_admin" } });
    expect(portalResult).toMatchObject({ user: { roleKey: "customer_portal" } });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          login: user.email,
          AND: expect.arrayContaining([
            {
              OR: [{ userId: "user-a" }, { userId: null, membership: { userId: "user-a" } }],
            },
          ]),
        }),
      }),
    );
  });

  it("rejects a destination-selection token when no destination was provided", async () => {
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: "user-a",
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "tenant_selection",
        platformRole: "USER",
        surface: "tenant",
        aud: "trixus-tenant",
        typ: "tenant_selection",
      }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService({} as never, jwt as never, config as never);

    await expect(service.selectTenant("selection-token")).rejects.toMatchObject({
      response: { code: "DESTINATION_SELECTION_REQUIRED" },
    });
  });

  it("rejects selection tokens used on the opposite authentication channel", async () => {
    const jwt = {
      verifyAsync: vi
        .fn()
        .mockResolvedValueOnce({
          sub: "user-a",
          roleKey: "portal_selection",
          typ: "tenant_selection",
          surface: "tenant",
          aud: "trixus-tenant",
        })
        .mockResolvedValueOnce({
          sub: "user-a",
          roleKey: "tenant_selection",
          typ: "tenant_selection",
          surface: "tenant",
          aud: "trixus-tenant",
        }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService({} as never, jwt as never, config as never);

    await expect(
      service.selectTenant("portal-token", undefined, "portal:access-a"),
    ).rejects.toMatchObject({ response: { code: "AUTH_CHANNEL_MISMATCH" } });
    await expect(
      service.selectPortal("internal-token", undefined, "membership:membership-a"),
    ).rejects.toMatchObject({ response: { code: "AUTH_CHANNEL_MISMATCH" } });
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
        surface: "tenant",
        aud: "trixus-tenant",
      }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);
    vi.spyOn(service, "loginTenant").mockResolvedValue({ accessToken: "normal-access" } as never);

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
    expect(service.loginTenant).toHaveBeenCalledWith({
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
    vi.spyOn(service, "loginTenant").mockResolvedValue({ accessToken: "access" } as never);

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

  it("previews a customer portal invitation without exposing its token hash", async () => {
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          email: "clara@cliente.test",
          expiresAt: new Date("2026-10-23T12:00:00Z"),
          tokenHash: "must-not-leak",
          tenant: { id: "tenant-a", name: "Trixus", slug: "trixus" },
          role: { key: "customer_portal", name: "Portal do cliente" },
          portalAccess: {
            login: "clara.silva",
            accessProfile: "COLLABORATOR",
            contact: null,
            customer: null,
            department: null,
            branch: null,
          },
          contact: {
            id: "contact-a",
            name: "Clara",
            customerAccessProfile: "COLLABORATOR",
            customer: { id: "customer-a", name: "SDE" },
            customerDepartment: { id: "customer-department-a", name: "Financeiro" },
            customerBranch: { id: "branch-a", name: "Unidade01" },
          },
        }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    const result = await service.invitationPreview("plain-token");
    const repeatedResult = await service.invitationPreview("plain-token");

    expect(result).toEqual({
      email: "clara@cliente.test",
      login: "clara.silva",
      expiresAt: new Date("2026-10-23T12:00:00Z"),
      tenant: { id: "tenant-a", name: "Trixus", slug: "trixus" },
      profile: "COLLABORATOR",
      contact: {
        id: "contact-a",
        name: "Clara",
        customer: { id: "customer-a", name: "SDE" },
        department: { id: "customer-department-a", name: "Financeiro" },
        branch: { id: "branch-a", name: "Unidade01" },
      },
    });
    expect(result).not.toHaveProperty("tokenHash");
    expect(repeatedResult).toEqual(result);
    expect(prisma.userInvitation.findFirst).toHaveBeenCalledTimes(2);
  });

  it("recovers the registered portal login for a legacy invitation without the access relation", async () => {
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          contactId: "contact-a",
          email: "portal-generated@identity.trixus.invalid",
          expiresAt: new Date("2026-10-23T12:00:00Z"),
          tenant: { id: "tenant-a", name: "Trixus", slug: "trixus" },
          role: { key: "customer_portal", name: "Portal do cliente" },
          portalAccess: null,
          contact: {
            id: "contact-a",
            name: "Clara",
            active: true,
            archivedAt: null,
            customerAccessProfile: "COLLABORATOR",
            customer: { id: "customer-a", name: "SDE" },
            customerDepartment: { id: "customer-department-a", name: "Financeiro" },
            customerBranch: { id: "branch-a", name: "Unidade01" },
          },
        }),
      },
      customerPortalAccess: {
        findFirst: vi.fn().mockResolvedValue({ login: "clara.silva" }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(service.invitationPreview("plain-token")).resolves.toMatchObject({
      login: "clara.silva",
    });
    expect(prisma.customerPortalAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          contactId: "contact-a",
          revokedAt: null,
        },
      }),
    );
  });

  it("links an accepted portal invitation to the contact without changing global credentials", async () => {
    const passwordHash = await hash("SenhaExistente@2026", 4);
    const contactUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "shared-user",
          email: "clara@cliente.test",
          name: "Nome global preservado",
          passwordHash,
          status: "ACTIVE",
        }),
        create: vi.fn(),
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "portal-membership" }),
      },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      contact: { updateMany: contactUpdateMany },
      userInvitation: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-portal",
          email: "clara@cliente.test",
          tenantId: "tenant-a",
          roleId: "role-portal",
          departmentIds: [],
          contactId: "contact-a",
          contact: { id: "contact-a", name: "Clara" },
          tenant: { slug: "trixus" },
          role: { id: "role-portal", key: "customer_portal" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    vi.spyOn(service, "loginTenant").mockResolvedValue({ accessToken: "access" } as never);

    await service.acceptInvitation({ token: "invite-token", password: "SenhaExistente@2026" });

    expect(contactUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "contact-a",
        tenantId: "tenant-a",
        archivedAt: null,
        active: true,
      },
      data: { portalMembershipId: "portal-membership", portalAccessActive: true },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("adds a portal access without replacing an existing internal membership", async () => {
    const passwordHash = await hash("SenhaExistente@2026", 4);
    const membershipUpdate = vi.fn();
    const portalAccessUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-nata",
          email: "nata@example.test",
          name: "Natã",
          passwordHash,
          status: "ACTIVE",
        }),
        create: vi.fn(),
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership-internal",
          tenantId: "tenant-a",
          userId: "user-nata",
          roleId: "role-internal",
          status: "ACTIVE",
        }),
        update: membershipUpdate,
        create: vi.fn(),
      },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      customerPortalAccess: { updateMany: portalAccessUpdate },
      userInvitation: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-portal",
          email: "nata@example.test",
          tenantId: "tenant-a",
          roleId: "role-portal",
          departmentIds: [],
          contactId: "contact-nata",
          portalAccessId: "access-dips",
          portalAccess: {
            id: "access-dips",
            login: "portal.nata@example.test",
            active: false,
            contact: { id: "contact-nata", name: "Natã", active: true, archivedAt: null },
          },
          tenant: { slug: "trixus" },
          role: { id: "role-portal", key: "customer_portal" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    const loginPortal = vi
      .spyOn(service, "loginPortal")
      .mockResolvedValue({ accessToken: "access" } as never);

    await service.acceptInvitation({ token: "invite-token", password: "SenhaExistente@2026" });

    expect(membershipUpdate).not.toHaveBeenCalled();
    expect(tx.tenantMembership.create).not.toHaveBeenCalled();
    expect(portalAccessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: "user-nata",
          membershipId: "membership-internal",
          active: true,
        },
        where: expect.not.objectContaining({ active: true }),
      }),
    );
    expect(tx.userInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        portalAccessId: "access-dips",
        status: "PENDING",
        id: { not: "invite-portal" },
      },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(loginPortal).toHaveBeenCalledWith({
      login: "portal.nata@example.test",
      password: "SenhaExistente@2026",
      tenantSlug: "trixus",
    });
  });

  it("does not reactivate a portal access removed while its invitation is being accepted", async () => {
    const passwordHash = await hash("SenhaExistente@2026", 4);
    const invitationUpdate = vi.fn();
    const portalAccessUpdate = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-nata",
          email: "nata@example.test",
          name: "Natã",
          passwordHash,
          status: "ACTIVE",
        }),
        create: vi.fn(),
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership-internal",
          tenantId: "tenant-a",
          userId: "user-nata",
          roleId: "role-internal",
          status: "ACTIVE",
        }),
        create: vi.fn(),
      },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      customerPortalAccess: { updateMany: portalAccessUpdate },
      userInvitation: { update: invitationUpdate, updateMany: vi.fn() },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-portal",
          email: "nata@example.test",
          tenantId: "tenant-a",
          roleId: "role-portal",
          departmentIds: [],
          contactId: "contact-nata",
          portalAccessId: "access-dips",
          portalAccess: {
            id: "access-dips",
            active: false,
            contact: { id: "contact-nata", name: "Natã", active: true, archivedAt: null },
          },
          tenant: { slug: "trixus" },
          role: { id: "role-portal", key: "customer_portal" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.acceptInvitation({ token: "invite-token", password: "SenhaExistente@2026" }),
    ).rejects.toThrow("Convite de contato não está mais ativo.");
    expect(portalAccessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "access-dips", revokedAt: null }),
      }),
    );
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it("rejects previewing an invitation for an inactive contact", async () => {
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          contactId: "contact-a",
          contact: { id: "contact-a", active: false, archivedAt: null },
          tenant: { id: "tenant-a", name: "Trixus", slug: "trixus" },
          role: { key: "customer_portal", name: "Portal do cliente" },
        }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(service.invitationPreview("plain-token")).rejects.toThrow(
      "Convite de contato não está mais ativo.",
    );
  });

  it("rejects accepting an invitation for an inactive contact before changing membership", async () => {
    const transaction = vi.fn();
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          contactId: "contact-a",
          contact: { id: "contact-a", active: false, archivedAt: null },
          tenant: { slug: "trixus" },
          role: { key: "customer_portal" },
        }),
      },
      $transaction: transaction,
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.acceptInvitation({ token: "invite-token", password: "SenhaValida@2026" }),
    ).rejects.toThrow("Convite de contato não está mais ativo.");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("aborts acceptance when the contact becomes inactive during the transaction", async () => {
    const passwordHash = await hash("SenhaExistente@2026", 4);
    const invitationUpdate = vi.fn();
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "shared-user",
          email: "clara@cliente.test",
          passwordHash,
          status: "ACTIVE",
        }),
        create: vi.fn(),
      },
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "portal-membership" }),
      },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      contact: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      userInvitation: { update: invitationUpdate },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-portal",
          email: "clara@cliente.test",
          tenantId: "tenant-a",
          roleId: "role-portal",
          departmentIds: [],
          contactId: "contact-a",
          contact: { id: "contact-a", name: "Clara", active: true, archivedAt: null },
          tenant: { slug: "trixus" },
          role: { id: "role-portal", key: "customer_portal" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.acceptInvitation({ token: "invite-token", password: "SenhaExistente@2026" }),
    ).rejects.toThrow("Convite de contato não está mais ativo.");
    expect(tx.contact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
    );
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it("uses the tenant responsible name when an administrator accepts without typing a name", async () => {
    const userCreate = vi.fn().mockImplementation(({ data }) => ({ id: "admin-1", ...data }));
    const membershipUpsert = vi.fn().mockResolvedValue({ id: "membership-a" });
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue(null), create: userCreate },
      tenantMembership: { upsert: membershipUpsert },
      departmentMembership: { deleteMany: vi.fn(), createMany: vi.fn() },
      userInvitation: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      userInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite-admin",
          email: "admin@tenant.test",
          tenantId: "tenant-a",
          roleId: "role-admin",
          departmentIds: [],
          tenant: { slug: "tenant", responsibleName: "Ana Administradora" },
          role: { id: "role-admin", key: "tenant_admin" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    vi.spyOn(service, "loginTenant").mockResolvedValue({ accessToken: "access" } as never);

    await service.acceptInvitation({ token: "invite-token", password: "NovaSenha@2026" });

    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Ana Administradora" }),
    });
    expect(membershipUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ presentationName: "Ana Administradora" }),
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
    expect(tx.userInvitation.update).not.toHaveBeenCalled();
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

  it("issues an explicitly scoped platform session only through the platform surface", async () => {
    const platformUser = {
      id: "platform-1",
      email: "platform@example.test",
      name: "Platform",
      passwordHash: await hash("SenhaPlatform@2026", 4),
      status: "ACTIVE",
      platformRole: "ADMIN",
      avatarUrl: null,
      keepSidebarCollapsed: false,
      memberships: [],
    };
    const jwt = {
      signAsync: vi.fn().mockResolvedValueOnce("access").mockResolvedValueOnce("refresh"),
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(platformUser) },
      authSession: { create: vi.fn().mockResolvedValue({ id: "platform-session" }) },
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    await expect(
      service.loginPlatform({ email: platformUser.email, password: "SenhaPlatform@2026" }),
    ).resolves.toMatchObject({ accessToken: "access", tenant: { id: "platform" } });
    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ surface: "platform", aud: "trixus-platform", typ: "access" }),
      expect.anything(),
    );
    expect(jwt.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ surface: "platform", aud: "trixus-platform", typ: "refresh" }),
      expect.anything(),
    );
  });

  it("rejects tenant-only identities on the platform surface", async () => {
    const user = {
      id: "tenant-user",
      email: "tenant@example.test",
      passwordHash: await hash("SenhaTenant@2026", 4),
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [],
    };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.loginPlatform({ email: user.email, password: "SenhaTenant@2026" }),
    ).rejects.toMatchObject({ response: { code: "PLATFORM_ACCESS_DENIED" } });
  });

  it("rejects platform-only identities on the tenant surface", async () => {
    const user = {
      id: "platform-user",
      email: "platform@example.test",
      passwordHash: await hash("SenhaPlatform@2026", 4),
      status: "ACTIVE",
      platformRole: "ADMIN",
      memberships: [],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      customerPortalAccess: { findMany: vi.fn().mockResolvedValue([]) },
      userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.loginTenant({ email: user.email, password: "SenhaPlatform@2026" }),
    ).rejects.toMatchObject({ response: { code: "INTERNAL_ACCESS_DENIED" } });
  });

  it("rejects an internal-only identity on the customer portal login", async () => {
    const internalMembership = {
      id: "membership-a",
      tenantId: "tenant-a",
      userId: "internal-user",
      roleId: "role-admin",
      status: "ACTIVE",
      presentationName: "Interno",
      user: { name: "Interno" },
      tenant: {
        id: "tenant-a",
        slug: "alpha",
        name: "Alpha",
        status: "ACTIVE",
        featureOverrides: null,
      },
      role: { key: "tenant_admin", permissions: [] },
    };
    const user = {
      id: "internal-user",
      email: "internal@example.test",
      passwordHash: await hash("SenhaInterna@2026", 4),
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [internalMembership],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      customerPortalAccess: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.loginPortal({ login: user.email, password: "SenhaInterna@2026" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a portal-only identity on the internal login", async () => {
    const portalMembership = {
      id: "membership-portal",
      tenantId: "tenant-a",
      userId: "portal-user",
      roleId: "role-portal",
      status: "ACTIVE",
      presentationName: "Portal",
      user: { name: "Portal" },
      tenant: {
        id: "tenant-a",
        slug: "alpha",
        name: "Alpha",
        status: "ACTIVE",
        featureOverrides: null,
      },
      role: { key: "customer_portal", permissions: [] },
    };
    const user = {
      id: "portal-user",
      email: "portal@example.test",
      passwordHash: await hash("SenhaPortal@2026", 4),
      status: "ACTIVE",
      platformRole: "USER",
      memberships: [portalMembership],
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      customerPortalAccess: { findMany: vi.fn().mockResolvedValue([]) },
      userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(
      service.loginTenant({ email: user.email, password: "SenhaPortal@2026" }),
    ).rejects.toMatchObject({ response: { code: "INTERNAL_ACCESS_DENIED" } });
  });

  it.each([
    ["clara.silva", "clara@example.test"],
    ["acesso.cliente@example.test", "identidade-global@example.test"],
  ])(
    "resolves the active customer portal login %s without changing the global user identity",
    async (portalLogin, userEmail) => {
      const membership = {
        id: "portal-membership",
        tenantId: "tenant-a",
        userId: "user-a",
        roleId: "role-portal",
        status: "ACTIVE",
        presentationName: "Clara",
        user: { name: "Clara" },
        tenant: {
          id: "tenant-a",
          slug: "empresa-a",
          name: "Empresa A",
          status: "ACTIVE",
          featureOverrides: null,
        },
        role: { key: "customer_portal", permissions: [{ permissionId: "tickets.read" }] },
      };
      const user = {
        id: "user-a",
        email: userEmail,
        name: "Clara",
        passwordHash: await hash("SenhaPortal@2026", 4),
        status: "ACTIVE",
        platformRole: "USER",
        avatarUrl: null,
        keepSidebarCollapsed: false,
        memberships: [membership],
      };
      const portalAccess = {
        id: "portal-access-a",
        tenantId: "tenant-a",
        customerId: "customer-a",
        contactId: "contact-a",
        membershipId: "portal-membership",
        userId: "user-a",
        login: portalLogin,
        accessProfile: "COLLABORATOR",
        branchId: "branch-a",
        departmentId: "department-a",
        active: true,
        tenant: membership.tenant,
        customer: { id: "customer-a", name: "Cliente A" },
        contact: { id: "contact-a", name: "Clara" },
        branch: { id: "branch-a" },
        department: { id: "department-a" },
        membership,
        user,
      };
      const prisma = {
        customerPortalAccess: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ user: { id: "user-a", passwordHash: user.passwordHash } }])
            .mockResolvedValueOnce([portalAccess]),
        },
        user: { findUnique: vi.fn().mockResolvedValue(user) },
        userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
        authSession: { create: vi.fn().mockResolvedValue({ id: "session-a" }) },
        role: {
          findUnique: vi.fn().mockResolvedValue({
            id: "role-portal",
            key: "customer_portal",
            active: true,
            permissions: [{ permissionId: "tickets.read" }],
          }),
        },
        tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const jwt = {
        signAsync: vi.fn().mockResolvedValueOnce("access").mockResolvedValueOnce("refresh"),
      };
      const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
      const service = new AuthService(prisma as never, jwt as never, config as never);

      const result = await service.loginPortal({
        login: portalLogin,
        password: "SenhaPortal@2026",
      });

      expect(prisma.customerPortalAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ login: portalLogin }) }),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user-a" } }),
      );
      expect(result).toMatchObject({
        accessToken: "access",
        user: { email: userEmail },
        tenant: { id: "tenant-a", slug: "empresa-a" },
      });
    },
  );

  it("rejects crossed surface and audience claims during refresh", async () => {
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: "platform-1",
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "platform_admin",
        platformRole: "ADMIN",
        surface: "platform",
        aud: "trixus-tenant",
        typ: "refresh",
        sid: "session-a",
      }),
    };
    const config = { get: vi.fn().mockReturnValue("test-secret-with-at-least-32-characters") };
    const service = new AuthService({} as never, jwt as never, config as never);

    await expect(service.refresh("crossed-refresh")).rejects.toThrow(
      "Superfície de autenticação inválida",
    );
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
    surface: "platform",
    iatMs: Date.now(),
  };
}
