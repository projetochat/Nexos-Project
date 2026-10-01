import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

describe("profile permission enforcement", () => {
  it("reloads selected instances and the assigned permission set", async () => {
    const membership = {
      roleId: "role-a",
      tenant: {},
      role: {
        key: "agent",
        metadata: { connectionIds: ["vocical"] },
        permissions: [{ permissionId: "messages.send" }],
      },
    };
    const prisma = {
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
      permissions: ["messages.send"],
      assignedPermissionIds: ["messages.send"],
    });
    membership.role.metadata.connectionIds = [];
    await guard.canActivate(context as never);
    expect(request.user).toMatchObject({ connectionIds: [] });
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
          key === "any-permissions" ? ["chat.tickets.create", "tickets.create"] : undefined,
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
});
