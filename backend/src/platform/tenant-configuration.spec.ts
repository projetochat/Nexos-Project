import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { UpdateTenantConfigurationDto } from "./platform.dto";
import { PlatformService } from "./platform.service";

const actor = {
  userId: "platform-admin",
  tenantId: "",
  membershipId: "",
  roleId: "",
  roleKey: "platform_admin",
  platformRole: "ADMIN" as const,
  context: "platform" as const,
};

describe("tenant configuration", () => {
  it("rejects disabling the mandatory chat module", async () => {
    const dto = plainToInstance(UpdateTenantConfigurationDto, {
      modules: { chat: false },
    });
    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
  });

  it("updates only the selected tenant and preserves plan records", async () => {
    const tenant = {
      id: "tenant-a",
      maxUsers: null,
      maxConnections: null,
      featureOverrides: { campaigns: true },
      limitOverrides: { maxContacts: 100 },
    };
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue(tenant),
        update: vi.fn().mockResolvedValue({ ...tenant, featureOverrides: { campaigns: false } }),
      },
      plan: { update: vi.fn() },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const entitlements = {
      getEntitlements: vi.fn().mockResolvedValue({
        features: { chat: true, campaigns: false, tickets: true },
        limits: { maxUsers: 3, maxConnections: 1, maxContacts: 250 },
      }),
    };
    const service = new PlatformService(
      prisma as never,
      audit as never,
      entitlements as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateTenantConfiguration(
        "tenant-a",
        {
          modules: { campaigns: false },
          limits: { maxContacts: 250 },
        },
        actor,
      ),
    ).resolves.toMatchObject({
      tenantId: "tenant-a",
      modules: { chat: true, campaigns: false, tickets: true },
      lockedModules: ["chat"],
      limits: { maxContacts: 250 },
    });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-a" },
      data: expect.objectContaining({
        featureOverrides: { campaigns: false },
        limitOverrides: { maxContacts: 250 },
      }),
    });
    expect(prisma.plan.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a", action: "tenant.configuration.updated" }),
    );
  });

  it("removes a limit override with null and exposes the inherited effective value", async () => {
    const prisma = {
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: "tenant-a",
            maxUsers: null,
            maxConnections: null,
            featureOverrides: {},
            limitOverrides: { maxContacts: 25 },
          })
          .mockResolvedValueOnce({
            id: "tenant-a",
            maxUsers: null,
            maxConnections: null,
            featureOverrides: {},
            limitOverrides: {},
          }),
        update: vi.fn().mockResolvedValue({ id: "tenant-a" }),
      },
    };
    const entitlements = {
      getEntitlements: vi.fn().mockResolvedValue({
        features: { chat: true, campaigns: true, tickets: true },
        limits: { maxContacts: 1000 },
      }),
    };
    const service = new PlatformService(
      prisma as never,
      { record: vi.fn() } as never,
      entitlements as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateTenantConfiguration("tenant-a", { limits: { maxContacts: null } }, actor),
    ).resolves.toMatchObject({ limits: { maxContacts: 1000 }, overrides: { limits: {} } });
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ limitOverrides: {} }) }),
    );
  });
});
