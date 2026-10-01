import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PlanEntitlementService } from "./plan-entitlement.service";
import { TenantFeatureGuard } from "./tenant-feature.guard";

describe("TenantFeatureGuard", () => {
  it("resolves its dependencies through the Nest container", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        TenantFeatureGuard,
        { provide: PlanEntitlementService, useValue: { assertFeature: vi.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(TenantFeatureGuard)).toBeInstanceOf(TenantFeatureGuard);
    await moduleRef.close();
  });

  it("enforces the requested module against the authenticated tenant", async () => {
    const entitlements = {
      assertFeature: vi.fn().mockRejectedValue(new ForbiddenException()),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue("campaigns"),
    };
    const guard = new TenantFeatureGuard(reflector as unknown as Reflector, entitlements as never);
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { tenantId: "tenant-disabled" } }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(entitlements.assertFeature).toHaveBeenCalledWith("tenant-disabled", "campaigns");
  });

  it("does not authorize a tenantless request", async () => {
    const entitlements = { assertFeature: vi.fn() };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue("tickets") };
    const guard = new TenantFeatureGuard(reflector as unknown as Reflector, entitlements as never);
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(false);
    expect(entitlements.assertFeature).not.toHaveBeenCalled();
  });
});
