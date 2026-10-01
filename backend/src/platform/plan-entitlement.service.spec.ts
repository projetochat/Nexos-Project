import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlanEntitlementService } from "./plan-entitlement.service";

const planFeatures = {
  chat: true,
  campaigns: true,
  tickets: true,
};

describe("PlanEntitlementService tenant overrides", () => {
  it("isolates module and limit overrides by tenant without changing the plan snapshot", async () => {
    const subscriptions = {
      "tenant-a": subscription({ campaigns: false }, { maxContacts: 25 }),
      "tenant-b": subscription({ tickets: false }, { maxContacts: 50 }),
    };
    const prisma = {
      tenantSubscription: {
        findFirst: vi.fn(
          ({ where }) => subscriptions[where.tenantId as keyof typeof subscriptions],
        ),
      },
    };
    const service = new PlanEntitlementService(prisma as never);

    await expect(service.getEntitlements("tenant-a")).resolves.toMatchObject({
      features: { chat: true, campaigns: false, tickets: true },
      limits: { maxContacts: 25 },
    });
    await expect(service.getEntitlements("tenant-b")).resolves.toMatchObject({
      features: { chat: true, campaigns: true, tickets: false },
      limits: { maxContacts: 50 },
    });
    expect(planFeatures).toEqual({ chat: true, campaigns: true, tickets: true });
  });

  it("keeps chat enabled even if malformed persisted data attempts to disable it", async () => {
    const prisma = {
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue(subscription({ chat: false }, {})),
      },
    };
    const service = new PlanEntitlementService(prisma as never);

    await expect(service.getEntitlements("tenant-a")).resolves.toMatchObject({
      features: { chat: true },
    });
  });

  it("denies a disabled module even when the plan snapshot enables it", async () => {
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", authRevokedAt: null }),
      },
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue(subscription({ tickets: false }, {})),
      },
    };
    const service = new PlanEntitlementService(prisma as never);

    await expect(service.assertFeature("tenant-a", "tickets")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.assertFeature("tenant-a", "campaigns")).resolves.toBeUndefined();
  });
});

function subscription(featureOverrides: Record<string, boolean>, limitOverrides: object) {
  return {
    id: "subscription-1",
    planId: "plan-1",
    status: "ACTIVE",
    limitsSnapshot: { maxUsers: 3, maxConnections: 1, maxContacts: 1000 },
    featuresSnapshot: { ...planFeatures },
    plan: { code: "base" },
    tenant: {
      maxUsers: null,
      maxConnections: null,
      featureOverrides,
      limitOverrides,
    },
  };
}
