import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtPayload } from "./auth.types";

const secret = "test-secret-with-at-least-32-characters";

function tenantPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "user-a",
    tenantId: "tenant-a",
    membershipId: "membership-a",
    roleId: "role-a",
    roleKey: "agent",
    platformRole: "USER",
    surface: "tenant",
    aud: "trixus-tenant",
    typ: "access",
    sid: "session-a",
    iatMs: Date.now(),
    ...overrides,
  };
}

function serviceFixture(payload = tenantPayload()) {
  let revokedAt: Date | null = null;
  const authSession = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (
        where.id !== "session-a" ||
        where.userId !== "user-a" ||
        where.tenantId !== "tenant-a" ||
        where.membershipId !== "membership-a" ||
        where.impersonationSessionId !== (payload.impersonationSessionId ?? null) ||
        revokedAt
      )
        return null;
      return { id: "session-a" };
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: { revokedAt: Date } }) => {
        if (where.id === "session-a" && where.revokedAt === null && !revokedAt) {
          revokedAt = data.revokedAt;
          return { count: 1 };
        }
        return { count: 0 };
      },
    ),
  };
  const prisma = { authSession };
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue(payload),
    signAsync: vi.fn().mockResolvedValue("signed-token"),
  };
  const config = { get: vi.fn().mockReturnValue(secret) };
  return {
    service: new AuthService(prisma as never, jwt as never, config as never),
    prisma,
    jwt,
  };
}

describe("server-side auth sessions", () => {
  it("revokes one sid idempotently and rejects replay after logout", async () => {
    const f = serviceFixture();
    await expect(f.service.assertAccessSession(tenantPayload())).resolves.toBeUndefined();

    await expect(f.service.logout("Bearer access-token")).resolves.toEqual({ ok: true });
    await expect(f.service.logout("Bearer access-token")).resolves.toEqual({ ok: true });
    await expect(f.service.assertAccessSession(tenantPayload())).rejects.toThrow("Sessão expirada");
    expect(f.prisma.authSession.updateMany).toHaveBeenCalledTimes(2);
  });

  it("does not accept a sid from another tenant or membership", async () => {
    const f = serviceFixture(tenantPayload({ tenantId: "tenant-b", membershipId: "membership-b" }));
    await expect(
      f.service.assertAccessSession(
        tenantPayload({ tenantId: "tenant-b", membershipId: "membership-b" }),
      ),
    ).rejects.toThrow("Sessão expirada");
  });

  it("allows legacy access only for its remaining JWT lifetime and refuses legacy refresh", async () => {
    const legacy = tenantPayload({ sid: undefined, typ: "refresh" });
    const f = serviceFixture(legacy);
    await expect(
      f.service.assertAccessSession({ ...legacy, typ: "access" }),
    ).resolves.toBeUndefined();
    await expect(f.service.refresh("legacy-refresh")).rejects.toThrow("Sessão legada expirada");
    expect(f.prisma.authSession.findFirst).not.toHaveBeenCalled();
  });

  it("requires the active sid before hydrating an access request", async () => {
    const f = serviceFixture();
    const guard = new JwtAuthGuard(f.service);
    const request = { headers: { authorization: "Bearer access-token" } } as never;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({
      user: expect.objectContaining({ sid: "session-a", tenantId: "tenant-a" }),
    });
  });

  it("binds an impersonated sid to the impersonation context", async () => {
    const impersonated = tenantPayload({
      typ: "refresh",
      impersonationSessionId: "impersonation-a",
      actorPlatformUserId: "actor-a",
    });
    const f = serviceFixture(impersonated);
    await expect(
      f.service.assertAccessSession({ ...impersonated, typ: "access" }),
    ).resolves.toBeUndefined();
    await expect(
      f.service.assertAccessSession({
        ...impersonated,
        typ: "access",
        impersonationSessionId: "impersonation-b",
      }),
    ).rejects.toThrow("Sessão expirada");
  });
});
