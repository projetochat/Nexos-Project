import { describe, expect, it, vi } from "vitest";
import {
  isOnboardingAdministratorRequest,
  isOnboardingStatusRequest,
  isTenantBootstrapRequest,
  normalizeRequestPath,
  JwtAuthGuard,
} from "./jwt-auth.guard";

describe("pending onboarding route boundary", () => {
  it("releases the setup restriction for Chat disabled only after active session and membership checks", async () => {
    const f = setupGuard("agent", "GET", "/api/inbox");
    const subscription = await f.prisma.tenantSubscription.findFirst();
    f.prisma.tenantSubscription.findFirst.mockClear();
    f.prisma.tenantSubscription.findFirst.mockResolvedValue({
      ...subscription,
      featuresSnapshot: { chat: false },
    });
    await expect(f.guard.canActivate(f.context as never)).resolves.toBe(true);
    expect(f.prisma.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-a",
          tenantId: "tenant-a",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          tenant: { status: { in: ["ACTIVE", "TRIAL"] } },
        }),
      }),
    );
    f.prisma.tenantMembership.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.guard.canActivate(f.context as never)).rejects.toThrow("Membership inativa");
    expect(f.prisma.tenantSubscription.findFirst).toHaveBeenCalledTimes(1);
    f.auth.assertAccessSession.mockRejectedValueOnce(new Error("session revoked"));
    await expect(f.guard.canActivate(f.context as never)).rejects.toThrow("session revoked");
    expect(f.prisma.tenantSubscription.findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not bypass invalid portal access or entitlement lookup failures", async () => {
    const f = setupGuard("tenant_admin", "GET", "/api/inbox", "portal-access-a");
    f.prisma.customerPortalAccess.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.guard.canActivate(f.context as never)).rejects.toThrow("Acesso ao Portal");
    expect(f.prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
    f.prisma.tenantSubscription.findFirst.mockRejectedValueOnce(
      new Error("entitlements unavailable"),
    );
    await expect(f.guard.canActivate(f.context as never)).rejects.toThrow(
      "entitlements unavailable",
    );
  });

  it("keeps the status endpoint available to every authenticated tenant user", () => {
    expect(isOnboardingStatusRequest("GET", "/onboarding/status")).toBe(true);
    expect(isTenantBootstrapRequest("GET", "/auth/me")).toBe(true);
  });

  it("allows only the official wizard CRUD surface for the administrator", () => {
    expect(isOnboardingAdministratorRequest("POST", "/messaging/connections/evolution")).toBe(true);
    expect(isOnboardingAdministratorRequest("GET", "/messaging/connections/id/qr")).toBe(true);
    expect(isOnboardingAdministratorRequest("POST", "/departments")).toBe(true);
    expect(isOnboardingAdministratorRequest("PATCH", "/roles/id")).toBe(true);
    expect(isOnboardingAdministratorRequest("PATCH", "/roles/id/favorite-department")).toBe(true);
    expect(isOnboardingAdministratorRequest("POST", "/quick-replies")).toBe(true);
    expect(isOnboardingAdministratorRequest("POST", "/tags")).toBe(true);
    expect(isOnboardingAdministratorRequest("DELETE", "/messaging/connections/id")).toBe(true);
    expect(isOnboardingAdministratorRequest("PATCH", "/users/id/activate")).toBe(true);
    expect(isOnboardingAdministratorRequest("PATCH", "/users/id/deactivate")).toBe(true);
  });

  it("does not release unrelated platform routes", () => {
    expect(isOnboardingAdministratorRequest("GET", "/inbox")).toBe(false);
    expect(isOnboardingAdministratorRequest("POST", "/campaigns")).toBe(false);
  });

  it("normalizes the global API prefix and query string", () => {
    expect(normalizeRequestPath("/api/onboarding/status?fresh=1")).toBe("/onboarding/status");
  });

  it("blocks a regular user from unrelated routes while onboarding is pending", async () => {
    const { guard, context } = setupGuard("agent", "GET", "/api/inbox");
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: { code: "ONBOARDING_PENDING" },
    });
  });

  it("allows the current administrator through an official wizard endpoint", async () => {
    const { guard, context, request } = setupGuard("tenant_admin", "POST", "/api/departments");
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user.roleKey).toBe("tenant_admin");
  });

  it("does not inherit the internal administrator exception in a portal session", async () => {
    const { guard, context } = setupGuard(
      "tenant_admin",
      "POST",
      "/api/departments",
      "portal-access-a",
    );
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: { code: "ONBOARDING_PENDING" },
    });
  });
});

function setupGuard(roleKey: string, method: string, originalUrl: string, portalAccessId?: string) {
  const payload = {
    sub: "user-a",
    tenantId: "tenant-a",
    membershipId: "membership-a",
    roleId: "role-a",
    roleKey,
    platformRole: "USER",
    surface: "tenant",
    aud: "trixus-tenant",
    typ: "access",
    portalAccessId,
  } as const;
  const auth = {
    verifyToken: vi.fn().mockResolvedValue(payload),
    assertAccessSession: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    tenantSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        id: "subscription-a",
        planId: "plan-a",
        status: "ACTIVE",
        plan: { code: "synthetic" },
        limitsSnapshot: {},
        featuresSnapshot: { chat: true },
        tenant: {
          maxUsers: null,
          maxConnections: null,
          featureOverrides: null,
          limitOverrides: null,
        },
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ status: "PENDING" }]),
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({ role: { key: roleKey } }),
    },
    customerPortalAccess: { findFirst: vi.fn().mockResolvedValue({ id: portalAccessId }) },
  };
  const request = {
    method,
    originalUrl,
    path: originalUrl,
    headers: { authorization: "Bearer token" },
    user: undefined as unknown as { roleKey: string },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return {
    guard: new JwtAuthGuard(auth as never, prisma as never),
    context,
    request,
    prisma,
    auth,
  };
}
