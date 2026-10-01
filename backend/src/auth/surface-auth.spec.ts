import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { PermissionsGuard } from "./permissions.guard";
import { PlatformAuthGuard } from "../platform/platform-auth.guard";

function contextWith(user: Record<string, unknown>) {
  return {
    getHandler() {},
    getClass() {},
    switchToHttp: () => ({
      getRequest: () => ({ user, headers: {}, params: {}, originalUrl: "/api/test" }),
    }),
  } as never;
}

describe("authentication surface isolation", () => {
  it("rejects a platform token at tenant permission boundaries before database access", async () => {
    const prisma = { tenantMembership: { findFirst: vi.fn() } };
    const guard = new PermissionsGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as never,
      prisma as never,
    );

    await expect(
      guard.canActivate(
        contextWith({
          userId: "platform-1",
          tenantId: "",
          membershipId: "",
          platformRole: "ADMIN",
          surface: "platform",
        }),
      ),
    ).rejects.toMatchObject({ response: { code: "TENANT_SURFACE_REQUIRED" } });
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a tenant token at platform boundaries before database access", async () => {
    const prisma = { user: { findFirst: vi.fn() } };
    const guard = new PlatformAuthGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as never,
      prisma as never,
    );

    await expect(
      guard.canActivate(
        contextWith({
          userId: "tenant-user",
          tenantId: "tenant-a",
          membershipId: "membership-a",
          platformRole: "USER",
          surface: "tenant",
        }),
      ),
    ).rejects.toMatchObject({ response: { code: "PLATFORM_SURFACE_REQUIRED" } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
