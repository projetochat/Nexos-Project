import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

describe("instance-only profile enforcement", () => {
  it("reloads selected instances on every request and permits chat actions without other switches", async () => {
    const membership = {
      roleId: "role-a",
      tenant: {},
      role: { key: "agent", metadata: { connectionIds: ["vocical"] }, permissions: [] },
    };
    const prisma = {
      tenantMembership: { findFirst: vi.fn().mockImplementation(async () => membership) },
    };
    const guard = new PermissionsGuard(
      { getAllAndOverride: () => ["messages.send"] } as never,
      prisma as never,
    );
    const request = {
      originalUrl: "/api/conversations/chat-a/messages",
      params: {},
      user: { userId: "user-a", tenantId: "tenant-a", membershipId: "member-a" },
    };
    const context = {
      getHandler() {},
      getClass() {},
      switchToHttp: () => ({ getRequest: () => request }),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      connectionIds: ["vocical"],
      permissions: expect.arrayContaining(["messages.send", "conversations.manage"]),
    });
    membership.role.metadata.connectionIds = [];
    await guard.canActivate(context as never);
    expect(request.user).toMatchObject({ connectionIds: [] });
  });
});
