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

  it("rejects platform access tokens on the tenant realtime surface", async () => {
    const service = serviceWith({ surface: "platform", aud: "trixus-platform" });
    await expect(service.authenticate("platform-access-token")).rejects.toMatchObject({
      code: "REALTIME_TOKEN_INVALID",
    });
  });

  it("rejects inactive users", async () => {
    const service = serviceWith({ userStatus: "DISABLED" });
    await expect(service.authenticate("access-token")).rejects.toBeInstanceOf(RealtimeAuthError);
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_USER_INACTIVE",
    });
  });

  it("rejects a token issued before tenant session revocation", async () => {
    const service = serviceWith({
      iatMs: 1_000,
      authRevokedAt: new Date(2_000),
    });
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_TOKEN_INVALID",
    });
  });

  it("rejects a revoked persisted session", async () => {
    const service = serviceWith({ sessionActive: false });
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_TOKEN_INVALID",
    });
  });

  it("rejects events after the access token expiration, including legacy sidless sockets", async () => {
    const service = serviceWith({ sid: undefined, exp: Math.floor(Date.now() / 1000) - 1 });
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_TOKEN_EXPIRED",
    });
  });

  it("rejects a new socket while tenant onboarding is pending", async () => {
    const service = serviceWith({ onboardingStatus: "PENDING" });
    await expect(service.authenticate("access-token")).rejects.toMatchObject({
      code: "REALTIME_ONBOARDING_PENDING",
    });
  });

  it.each([undefined, "COMPLETED"])(
    "preserves realtime access for legacy or completed onboarding state %s",
    async (onboardingStatus) => {
      const service = serviceWith({ onboardingStatus });
      await expect(service.authenticate("access-token")).resolves.toMatchObject({
        tenantId: "tenant-a",
      });
    },
  );

  it("revalidates membership state for every established socket event", async () => {
    const service = serviceWith();
    const context = await service.authenticate("access-token");
    const prisma = (
      service as unknown as {
        prisma: { tenantMembership: { findFirst: ReturnType<typeof vi.fn> } };
      }
    ).prisma;
    prisma.tenantMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.assertSession(context)).rejects.toMatchObject({
      code: "REALTIME_MEMBERSHIP_INACTIVE",
    });
  });

  it("revalidates impersonation state for every established socket event", async () => {
    const service = serviceWith({ impersonationSessionId: "impersonation-a" });
    const context = await service.authenticate("access-token");
    const prisma = (
      service as unknown as {
        prisma: { impersonationSession: { findFirst: ReturnType<typeof vi.fn> } };
      }
    ).prisma;
    prisma.impersonationSession.findFirst.mockResolvedValueOnce(null);
    await expect(service.assertSession(context)).rejects.toMatchObject({
      code: "REALTIME_TOKEN_INVALID",
    });
  });

  it("disconnects an established socket when onboarding becomes pending", async () => {
    const service = serviceWith({ onboardingStatus: "COMPLETED" });
    const context = await service.authenticate("access-token");
    const prisma = (service as unknown as { prisma: { $queryRaw: ReturnType<typeof vi.fn> } })
      .prisma;
    prisma.$queryRaw.mockResolvedValueOnce([{ status: "PENDING" }]);
    await expect(service.assertSession(context)).rejects.toMatchObject({
      code: "REALTIME_ONBOARDING_PENDING",
    });
  });
});

function serviceWith(
  options: {
    userStatus?: "ACTIVE" | "DISABLED";
    membershipStatus?: string;
    iatMs?: number;
    authRevokedAt?: Date | null;
    sessionActive?: boolean;
    sid?: string;
    exp?: number;
    impersonationSessionId?: string;
    surface?: "platform" | "tenant";
    aud?: "trixus-platform" | "trixus-tenant";
    onboardingStatus?: "PENDING" | "COMPLETED";
  } = {},
) {
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({
      sub: "user-a",
      tenantId: "tenant-a",
      membershipId: "membership-a",
      roleId: "role-a",
      roleKey: "agent",
      platformRole: "USER",
      surface: options.surface ?? "tenant",
      aud: options.aud ?? "trixus-tenant",
      typ: "access",
      sid: options.sid === undefined && "sid" in options ? undefined : "session-a",
      exp: options.exp ?? Math.floor(Date.now() / 1000) + 900,
      impersonationSessionId: options.impersonationSessionId,
      actorPlatformUserId: options.impersonationSessionId ? "actor-a" : undefined,
      iatMs: options.iatMs,
    }),
  };
  const config = { get: vi.fn().mockReturnValue("test-access-secret-minimum-32-chars") };
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue(options.onboardingStatus ? [{ status: options.onboardingStatus }] : []),
    authSession: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options.sessionActive === false ? null : { id: "session-a" }),
    },
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "membership-a",
        tenantId: "tenant-a",
        userId: "user-a",
        roleId: "role-a",
        status: options.membershipStatus ?? "ACTIVE",
        user: { status: options.userStatus ?? "ACTIVE", platformRole: "USER" },
        tenant: { status: "ACTIVE", authRevokedAt: options.authRevokedAt ?? null },
        role: {
          key: "agent",
          permissions: [{ permissionId: "conversations.read" }],
        },
        departments: [{ departmentId: "department-a" }],
      }),
    },
    impersonationSession: { findFirst: vi.fn().mockResolvedValue({ id: "impersonation-a" }) },
  };
  return new RealtimeAuthService(jwt as never, config as never, prisma as never);
}
