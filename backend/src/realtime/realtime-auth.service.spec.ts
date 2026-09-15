import { describe, expect, it, vi } from "vitest";
import { RealtimeAuthError, RealtimeAuthService } from "./realtime-auth.service";

describe("RealtimeAuthService", () => {
  it("rejects missing tokens with a canonical code", async () => {
    const service = serviceWith();
    await expect(service.authenticate(null)).rejects.toMatchObject({
      code: "REALTIME_TOKEN_MISSING",
    });
  });

  it("builds trusted context from database membership, not client payload", async () => {
    const service = serviceWith();
    await expect(service.authenticate("access-token")).resolves.toMatchObject({
      userId: "user-a",
      tenantId: "tenant-a",
      membershipId: "membership-a",
      roleKey: "agent",
      departmentIds: ["department-a"],
      permissions: ["conversations.read"],
    });
  });

  it("rejects inactive users", async () => {
    const service = serviceWith({ userStatus: "DISABLED" });
    await expect(service.authenticate("access-token")).rejects.toBeInstanceOf(RealtimeAuthError);
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_USER_INACTIVE",
    });
  });
});

function serviceWith(
  options: { userStatus?: "ACTIVE" | "DISABLED"; membershipStatus?: string } = {},
) {
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({
      sub: "user-a",
      tenantId: "tenant-a",
      membershipId: "membership-a",
      roleId: "role-a",
      roleKey: "agent",
      platformRole: "USER",
      typ: "access",
    }),
  };
  const config = { get: vi.fn().mockReturnValue("test-access-secret-minimum-32-chars") };
  const prisma = {
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "membership-a",
        tenantId: "tenant-a",
        userId: "user-a",
        roleId: "role-a",
        status: options.membershipStatus ?? "ACTIVE",
        user: { status: options.userStatus ?? "ACTIVE", platformRole: "USER" },
        role: {
          key: "agent",
          permissions: [{ permissionId: "conversations.read" }],
        },
        departments: [{ departmentId: "department-a" }],
      }),
    },
  };
  return new RealtimeAuthService(jwt as never, config as never, prisma as never);
}
