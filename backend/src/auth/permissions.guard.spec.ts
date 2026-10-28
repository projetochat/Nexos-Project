import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

describe("profile permission enforcement", () => {
  it("keeps administrator access unrestricted while loading the Wizard favorite", async () => {
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: "role-admin",
          tenantId: "tenant-a",
          tenant: { featureOverrides: null },
          role: {
            key: "tenant_admin",
            metadata: {
              chatScopes: [
                {
                  connectionId: "connection-a",
                  departmentIds: ["department-a"],
                  favoriteDepartmentId: "department-a",
                },
              ],
            },
            permissions: [{ permissionId: "messages.send" }],
          },
        }),
      },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (key: string) => (key === "permissions" ? ["messages.send"] : undefined),
      } as never,
      prisma as never,
    );
    const request = {
      originalUrl: "/api/conversations",
      params: {},
      user: {
        userId: "user-a",
        tenantId: "tenant-a",
        membershipId: "member-a",
        surface: "tenant",
      },
    };
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
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
    });
  });

  it("reloads selected instances and the assigned permission set", async () => {
    const membership = {
      roleId: "role-a",
      tenant: {},
      role: {
        key: "agent",
        metadata: { connectionIds: ["vocical"], departmentIds: ["department-a"] },
        permissions: [{ permissionId: "messages.send" }],
      },
    };
    const prisma = {
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue({ featuresSnapshot: { chat: true } }),
      },
      tenantMembership: { findFirst: vi.fn().mockImplementation(async () => membership) },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (key: string) => (key === "permissions" ? ["messages.send"] : undefined),
      } as never,
      prisma as never,
    );
    const request = {
      originalUrl: "/api/conversations/chat-a/messages",
      params: {},
      user: {
        userId: "user-a",
        tenantId: "tenant-a",
        membershipId: "member-a",
        surface: "tenant",
      },
    };
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => request }),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      connectionIds: ["vocical"],
      chatDepartmentIds: ["department-a"],
      permissions: ["messages.send"],
      assignedPermissionIds: ["messages.send"],
    });
    membership.role.metadata.connectionIds = [];
    membership.role.metadata.departmentIds = [];
    await guard.canActivate(context as never);
    expect(request.user).toMatchObject({ connectionIds: [], chatDepartmentIds: [] });
  });

  it("rejects a required permission that is not assigned", async () => {
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: "role-a",
          tenant: {},
          role: { key: "agent", metadata: {}, permissions: [] },
        }),
      },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (key: string) => (key === "permissions" ? ["messages.send"] : undefined),
      } as never,
      prisma as never,
    );
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: "/api/conversations/chat-a/messages",
          params: {},
          user: {
            userId: "user-a",
            tenantId: "tenant-a",
            membershipId: "member-a",
            surface: "tenant",
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toThrow("Permissão insuficiente");
  });

  it("rejects an expired impersonation while revalidating a permissionless endpoint", async () => {
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: "role-a",
          tenant: {},
          role: { key: "agent", metadata: {}, permissions: [] },
        }),
      },
      impersonationSession: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const guard = new PermissionsGuard(
      { getAllAndOverride: () => undefined } as never,
      prisma as never,
    );
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: "/api/auth/me",
          params: {},
          user: {
            userId: "user-a",
            tenantId: "tenant-a",
            membershipId: "member-a",
            impersonationSessionId: "expired-session",
            actorPlatformUserId: "platform-user",
            surface: "tenant",
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      "Sessão de impersonação expirada",
    );
  });

  it("accepts an endpoint with an assigned alternative permission", async () => {
    const prisma = {
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue({ featuresSnapshot: { chat: true } }),
      },
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: "role-a",
          tenant: {},
          role: {
            key: "agent",
            metadata: {},
            permissions: [{ permissionId: "tickets.create" }],
          },
        }),
      },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (key: string) =>
          key === "any-permissions" ? ["tickets.create"] : undefined,
      } as never,
      prisma as never,
    );
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: "/api/tickets",
          params: {},
          user: {
            userId: "user-a",
            tenantId: "tenant-a",
            membershipId: "member-a",
            surface: "tenant",
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it("keeps the customer portal role when the underlying membership is an administrator", async () => {
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: "role-admin",
          tenantId: "tenant-a",
          tenant: { featureOverrides: null },
          role: {
            id: "role-admin",
            key: "tenant_admin",
            metadata: {},
            permissions: [{ permissionId: "users.create" }],
          },
        }),
      },
      customerPortalAccess: { findFirst: vi.fn().mockResolvedValue({ id: "access-a" }) },
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: "role-portal",
          key: "customer_portal",
          active: true,
          metadata: {},
          permissions: [{ permissionId: "tickets.read" }],
        }),
      },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (key: string) => (key === "permissions" ? ["tickets.read"] : undefined),
      } as never,
      prisma as never,
    );
    const request = {
      user: {
        userId: "user-a",
        tenantId: "tenant-a",
        membershipId: "member-a",
        portalAccessId: "access-a",
        surface: "tenant",
      },
    };
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      roleId: "role-portal",
      roleKey: "customer_portal",
      permissions: ["tickets.read"],
      assignedPermissionIds: ["tickets.read"],
    });
  });
});

it.each(["tenant_admin", "custom"])(
  "rejects direct Chat operations for %s when the tenant disabled Chat without deleting grants",
  async (key) => {
    const role = {
      id: "role-a",
      key,
      permissions: [{ permissionId: "messages.send" }, { permissionId: "tickets.read" }],
    };
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          tenantId: "tenant-a",
          roleId: role.id,
          role,
          tenant: { featureOverrides: { chat: false } },
        }),
      },
      tenantSubscription: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ featuresSnapshot: { chat: true, campaigns: false, tickets: true } }),
      },
    };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: (name: string) =>
          name === "permissions" ? ["messages.send"] : undefined,
      } as never,
      prisma as never,
    );
    const request = {
      user: { surface: "tenant", tenantId: "tenant-a", membershipId: "member-a", userId: "user-a" },
    };
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => request }),
    };
    await expect(guard.canActivate(context as never)).rejects.toThrow("Permissão insuficiente");
    expect(role.permissions).toContainEqual({ permissionId: "messages.send" });
    expect(prisma.tenantSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) }),
    );
  },
);
