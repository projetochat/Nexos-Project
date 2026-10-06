import { describe, expect, it, vi } from "vitest";
import { OnboardingService } from "./onboarding.service";

const admin = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-admin",
  roleKey: "tenant_admin",
  platformRole: "USER",
  surface: "tenant",
} as const;

function row(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    status: "PENDING",
    currentStep: 2,
    maxCompletedStep: 1,
    version: 3,
    startedAt: new Date("2026-10-05T12:00:00Z"),
    completedAt: null,
    createdAt: new Date("2026-10-05T12:00:00Z"),
    updatedAt: new Date("2026-10-05T12:00:00Z"),
    ...overrides,
  };
}

function database(queryResults: unknown[][]) {
  const tx = {
    $queryRaw: vi.fn(),
    messagingConnection: { count: vi.fn().mockResolvedValue(1) },
    department: { count: vi.fn().mockResolvedValue(1) },
    role: { count: vi.fn().mockResolvedValue(1) },
    tenantMembership: { count: vi.fn().mockResolvedValue(1) },
  };
  for (const result of queryResults) tx.$queryRaw.mockResolvedValueOnce(result);
  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    },
  };
}

describe("OnboardingService", () => {
  it("treats a tenant without state as legacy and already released", async () => {
    const { prisma } = database([[]]);
    const result = await new OnboardingService(prisma as never).status(admin as never);

    expect(result).toMatchObject({
      required: false,
      status: "not_required",
      version: null,
      canManage: false,
      progress: { currentStep: 8, maxCompletedStep: 8, totalSteps: 8 },
    });
    expect(prisma.messagingConnection.count).not.toHaveBeenCalled();
  });

  it("keeps progress monotonic and increments the locked version", async () => {
    const updated = row({ currentStep: 4, maxCompletedStep: 3, version: 4 });
    const { prisma, tx } = database([[row({ currentStep: 3, maxCompletedStep: 2 })], [updated]]);
    const result = await new OnboardingService(prisma as never).updateProgress(
      { currentStep: 4, maxCompletedStep: 3, version: 3 },
      admin as never,
    );

    expect(result).toMatchObject({
      status: "pending",
      version: 4,
      progress: { currentStep: 4, maxCompletedStep: 3 },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale writer and returns the current server state", async () => {
    const { prisma, tx } = database([[row({ version: 5 })]]);
    await expect(
      new OnboardingService(prisma as never).updateProgress(
        { currentStep: 3, maxCompletedStep: 2, version: 4 },
        admin as never,
      ),
    ).rejects.toMatchObject({
      response: { code: "ONBOARDING_VERSION_CONFLICT", current: { version: 5 } },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects jumping over more than one completed step", async () => {
    const { prisma, tx } = database([[row({ maxCompletedStep: 1, currentStep: 2 })]]);
    await expect(
      new OnboardingService(prisma as never).updateProgress(
        { currentStep: 4, maxCompletedStep: 3, version: 3 },
        admin as never,
      ),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_STEP_SEQUENCE_REQUIRED" } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("validates the connected instance before completing step two", async () => {
    const { prisma, tx } = database([[row({ maxCompletedStep: 1, currentStep: 2 })]]);
    tx.messagingConnection.count.mockResolvedValue(0);
    await expect(
      new OnboardingService(prisma as never).updateProgress(
        { currentStep: 3, maxCompletedStep: 2, version: 3 },
        admin as never,
      ),
    ).rejects.toMatchObject({
      response: { code: "ONBOARDING_STEP_REQUIREMENT_NOT_MET", step: 2 },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("does not complete when a mandatory server-side requirement is missing", async () => {
    const { prisma, tx } = database([[row({ currentStep: 8, maxCompletedStep: 7 })]]);
    tx.messagingConnection.count.mockResolvedValue(0);

    await expect(
      new OnboardingService(prisma as never).complete({ version: 3 }, admin as never),
    ).rejects.toMatchObject({
      response: {
        code: "ONBOARDING_REQUIREMENTS_NOT_MET",
        checklist: { instanceConnected: false },
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects direct completion before the review sequence reaches step eight", async () => {
    const { prisma, tx } = database([[row({ currentStep: 7, maxCompletedStep: 6 })]]);
    await expect(
      new OnboardingService(prisma as never).complete({ version: 3 }, admin as never),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_STEP_SEQUENCE_REQUIRED" } });
    expect(tx.messagingConnection.count).not.toHaveBeenCalled();
  });

  it("completes with zero optional messages or tags after validating mandatory records", async () => {
    const completed = row({
      status: "COMPLETED",
      currentStep: 8,
      maxCompletedStep: 8,
      version: 4,
      completedAt: new Date("2026-10-05T13:00:00Z"),
    });
    const { prisma, tx } = database([[row({ currentStep: 8, maxCompletedStep: 7 })], [completed]]);
    const result = await new OnboardingService(prisma as never).complete(
      { version: 3 },
      admin as never,
    );

    expect(result).toMatchObject({
      status: "completed",
      checklist: { quickRepliesReviewed: true, tagsReviewed: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("returns a completed state idempotently before comparing an old version", async () => {
    const completed = row({
      status: "COMPLETED",
      currentStep: 8,
      maxCompletedStep: 8,
      version: 7,
      completedAt: new Date("2026-10-05T13:00:00Z"),
    });
    const { prisma, tx } = database([[completed]]);
    const result = await new OnboardingService(prisma as never).complete(
      { version: 1 },
      admin as never,
    );

    expect(result).toMatchObject({ status: "completed", version: 7 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("never lets a regular profile mutate onboarding state", async () => {
    const { prisma } = database([]);
    await expect(
      new OnboardingService(prisma as never).updateProgress(
        { currentStep: 2, maxCompletedStep: 1, version: 1 },
        { ...admin, roleKey: "agent" } as never,
      ),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_ADMIN_REQUIRED" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not let a platform impersonation operate the tenant wizard", async () => {
    const { prisma } = database([]);
    await expect(
      new OnboardingService(prisma as never).updateProgress(
        { currentStep: 2, maxCompletedStep: 1, version: 1 },
        { ...admin, impersonationSessionId: "impersonation-a" } as never,
      ),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_ADMIN_REQUIRED" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
