import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";

function challenge(verifier: string) {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function fixture() {
  const verifier = "v".repeat(43);
  const session = {
    id: "impersonation-1",
    actorUserId: "platform-1",
    tenantId: "tenant-1",
    impersonatedMembershipId: "membership-1",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 10 * 60_000),
    handoffChallenge: challenge(verifier),
    handoffExpiresAt: new Date(Date.now() + 60_000),
    handoffConsumedAt: null,
    actor: { id: "platform-1", name: "Platform", email: "platform@example.test" },
    tenant: { id: "tenant-1", slug: "tenant", name: "Tenant" },
  };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ platformRole: "ADMIN" }),
    },
    impersonationSession: {
      findUnique: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const auth = {
    issueImpersonationTokens: vi.fn().mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      tenant: session.tenant,
    }),
  };
  const service = new PlatformService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    auth as never,
  );
  return { service, prisma, auth, verifier, session };
}

describe("cross-origin impersonation handoff", () => {
  it("creates the handoff secret atomically with the impersonation session", async () => {
    const tx = {
      impersonationSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(({ data }) => ({
          id: "impersonation-1",
          expiresAt: data.expiresAt,
          ...data,
        })),
      },
    };
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "membership-1",
          tenant: { id: "tenant-1", slug: "tenant", name: "Tenant" },
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new PlatformService(
      prisma as never,
      audit as never,
      {} as never,
      { get: vi.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.startImpersonationHandoff(
      {
        tenantId: "tenant-1",
        membershipId: "membership-1",
        reason: "Suporte autorizado",
        codeChallenge: "challenge".repeat(6),
      },
      {
        userId: "platform-1",
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "platform_admin",
        platformRole: "ADMIN",
      },
    );

    expect(tx.impersonationSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "platform-1",
        handoffCodeHash: expect.any(String),
        handoffChallenge: "challenge".repeat(6),
        handoffExpiresAt: expect.any(Date),
      }),
    });
    expect(result).toMatchObject({ code: expect.any(String), tenant: { id: "tenant-1" } });
    expect(audit.record).toHaveBeenCalledOnce();
  });

  it("consumes a valid PKCE-protected code exactly once before issuing tenant tokens", async () => {
    const f = fixture();
    const result = await f.service.exchangeImpersonationHandoff({
      code: "c".repeat(43),
      codeVerifier: f.verifier,
    });

    expect(f.prisma.impersonationSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: f.session.id,
          status: "ACTIVE",
          handoffConsumedAt: null,
        }),
      }),
    );
    expect(f.auth.issueImpersonationTokens).toHaveBeenCalledWith({
      actorPlatformUserId: "platform-1",
      impersonationSessionId: "impersonation-1",
      membershipId: "membership-1",
    });
    expect(result).toMatchObject({
      accessToken: "access",
      impersonation: { id: "impersonation-1" },
    });
  });

  it("rejects a verifier that does not match without consuming or issuing tokens", async () => {
    const f = fixture();
    await expect(
      f.service.exchangeImpersonationHandoff({
        code: "c".repeat(43),
        codeVerifier: "x".repeat(43),
      }),
    ).rejects.toMatchObject({ response: { code: "IMPERSONATION_HANDOFF_INVALID" } });
    expect(f.prisma.impersonationSession.updateMany).not.toHaveBeenCalled();
    expect(f.auth.issueImpersonationTokens).not.toHaveBeenCalled();
  });

  it("rejects replay when the atomic consume loses the race", async () => {
    const f = fixture();
    f.prisma.impersonationSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.exchangeImpersonationHandoff({
        code: "c".repeat(43),
        codeVerifier: f.verifier,
      }),
    ).rejects.toMatchObject({ response: { code: "IMPERSONATION_HANDOFF_INVALID" } });
    expect(f.auth.issueImpersonationTokens).not.toHaveBeenCalled();
  });

  it("rate limits repeated invalid handoff codes before another database lookup", async () => {
    const f = fixture();
    f.prisma.impersonationSession.findUnique.mockResolvedValue(null);
    const input = { code: "z".repeat(43), codeVerifier: f.verifier };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(f.service.exchangeImpersonationHandoff(input)).rejects.toMatchObject({
        response: { code: "IMPERSONATION_HANDOFF_INVALID" },
      });
    }
    await expect(f.service.exchangeImpersonationHandoff(input)).rejects.toMatchObject({
      status: 429,
      response: { code: "TOO_MANY_HANDOFF_ATTEMPTS" },
    });
    expect(f.prisma.impersonationSession.findUnique).toHaveBeenCalledTimes(5);
  });

  it("stops only the impersonation carried by the authenticated tenant session", async () => {
    const f = fixture();
    await expect(
      f.service.stopCurrentImpersonation({
        userId: "tenant-user",
        tenantId: "tenant-1",
        membershipId: "membership-1",
        roleId: "role-1",
        roleKey: "agent",
        platformRole: "USER",
        impersonationSessionId: "impersonation-1",
        actorPlatformUserId: "platform-1",
      }),
    ).resolves.toMatchObject({ id: "impersonation-1" });
    expect(f.prisma.impersonationSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "impersonation-1",
          actorUserId: "platform-1",
          status: "ACTIVE",
        },
      }),
    );
    expect(f.prisma.platformAuditLog.create).toHaveBeenCalledOnce();
    expect(f.prisma.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorPlatformRole: "ADMIN" }) }),
    );
  });
});
