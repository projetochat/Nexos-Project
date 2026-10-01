import { describe, expect, it, vi } from "vitest";
import { compare } from "bcryptjs";
import { PlatformService } from "./platform.service";

describe("PlatformService health", () => {
  it("reports Redis-backed queues as degraded without failing the control plane", async () => {
    const service = new PlatformService(
      { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) } as never,
      {} as never,
      {} as never,
      { get: vi.fn().mockReturnValue("true") } as never,
      { health: vi.fn().mockResolvedValue({ ok: false, configured: true }) } as never,
      {
        enabled: vi.fn().mockReturnValue(true),
        health: vi.fn().mockResolvedValue({ ok: false, configured: true }),
      } as never,
      { health: vi.fn().mockReturnValue({ status: "degraded", adapter: "memory" }) } as never,
      { provider: "local" } as never,
      {} as never,
    );

    await expect(service.health()).resolves.toMatchObject({
      ok: true,
      database: "up",
      redis: "down",
      outboundQueue: { status: "down", configured: true },
      campaignQueue: { status: "down", configured: true },
      workers: { outbound: "configured", campaign: "configured" },
      realtime: { status: "degraded", adapter: "memory" },
      storage: { status: "up", provider: "local" },
      campaignScheduler: "configured",
    });
  });

  it("creates another subscription when the client already has one in progress", async () => {
    const subscription = {
      id: "subscription-1",
      tenantId: null,
      planId: "plan-1",
      status: "REGISTERING",
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      platformClient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "client-1",
          tenantId: "tenant-1",
          status: "ACTIVE",
        }),
      },
      tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-1" }) },
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue({ id: "subscription-existing" }),
        create: vi.fn().mockResolvedValue(subscription),
      },
      subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new PlatformService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, "activePlanOrThrow" as never).mockResolvedValue({
      id: "plan-1",
      priceCents: 29999,
      limits: {},
      features: {},
    } as never);
    vi.spyOn(service, "settings").mockResolvedValue({
      defaultTrialDays: 14,
      defaultSubscriptionPeriodDays: 30,
      defaultCurrency: "BRL",
    } as never);
    vi.spyOn(service, "subscriptionDetail").mockResolvedValue(subscription as never);

    await expect(
      service.createClientSubscription(
        "client-1",
        {
          planId: "plan-1",
          startsAt: "2026-09-29T00:00:00.000Z",
          indefinite: true,
          monthlyValueCents: 29999,
          reason: "Primeiro teste",
        },
        {
          userId: "platform-admin",
          tenantId: "",
          membershipId: "",
          roleId: "",
          roleKey: "platform_admin",
          platformRole: "ADMIN",
          context: "platform",
        },
      ),
    ).resolves.toEqual(subscription);

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.tenantSubscription.findFirst).not.toHaveBeenCalled();
    expect(tx.tenantSubscription.create).toHaveBeenCalledOnce();
    expect(tx.tenantSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: null, status: "REGISTERING" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "client.subscription.created",
        targetId: "subscription-1",
      }),
    );
  });

  it("releases an invoice without requiring a paid amount", async () => {
    const existing = {
      id: "invoice-1",
      tenantId: null,
      subscriptionId: "subscription-1",
      status: "OPEN",
      subtotalCents: 30000,
      discountCents: 0,
      totalCents: 30000,
      paidCents: 0,
      released: false,
      releasedAt: null,
      paidAt: null,
      dueAt: new Date("2026-10-10T12:00:00.000Z"),
      referenceDate: new Date("2026-09-29T12:00:00.000Z"),
      reference: "09/2026",
      couponCode: null,
      notes: null,
    };
    const tx = {
      invoice: {
        update: vi.fn().mockResolvedValue({ ...existing, status: "RELEASED", released: true }),
      },
      tenantSubscription: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new PlatformService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateInvoice("invoice-1", { released: true }, actor()),
    ).resolves.toMatchObject({ status: "RELEASED", released: true, paidCents: 0 });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidCents: 0,
          released: true,
          status: "RELEASED",
          paidAt: null,
        }),
      }),
    );
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "FINANCE_RELEASED" },
    });
  });

  it("cancels a subscription by terminating and preserving its tenant", async () => {
    const existing = {
      id: "subscription-1",
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "ACTIVE",
      tenant: { id: "tenant-1" },
    };
    const updated = { ...existing, status: "CANCELLED" };
    const tx = {
      tenantSubscription: { update: vi.fn().mockResolvedValue(updated) },
      tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-1", status: "TERMINATED" }) },
      subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);

    await expect(
      service.cancelSubscription("subscription-1", { reason: "Contrato encerrado" }, actor()),
    ).resolves.toEqual(updated);

    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: expect.objectContaining({
        status: "TERMINATED",
        suspensionReason: "Contrato encerrado",
      }),
    });
    expect(tx.subscriptionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        previousStatus: "ACTIVE",
        nextStatus: "CANCELLED",
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", action: "subscription.cancelled" }),
    );
  });

  it("reactivates a suspended subscription using the existing tenant", async () => {
    const existing = {
      id: "subscription-1",
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "SUSPENDED",
      client: { id: "client-1" },
      plan: { id: "plan-1" },
      invoices: [],
    };
    const detail = { ...existing, status: "ACTIVE" };
    const tx = {
      tenantSubscription: { update: vi.fn().mockResolvedValue(detail) },
      tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-1", status: "ACTIVE" }) },
      subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);
    vi.spyOn(service, "subscriptionDetail").mockResolvedValue(detail as never);

    await expect(service.activateSubscription("subscription-1", actor())).resolves.toEqual(detail);
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "ACTIVE", suspensionReason: null },
    });
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        suspendedAt: null,
        suspensionReason: null,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", action: "subscription.reactivated" }),
    );
  });

  it("creates the tenant administrator with a temporary password without sending e-mail", async () => {
    const existing = {
      id: "subscription-1",
      tenantId: null,
      clientId: "client-1",
      planId: "plan-1",
      status: "FINANCE_RELEASED",
      limitsSnapshot: { maxUsers: 3, maxConnections: 1 },
      client: {
        id: "client-1",
        name: "Empresa Teste",
        responsibleName: "Ana Admin",
        responsibleEmail: "ANA@example.com",
        document: "12345678000190",
        status: "ACTIVE",
      },
      plan: { id: "plan-1" },
      invoices: [{ id: "invoice-1", released: true }],
    };
    const createdTenant = { id: "tenant-1", name: "Empresa Teste", slug: "empresa-teste" };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      platformClient: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdTenant),
      },
      permission: { upsert: vi.fn().mockResolvedValue({}) },
      role: {
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: create.id })),
      },
      rolePermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({ id: "admin-user-1", ...data })),
      },
      tenantMembership: { create: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      userInvitation: { create: vi.fn().mockResolvedValue({ id: "invitation-1" }) },
      tenantSubscription: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({}),
      },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendTenantAdministratorInvitation: vi.fn().mockResolvedValue({ delivered: true }),
    };
    const service = platformService(prisma, audit, email);
    vi.spyOn(service, "subscriptionDetail").mockResolvedValue({ id: "subscription-1" } as never);

    await expect(service.activateSubscription("subscription-1", actor())).resolves.toEqual({
      id: "subscription-1",
    });

    const administratorData = tx.user.create.mock.calls[0]?.[0].data;
    expect(administratorData).toMatchObject({
      email: "ana@example.com",
      name: "Ana Admin",
      status: "ACTIVE",
    });
    await expect(compare("Trixus@2026", administratorData.passwordHash)).resolves.toBe(true);
    expect(tx.tenantMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        userId: "admin-user-1",
        roleId: "tenant-1:tenant_admin",
      }),
    });
    expect(tx.userInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          email: "ana@example.com",
          roleId: "tenant-1:tenant_admin",
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(email.assertInvitationDeliveryReady).not.toHaveBeenCalled();
    expect(email.sendTenantAdministratorInvitation).not.toHaveBeenCalled();
    expect(tx.platformClient.findUnique).not.toHaveBeenCalled();
    expect(tx.platformClient.update).not.toHaveBeenCalled();
  });

  it("creates a distinct tenant for another subscription and links the existing administrator", async () => {
    const existing = {
      id: "subscription-2",
      tenantId: null,
      clientId: "client-1",
      planId: "plan-2",
      status: "FINANCE_RELEASED",
      limitsSnapshot: { maxUsers: 8, maxConnections: 3 },
      client: {
        id: "client-1",
        name: "Empresa Teste",
        responsibleName: "Ana Admin",
        responsibleEmail: "ana@example.com",
        document: "12345678000190",
        status: "ACTIVE",
      },
      plan: { id: "plan-2" },
      invoices: [{ id: "invoice-2", released: true }],
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenantSubscription: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({}),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValueOnce({ id: "tenant-1" }).mockResolvedValueOnce(null),
        create: vi.fn().mockImplementation(({ data }) => ({ id: "tenant-2", ...data })),
      },
      permission: { upsert: vi.fn().mockResolvedValue({}) },
      role: {
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: create.id })),
      },
      rolePermission: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "admin-user-1",
          status: "ACTIVE",
          platformRole: "USER",
          memberships: [
            {
              tenant: {
                subscriptions: [{ clientId: "client-1" }],
              },
            },
          ],
        }),
        create: vi.fn(),
      },
      tenantMembership: { create: vi.fn().mockResolvedValue({ id: "membership-2" }) },
      userInvitation: { create: vi.fn() },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      subscriptionHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendTenantAdministratorInvitation: vi.fn(),
    };
    const service = platformService(prisma, audit, email);
    vi.spyOn(service, "subscriptionDetail").mockResolvedValue({ id: "subscription-2" } as never);

    await expect(service.activateSubscription("subscription-2", actor())).resolves.toEqual({
      id: "subscription-2",
    });

    expect(tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "empresa-teste-2",
          maxUsers: 8,
          maxConnections: 3,
        }),
      }),
    );
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-2" },
      data: { tenantId: "tenant-2", status: "ACTIVE" },
    });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { subscriptionId: "subscription-2" },
      data: { tenantId: "tenant-2" },
    });
    expect(tx.tenantMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-2",
        userId: "admin-user-1",
        roleId: "tenant-2:tenant_admin",
      }),
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userInvitation.create).not.toHaveBeenCalled();
    expect(email.sendTenantAdministratorInvitation).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-2",
        metadata: {
          administratorProvisioning: "existing_user_linked",
          passwordChangeRequired: false,
        },
      }),
    );
  });

  it("synchronizes tenant administrator credentials atomically without exposing the password", async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    const membershipUpdate = vi.fn().mockResolvedValue({});
    const tenantUpdate = vi.fn().mockResolvedValue({
      responsibleName: "Novo Responsável",
      responsibleEmail: "novo@example.com",
    });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant-1",
          status: "ACTIVE",
          responsibleName: "Responsável Antigo",
          responsibleEmail: "antigo@example.com",
          users: [
            {
              id: "membership-1",
              userId: "user-1",
              user: {
                memberships: [{ tenantId: "tenant-1", status: "ACTIVE" }],
              },
            },
          ],
        }),
        update: tenantUpdate,
      },
      user: { findUnique: vi.fn().mockResolvedValue(null), update: userUpdate },
      tenantMembership: { update: membershipUpdate },
      passwordResetToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      platformAuditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    const result = await service.updateTenantAdministratorCredentials(
      "tenant-1",
      {
        responsibleName: "  Novo Responsável  ",
        responsibleEmail: "NOVO@example.com",
        newPassword: "senha-segura",
      },
      actor(),
    );

    const userData = userUpdate.mock.calls[0]?.[0].data;
    expect(userData).toMatchObject({ name: "Novo Responsável", email: "novo@example.com" });
    await expect(compare("senha-segura", userData.passwordHash)).resolves.toBe(true);
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { presentationName: "Novo Responsável" },
    });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: expect.objectContaining({
        responsibleName: "Novo Responsável",
        responsibleEmail: "novo@example.com",
        technicalEmail: "novo@example.com",
        authRevokedAt: expect.any(Date),
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "tenant.administrator_credentials.updated",
        metadataJson: expect.objectContaining({ passwordChanged: true }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        responsibleName: "Novo Responsável",
        responsibleEmail: "novo@example.com",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("senha-segura");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
  });

  it("rejects credential changes for an administrator shared with another tenant", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant-1",
          status: "ACTIVE",
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
          users: [
            {
              id: "membership-1",
              userId: "user-1",
              user: {
                memberships: [
                  { tenantId: "tenant-1", status: "ACTIVE" },
                  { tenantId: "tenant-2", status: "ACTIVE" },
                ],
              },
            },
          ],
        }),
      },
      user: { findUnique: vi.fn(), update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(
      service.updateTenantAdministratorCredentials(
        "tenant-1",
        {
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
        },
        actor(),
      ),
    ).rejects.toThrow("O administrador está vinculado a outra empresa");
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects credential management when the tenant is not active", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant-1",
          status: "TERMINATED",
          users: [],
        }),
      },
      user: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(
      service.updateTenantAdministratorCredentials(
        "tenant-1",
        {
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
        },
        actor(),
      ),
    ).rejects.toThrow("só podem ser gerenciadas em uma Tenant ativa");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("provisions the administrator when a legacy tenant only has a pending invitation", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant-1",
          status: "ACTIVE",
          responsibleName: "Responsável antigo",
          responsibleEmail: "antigo@example.com",
          users: [],
        }),
        update: vi.fn().mockResolvedValue({
          responsibleName: "Natã Rabelo",
          responsibleEmail: "nata.rabelo@gmail.com",
        }),
      },
      role: { findFirst: vi.fn().mockResolvedValue({ id: "role-admin" }) },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({ id: "user-admin", ...data })),
      },
      tenantMembership: {
        create: vi.fn().mockResolvedValue({ id: "membership-admin" }),
      },
      userInvitation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "required-password-marker" }),
      },
      platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(
      service.updateTenantAdministratorCredentials(
        "tenant-1",
        {
          responsibleName: "Natã Rabelo",
          responsibleEmail: "nata.rabelo@gmail.com",
          newPassword: "SenhaInicial@2026",
        },
        actor(),
      ),
    ).resolves.toMatchObject({ ok: true, responsibleEmail: "nata.rabelo@gmail.com" });

    const createdUser = tx.user.create.mock.calls[0]?.[0].data;
    await expect(compare("SenhaInicial@2026", createdUser.passwordHash)).resolves.toBe(true);
    expect(tx.tenantMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-admin",
        roleId: "role-admin",
      }),
    });
    expect(tx.userInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REVOKED" }) }),
    );
    expect(tx.userInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "nata.rabelo@gmail.com",
          roleId: "role-admin",
        }),
      }),
    );
  });

  it("does not fall back to the known temporary password in invitation-only mode", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tenant-1",
          status: "ACTIVE",
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
          users: [],
        }),
      },
      user: { findUnique: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PlatformService(
      prisma as never,
      { record: vi.fn() } as never,
      {} as never,
      {
        get: vi.fn((name: string) =>
          name === "TENANT_ADMIN_PROVISIONING_MODE" ? "invitation_email" : undefined,
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateTenantAdministratorCredentials(
        "tenant-1",
        {
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
        },
        actor(),
      ),
    ).rejects.toThrow("Informe uma senha inicial ou utilize o fluxo de convite");
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("selects only safe user fields when returning tenant details", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "tenant-1",
      name: "Tenant",
      slug: "tenant",
      status: "ACTIVE",
      createdAt: new Date("2026-09-30T12:00:00.000Z"),
      updatedAt: new Date("2026-09-30T12:00:00.000Z"),
      subscriptions: [],
      users: [
        {
          id: "membership-1",
          user: { id: "user-1", email: "admin@example.com", name: "Admin" },
        },
      ],
      platformClient: null,
    });
    const service = new PlatformService(
      { tenant: { findUnique } } as never,
      {} as never,
      { getUsage: vi.fn().mockResolvedValue({}) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.tenantDetail("tenant-1");
    const userSelect = findUnique.mock.calls[0]?.[0].include.users.select.user.select;
    expect(userSelect).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
  });

  it("does not generate finance for a cancelled subscription", async () => {
    const prisma = {
      tenantSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          id: "subscription-1",
          status: "CANCELLED",
          invoices: [],
          client: { id: "client-1" },
        }),
      },
      $transaction: vi.fn(),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(service.generateSubscriptionFinance("subscription-1", actor())).rejects.toThrow(
      "Financeiro não pode ser gerado no estado atual.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a prospecting client without a CNPJ", async () => {
    const created = { id: "client-1", status: "PROSPECTING", document: null };
    const prisma = {
      platformClient: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);

    await expect(
      service.createClient(
        {
          name: "Cliente em prospecção",
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
          city: "Goiânia",
          state: "GO",
          status: "PROSPECTING",
        },
        actor(),
      ),
    ).resolves.toEqual(created);

    expect(prisma.platformClient.findUnique).not.toHaveBeenCalled();
    expect(prisma.platformClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ document: null, status: "PROSPECTING" }),
      }),
    );
  });

  it("keeps CNPJ required for clients outside prospecting", async () => {
    const prisma = { platformClient: { findUnique: vi.fn(), create: vi.fn() } };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(
      service.createClient(
        {
          name: "Cliente ativo",
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
          city: "Goiânia",
          state: "GO",
          status: "ACTIVE",
        },
        actor(),
      ),
    ).rejects.toThrow("Informe um CNPJ válido para o cliente.");
    expect(prisma.platformClient.create).not.toHaveBeenCalled();
  });

  it("deletes and audits a client that has never been used by a subscription atomically", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      platformClient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "client-1",
          name: "Cliente novo",
          document: "00000000000000",
          status: "ACTIVE",
          tenantId: null,
          _count: { subscriptions: 0 },
        }),
        delete: vi.fn().mockResolvedValue({ id: "client-1" }),
      },
      platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(service.deleteClient("client-1", actor())).resolves.toEqual({
      id: "client-1",
      deleted: true,
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.platformClient.delete).toHaveBeenCalledWith({ where: { id: "client-1" } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform_client.deleted",
          targetId: "client-1",
        }),
      }),
    );
  });

  it("preserves a client that has any subscription history", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      platformClient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "client-1",
          _count: { subscriptions: 1 },
        }),
        delete: vi.fn(),
      },
      platformAuditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(service.deleteClient("client-1", actor())).rejects.toThrow(
      "O cliente possui assinaturas vinculadas e não pode ser excluído. Cancele-o para preservar o histórico.",
    );
    expect(tx.platformClient.delete).not.toHaveBeenCalled();
    expect(tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("cancels a used client without deleting it and records the history atomically", async () => {
    const client = { id: "client-1", tenantId: "tenant-1", status: "CANCELLED" };
    const tx = {
      platformClient: {
        findUnique: vi.fn().mockResolvedValue({ ...client, status: "ACTIVE" }),
        update: vi.fn().mockResolvedValue(client),
      },
      platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(service.cancelClient("client-1", actor())).resolves.toEqual(client);
    expect(tx.platformClient.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { status: "CANCELLED" },
    });
    expect(tx.platformClient).not.toHaveProperty("delete");
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "platform_client.cancelled" }),
      }),
    );
  });

  it("deletes a plan that has never been used by a subscription", async () => {
    const prisma = {
      plan: {
        findUnique: vi.fn().mockResolvedValue({
          id: "plan-1",
          code: "PROMO",
          status: "ACTIVE",
          _count: { subscriptions: 0 },
        }),
        delete: vi.fn().mockResolvedValue({ id: "plan-1" }),
      },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);

    await expect(service.deletePlan("plan-1", actor())).resolves.toEqual({
      id: "plan-1",
      deleted: true,
    });
    expect(prisma.plan.delete).toHaveBeenCalledWith({ where: { id: "plan-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "plan.deleted", targetId: "plan-1" }),
    );
  });

  it("preserves a plan that has subscription history", async () => {
    const prisma = {
      plan: {
        findUnique: vi.fn().mockResolvedValue({
          id: "plan-1",
          code: "PROMO",
          status: "ACTIVE",
          _count: { subscriptions: 20 },
        }),
        delete: vi.fn(),
      },
    };
    const service = platformService(prisma, { record: vi.fn() });

    await expect(service.deletePlan("plan-1", actor())).rejects.toThrow(
      "O plano possui assinaturas vinculadas e não pode ser excluído. Desative-o para impedir novas utilizações.",
    );
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  it("deactivates only the used plan without changing subscriptions or tenants", async () => {
    const prisma = {
      plan: {
        findUnique: vi.fn().mockResolvedValue({ id: "plan-1", status: "ACTIVE" }),
        update: vi.fn().mockResolvedValue({ id: "plan-1", status: "INACTIVE" }),
      },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);

    await expect(service.deactivatePlan("plan-1", actor())).resolves.toMatchObject({
      id: "plan-1",
      status: "INACTIVE",
    });
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: "plan-1" },
      data: { status: "INACTIVE" },
    });
    expect(Object.keys(prisma)).toEqual(["plan"]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "plan.deactivated", targetId: "plan-1" }),
    );
  });

  it("activates an inactive plan again without changing subscriptions or tenants", async () => {
    const prisma = {
      plan: {
        findUnique: vi.fn().mockResolvedValue({ id: "plan-1", status: "INACTIVE" }),
        update: vi.fn().mockResolvedValue({ id: "plan-1", status: "ACTIVE" }),
      },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = platformService(prisma, audit);

    await expect(service.activatePlan("plan-1", actor())).resolves.toMatchObject({
      id: "plan-1",
      status: "ACTIVE",
    });
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: "plan-1" },
      data: { status: "ACTIVE" },
    });
    expect(Object.keys(prisma)).toEqual(["plan"]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "plan.activated", targetId: "plan-1" }),
    );
  });

  it("generates the plan identifiers internally from its name", async () => {
    const prisma = {
      plan: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({ id: "generated-id", ...data })),
      },
    };
    const service = platformService(prisma, { record: vi.fn().mockResolvedValue(undefined) });

    await expect(
      service.createPlan(
        {
          name: "Plano Promocional",
          status: "ACTIVE",
          features: { chat: true, campaigns: false, tickets: true },
          limits: { maxUsers: 3, maxConnections: 1, maxCampaigns: 0 },
        },
        actor(),
      ),
    ).resolves.toMatchObject({ id: "generated-id", code: "plano_promocional" });
    expect(prisma.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: "plano_promocional", name: "Plano Promocional" }),
      }),
    );
  });

  it("rejects a multibyte administrator password above bcrypt's 72-byte limit before hashing", async () => {
    const transaction = vi.fn();
    const service = platformService({ $transaction: transaction }, { record: vi.fn() });

    await expect(
      service.updateTenantAdministratorCredentials(
        "tenant-1",
        {
          responsibleName: "Responsável",
          responsibleEmail: "responsavel@example.com",
          newPassword: "😀".repeat(19),
        },
        actor(),
      ),
    ).rejects.toThrow("72 bytes");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an initial multibyte administrator password above 72 bytes before tenant work", async () => {
    const transaction = vi.fn();
    const service = platformService({ $transaction: transaction }, { record: vi.fn() });
    const planLookup = vi.spyOn(service as never, "activePlanOrThrow" as never);

    await expect(
      service.createTenant(
        {
          name: "Empresa",
          slug: "empresa-teste",
          planId: "plan-1",
          admin: {
            name: "Administrador",
            email: "admin@example.com",
            password: "😀".repeat(19),
          },
        },
        actor(),
      ),
    ).rejects.toThrow("72 bytes");
    expect(planLookup).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

function platformService(prisma: unknown, audit: unknown, email?: unknown) {
  return new PlatformService(
    prisma as never,
    audit as never,
    {} as never,
    { get: vi.fn().mockReturnValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    email as never,
  );
}

function actor() {
  return {
    userId: "platform-admin",
    tenantId: "",
    membershipId: "",
    roleId: "",
    roleKey: "platform_admin",
    platformRole: "ADMIN" as const,
    context: "platform" as const,
  };
}
