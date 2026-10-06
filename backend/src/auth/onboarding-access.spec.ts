import { describe, expect, it, vi } from "vitest";
import {
  isOnboardingAdministratorRequest,
  isOnboardingStatusRequest,
  isTenantBootstrapRequest,
  normalizeRequestPath,
  JwtAuthGuard,
} from "./jwt-auth.guard";

describe("pending onboarding route boundary", () => {
  it("keeps the status endpoint available to every authenticated tenant user", () => {
    expect(isOnboardingStatusRequest("GET", "/onboarding/status")).toBe(true);
    expect(isTenantBootstrapRequest("GET", "/auth/me")).toBe(true);
  });

  it("allows only the official wizard CRUD surface for the administrator", () => {
    expect(isOnboardingAdministratorRequest("POST", "/messaging/connections/evolution")).toBe(true);
    expect(isOnboardingAdministratorRequest("GET", "/messaging/connections/id/qr")).toBe(true);
    expect(isOnboardingAdministratorRequest("POST", "/departments")).toBe(true);
    expect(isOnboardingAdministratorRequest("PATCH", "/roles/id")).toBe(true);
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
});

function setupGuard(roleKey: string, method: string, originalUrl: string) {
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
  } as const;
  const auth = {
    verifyToken: vi.fn().mockResolvedValue(payload),
    assertAccessSession: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ status: "PENDING" }]),
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({ role: { key: roleKey } }),
    },
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
  return { guard: new JwtAuthGuard(auth as never, prisma as never), context, request };
}
