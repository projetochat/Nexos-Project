import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { AuthService } from "./auth.service";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled");
    }),
  ),
);
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function fixture() {
  const membership = {
    id: "member-a",
    tenantId: "tenant-a",
    userId: "user-a",
    roleId: "role-a",
    status: "ACTIVE",
    presentationName: null,
    tenant: {
      id: "tenant-a",
      slug: "tenant-a",
      name: "Synthetic tenant",
      status: "ACTIVE",
      featureOverrides: null,
    },
    role: { id: "role-a", key: "agent", permissions: [] },
  };
  const user = {
    id: "user-a",
    email: "synthetic@example.test",
    name: "Synthetic user",
    status: "ACTIVE",
    platformRole: "USER",
    passwordHash: await hash("placeholder-value", 4),
    memberships: [membership],
  };
  const committed: unknown[] = [];
  const transactionSession = { create: vi.fn().mockResolvedValue({ id: "session-a" }) };
  const audit = { create: vi.fn().mockResolvedValue({ id: "audit-a" }) };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    userInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
    authSession: {
      create: vi.fn().mockResolvedValue({ id: "other-session" }),
      findFirst: vi.fn().mockResolvedValue({ id: "session-a" }),
    },
    platformAuditLog: { create: vi.fn() },
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({ ...membership, user }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...membership, user }),
    },
    tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const value = await callback({ authSession: transactionSession, platformAuditLog: audit });
      committed.push(value);
      return value;
    }),
  };
  const jwt = {
    signAsync: vi.fn().mockImplementation(async (payload) => `${payload.typ}-synthetic`),
    verifyAsync: vi.fn().mockResolvedValue({
      sub: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      sid: "session-a",
      surface: "tenant",
      aud: "trixus-tenant",
      typ: "refresh",
    }),
  };
  const config = {
    get: vi.fn().mockReturnValue("synthetic-secret-at-least-thirty-two-characters"),
  };
  return {
    user,
    membership,
    prisma,
    transactionSession,
    audit,
    jwt,
    committed,
    service: new AuthService(prisma as never, jwt as never, config as never),
    config,
    credentials: { email: user.email, password: "placeholder-value" },
  };
}
describe("durable tenant login audit", () => {
  it("creates one session and one minimal tenant event atomically only after both tokens are signed", async () => {
    const f = await fixture();
    f.audit.create.mockImplementation(async () => {
      expect(f.jwt.signAsync).toHaveBeenCalledTimes(2);
      return { id: "audit-a" };
    });
    const result = await f.service.loginTenant(f.credentials);
    expect(result).toMatchObject({
      accessToken: `${"access"}-synthetic`,
      refreshToken: `${"refresh"}-synthetic`,
    });
    expect(f.transactionSession.create).toHaveBeenCalledOnce();
    expect(f.prisma.authSession.create).not.toHaveBeenCalled();
    expect(f.prisma.platformAuditLog.create).not.toHaveBeenCalled();
    expect(f.audit.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        action: "auth.tenant.login",
        targetType: "auth_session",
        targetId: "session-a",
        tenantId: "tenant-a",
        actorUserId: "user-a",
      },
    });
    expect(f.committed).toHaveLength(1);
  });
  it("enqueues one minimal origin-stamped export atomically when explicitly enabled", async () => {
    const f = await fixture();
    const occurredAt = new Date();
    const values: Record<string, string> = {
      TRIXUS_LOGIN_METRICS_ENABLED: "true",
      TRIXUS_LOGIN_METRICS_SOURCE_ID: "synthetic-local",
      TRIXUS_LOGIN_METRICS_ENVIRONMENT: "local",
      TRIXUS_LOGIN_METRICS_KEY: "synthetic-key-at-least-thirty-two-characters",
      TRIXUS_LOGIN_METRICS_START_AT: "2026-01-01T00:00:00.000Z",
      TRIXUS_LOGIN_METRICS_CENTRAL_URL: "https://central.invalid",
    };
    f.config.get.mockImplementation(
      (name: string) => values[name] ?? "synthetic-secret-at-least-thirty-two-characters",
    );
    f.audit.create.mockResolvedValue({ id: "audit-a", createdAt: occurredAt } as never);
    const outboxCreate = vi.fn().mockResolvedValue({});
    f.prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        authSession: f.transactionSession,
        platformAuditLog: f.audit,
        outboxEvent: { create: outboxCreate },
      }),
    );
    await f.service.loginTenant(f.credentials);
    expect(f.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadataJson: {
            loginMetricOrigin: { sourceId: "synthetic-local", environment: "local" },
          },
        }),
      }),
    );
    expect(outboxCreate).toHaveBeenCalledExactlyOnceWith({
      data: {
        tenantId: "tenant-a",
        type: "LOGIN_METRIC_V1",
        aggregateId: "audit-a",
        payload: {
          version: 1,
          sourceId: "synthetic-local",
          environment: "local",
          eventId: "audit-a",
          tenantId: "tenant-a",
          tenantKey: "synthetic",
          occurredAt: occurredAt.toISOString(),
        },
      },
    });
  });

  it("returns no tokens and does not commit when enabled outbox persistence fails", async () => {
    const f = await fixture();
    const values: Record<string, string> = {
      TRIXUS_LOGIN_METRICS_ENABLED: "true",
      TRIXUS_LOGIN_METRICS_SOURCE_ID: "synthetic-local",
      TRIXUS_LOGIN_METRICS_ENVIRONMENT: "local",
      TRIXUS_LOGIN_METRICS_KEY: "synthetic-key-at-least-thirty-two-characters",
      TRIXUS_LOGIN_METRICS_START_AT: "2026-01-01T00:00:00.000Z",
      TRIXUS_LOGIN_METRICS_CENTRAL_URL: "https://central.invalid",
    };
    f.config.get.mockImplementation(
      (name: string) => values[name] ?? "synthetic-secret-at-least-thirty-two-characters",
    );
    f.audit.create.mockResolvedValue({ id: "audit-a", createdAt: new Date() } as never);
    const outboxCreate = vi.fn().mockRejectedValue(new Error("synthetic outbox failure"));
    f.prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback({
        authSession: f.transactionSession,
        platformAuditLog: f.audit,
        outboxEvent: { create: outboxCreate },
      });
      f.committed.push(result);
      return result;
    });
    let returned: unknown;
    await expect(async () => {
      returned = await f.service.loginTenant(f.credentials);
    }).rejects.toThrow("synthetic outbox failure");
    expect(returned).toBeUndefined();
    expect(f.committed).toHaveLength(0);
    expect(f.audit.create).toHaveBeenCalledOnce();
    expect(f.transactionSession.create).toHaveBeenCalledOnce();
    expect(outboxCreate).toHaveBeenCalledOnce();
  });

  it("rejects the transaction and returns no tokens when audit persistence fails", async () => {
    const f = await fixture();
    f.audit.create.mockRejectedValue(new Error("synthetic audit failure"));
    await expect(f.service.loginTenant(f.credentials)).rejects.toThrow("synthetic audit failure");
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
    expect(f.transactionSession.create).toHaveBeenCalledOnce();
    expect(f.committed).toHaveLength(0);
  });
  it.each([1, 2])(
    "does not create an event or complete the transaction if token signing %s fails",
    async (which) => {
      const f = await fixture();
      f.jwt.signAsync.mockReset();
      if (which === 2) f.jwt.signAsync.mockResolvedValueOnce("access-synthetic");
      f.jwt.signAsync.mockRejectedValueOnce(new Error("synthetic signing failure"));
      await expect(f.service.loginTenant(f.credentials)).rejects.toThrow(
        "synthetic signing failure",
      );
      expect(f.audit.create).not.toHaveBeenCalled();
      expect(f.committed).toHaveLength(0);
    },
  );
  it("does not log an invalid credential attempt", async () => {
    const f = await fixture();
    await expect(
      f.service.loginTenant({ ...f.credentials, password: "invalid-value" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.audit.create).not.toHaveBeenCalled();
  });
  it("does not log destination selection before a tenant session is established", async () => {
    const f = await fixture();
    f.user.memberships.push({
      ...f.membership,
      id: "member-b",
      tenantId: "tenant-b",
      tenant: { ...f.membership.tenant, id: "tenant-b", slug: "tenant-b" },
    });
    await expect(f.service.loginTenant(f.credentials)).resolves.toMatchObject({
      tenantSelectionRequired: true,
    });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.audit.create).not.toHaveBeenCalled();
  });
  it("does not count refresh as another login", async () => {
    const f = await fixture();
    await f.service.loginTenant(f.credentials);
    await f.service.refresh("synthetic-refresh-token");
    expect(f.audit.create).toHaveBeenCalledOnce();
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
  });
  it("does not count impersonation as an internal login", async () => {
    const f = await fixture();
    await f.service.issueImpersonationTokens({
      actorPlatformUserId: "actor-a",
      impersonationSessionId: "impersonation-a",
      membershipId: "member-a",
    });
    expect(f.prisma.authSession.create).toHaveBeenCalledOnce();
    expect(f.audit.create).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
});
