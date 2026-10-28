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
    $queryRaw: vi.fn(),
    messagingConnection: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([{ id: "connection-a" }]),
    },
    department: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue({
        id: "department-a",
        connections: [{ connectionId: "connection-a" }],
      }),
      findMany: vi.fn().mockResolvedValue([{ id: "tenant-a:atendimento", name: "Atendimento" }]),
    },
    departmentConnection: { upsert: vi.fn().mockResolvedValue({}) },
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
  it("does not read checklist or write progress while Chat is disabled, and resumes saved pending state", async () => {
    const { prisma } = database([[row()]]);
    const subscription = await prisma.tenantSubscription.findFirst();
    prisma.tenantSubscription.findFirst.mockClear();
    prisma.tenantSubscription.findFirst.mockResolvedValue({
      ...subscription,
      featuresSnapshot: { chat: false },
    });
    const service = new OnboardingService(prisma as never);
    await expect(service.status(admin as never)).resolves.toMatchObject({
      required: false,
      status: "not_required",
      version: null,
    });
    await expect(
      service.updateProgress({ currentStep: 2, maxCompletedStep: 1, version: 3 }, admin as never),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_NOT_REQUIRED" } });
    await expect(service.complete({ version: 3 }, admin as never)).rejects.toMatchObject({
      response: { code: "ONBOARDING_NOT_REQUIRED" },
    });
    await expect(
      service.ensureDefaultDepartmentConnection("connection-a", admin as never),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_NOT_REQUIRED" } });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.count).not.toHaveBeenCalled();
    expect(prisma.department.count).not.toHaveBeenCalled();
    prisma.tenantSubscription.findFirst.mockResolvedValue(subscription);
    await expect(service.status(admin as never)).resolves.toMatchObject({
      required: true,
      status: "pending",
      version: 3,
      progress: { currentStep: 2, maxCompletedStep: 1 },
    });
  });

  it("does not release onboarding when entitlement lookup fails", async () => {
    const { prisma } = database([[row()]]);
    prisma.tenantSubscription.findFirst.mockRejectedValue(
      new Error("isolated entitlement failure"),
    );
    await expect(new OnboardingService(prisma as never).status(admin as never)).rejects.toThrow(
      "isolated entitlement failure",
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

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

  it("repairs the seeded department link before completing the department step", async () => {
    const updated = row({ currentStep: 4, maxCompletedStep: 3, version: 4 });
    const { prisma, tx } = database([[row({ currentStep: 3, maxCompletedStep: 2 })], [updated]]);
    tx.department.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "tenant-a:atendimento" });

    await new OnboardingService(prisma as never).updateProgress(
      { currentStep: 4, maxCompletedStep: 3, version: 3 },
      admin as never,
    );

    expect(tx.departmentConnection.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_departmentId_connectionId: {
          tenantId: "tenant-a",
          departmentId: "tenant-a:atendimento",
          connectionId: "connection-a",
        },
      },
      create: {
        tenantId: "tenant-a",
        departmentId: "tenant-a:atendimento",
        connectionId: "connection-a",
      },
      update: {},
    });
  });

  it("repairs an affected completed tenant only for the selected connected instance", async () => {
    const { prisma, tx } = database([]);
    tx.department.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "tenant-a:atendimento" });

    const result = await new OnboardingService(prisma as never).ensureDefaultDepartmentConnection(
      "connection-a",
      admin as never,
    );

    expect(result).toEqual({
      departmentId: "tenant-a:atendimento",
      connectionId: "connection-a",
      repaired: true,
    });
    expect(tx.messagingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a", id: "connection-a" }),
        take: 1,
      }),
    );
  });

  it("reuses a legacy Atendimento department whose id is not the seeded id", async () => {
    const { prisma, tx } = database([]);
    tx.department.findFirst.mockResolvedValueOnce(null);
    tx.department.findMany.mockResolvedValueOnce([
      { id: "legacy-department-uuid", name: "  ATENDIMENTO  " },
    ]);

    await expect(
      new OnboardingService(prisma as never).ensureDefaultDepartmentConnection(
        "connection-a",
        admin as never,
      ),
    ).resolves.toEqual({
      departmentId: "legacy-department-uuid",
      connectionId: "connection-a",
      repaired: true,
    });

    expect(tx.departmentConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          tenantId: "tenant-a",
          departmentId: "legacy-department-uuid",
          connectionId: "connection-a",
        },
      }),
    );
  });

  it("does not expose the recovery operation to a regular profile", async () => {
    const { prisma } = database([]);

    await expect(
      new OnboardingService(prisma as never).ensureDefaultDepartmentConnection("connection-a", {
        ...admin,
        roleKey: "agent",
      } as never),
    ).rejects.toMatchObject({ response: { code: "ONBOARDING_ADMIN_REQUIRED" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it("marks Etiquetas reviewed at step six before Mensagens Rápidas at step seven", async () => {
    const { prisma } = database([[row({ currentStep: 7, maxCompletedStep: 6 })]]);

    const result = await new OnboardingService(prisma as never).status(admin as never);

    expect(result.checklist).toMatchObject({
      tagsReviewed: true,
      quickRepliesReviewed: false,
    });
    expect(prisma.department.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        active: true,
        connections: expect.any(Object),
      }),
    });
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
