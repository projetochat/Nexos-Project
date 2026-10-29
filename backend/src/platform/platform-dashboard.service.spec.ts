import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";
import * as loginMetrics from "../login-metrics";

function createService(prisma: Record<string, unknown>) {
  return new PlatformService(
    prisma as never,
    {} as never,
    {} as never,
    { get: vi.fn().mockReturnValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function dashboardPrisma(messages: Array<Record<string, unknown>> = []) {
  const query = <T>(value: T) => vi.fn().mockResolvedValue(value);
  const prisma = {
    platformAuditLog: { groupBy: query([]) },
    platformClient: {
      findMany: query([
        { id: "client-a", name: "Cliente A", tenantId: "tenant-a" },
        { id: "client-silent", name: "Cliente silencioso", tenantId: null },
      ]),
    },
    tenant: {
      findMany: query([
        {
          id: "tenant-a",
          name: "Tenant A",
          subscriptions: [],
          platformClient: { id: "client-a", name: "Cliente A" },
        },
        { id: "tenant-orphan", name: "Tenant órfã", subscriptions: [], platformClient: null },
      ]),
      count: query(1),
    },
    tenantMembership: { count: query(2), groupBy: query([]) },
    messagingConnection: { count: query(3), groupBy: query([]) },
    contact: { groupBy: query([]) },
    role: { groupBy: query([]) },
    department: { groupBy: query([]) },
    tag: { groupBy: query([]) },
    quickReply: { groupBy: query([]) },
    contactCustomField: { groupBy: query([]) },
    schedule: { groupBy: query([]) },
    message: { count: query(messages.length), findMany: query(messages) },
    campaign: { count: query(4), groupBy: query([]) },
    ticket: { count: query(5) },
    invoice: { count: query(6) },
    plan: {
      findMany: query([
        { id: "plan-a", code: "basic", name: "Básico", _count: { subscriptions: 1 } },
      ]),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  return prisma;
}

describe("Platform Dashboard", () => {
  it("returns every client, Sem cliente and exact percentages without Top N", async () => {
    const prisma = dashboardPrisma([
      {
        id: "message-a",
        tenantId: "tenant-a",
        createdAt: new Date("2026-10-07T12:00:00.000Z"),
        direction: "INBOUND",
        type: "TEXT",
        conversation: { id: "conversation-a", contactId: "contact-a" },
      },
      {
        id: "message-orphan",
        tenantId: "tenant-orphan",
        createdAt: new Date("2026-10-07T13:00:00.000Z"),
        direction: "OUTBOUND",
        type: "TEXT",
        conversation: { id: "conversation-b", contactId: "contact-b" },
      },
      {
        id: "message-a-later",
        tenantId: "tenant-a",
        createdAt: new Date("2026-10-07T15:00:00.000Z"),
        direction: "INBOUND",
        type: "TEXT",
        conversation: { id: "conversation-a", contactId: "contact-a" },
      },
    ]);
    const service = createService(prisma);

    const result = await service.dashboard({ period: "month" });

    expect(result.charts.messageVolumeByClient).toEqual([
      { clientId: "client-a", clientName: "Cliente A", total: 2 },
      { clientId: null, clientName: "Sem cliente", total: 1 },
      { clientId: "client-silent", clientName: "Cliente silencioso", total: 0 },
    ]);
    expect(result.charts.messagePercentageByClient).toEqual([
      { clientId: "client-a", clientName: "Cliente A", total: 2, percentage: 66.67 },
      { clientId: null, clientName: "Sem cliente", total: 1, percentage: 33.33 },
      { clientId: "client-silent", clientName: "Cliente silencioso", total: 0, percentage: 0 },
    ]);
    expect(result.charts.messageContactsTotal).toBe(1);
    expect(result.charts.messageAttendancesTotal).toBe(1);
    expect(prisma.messagingConnection.count).toHaveBeenCalledWith({
      where: { archivedAt: null, serviceEnabled: true, status: { not: "REMOVED" } },
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          direction: { in: ["INBOUND", "OUTBOUND"] },
          type: { not: "SYSTEM" },
          status: { not: "FAILED" },
          conversation: { archivedAt: null },
        }),
      }),
    );
  });

  it("keeps silent selected clients visible with zero percentage", async () => {
    const prisma = dashboardPrisma();
    const service = createService(prisma);

    const result = await service.dashboard({ clientId: "client-silent", period: "month" });

    expect(result.charts.messageVolumeByClient).toEqual([
      { clientId: "client-silent", clientName: "Cliente silencioso", total: 0 },
    ]);
    expect(result.charts.messagePercentageByClient[0]?.percentage).toBe(0);
    expect(prisma.invoice.count).toHaveBeenCalledWith({
      where: { tenantId: { in: ["__platform_client_without_tenant__"] }, status: "OPEN" },
    });
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              subscriptions: {
                where: { tenantId: { in: ["__platform_client_without_tenant__"] } },
              },
            },
          },
        }),
      }),
    );
  });

  it("consolidates registered entities from multiple tenants and totals every metric", async () => {
    const prisma = dashboardPrisma();
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: "tenant-a",
        name: "Tenant A",
        subscriptions: [{ client: { id: "client-a", name: "Cliente A" } }],
        platformClient: null,
      },
      {
        id: "tenant-b",
        name: "Tenant B",
        subscriptions: [{ client: { id: "client-a", name: "Cliente A" } }],
        platformClient: null,
      },
      {
        id: "tenant-c",
        name: "Tenant C",
        subscriptions: [{ client: { id: "client-silent", name: "Cliente silencioso" } }],
        platformClient: null,
      },
    ]);
    const grouped = (a: number, b: number) => [
      { tenantId: "tenant-a", _count: { _all: a } },
      { tenantId: "tenant-b", _count: { _all: b } },
      { tenantId: "tenant-c", _count: { _all: 1 } },
    ];
    prisma.messagingConnection.groupBy.mockResolvedValue(grouped(1, 2));
    prisma.contact.groupBy.mockResolvedValue(grouped(3, 4));
    prisma.tenantMembership.groupBy.mockResolvedValue(grouped(1, 2));
    prisma.role.groupBy.mockResolvedValue(grouped(2, 3));
    prisma.department.groupBy.mockResolvedValue(grouped(1, 1));
    prisma.tag.groupBy.mockResolvedValue(grouped(2, 2));
    prisma.quickReply.groupBy.mockResolvedValue(grouped(3, 3));
    prisma.contactCustomField.groupBy.mockResolvedValue(grouped(4, 4));
    prisma.schedule.groupBy.mockResolvedValue(grouped(5, 5));
    prisma.campaign.groupBy.mockResolvedValue(grouped(6, 6));

    const result = await createService(prisma).dashboard({ clientId: "client-a", period: "today" });

    expect(result.clientVolumetry.rows).toEqual([
      expect.objectContaining({
        clientId: "client-a",
        instances: 3,
        contacts: 7,
        departments: 2,
        campaigns: 12,
      }),
    ]);
    expect(result.clientVolumetry.totals).toEqual({
      logins: 0,
      instances: 3,
      contacts: 7,
      attendants: 3,
      accessProfiles: 5,
      departments: 2,
      tags: 4,
      quickReplies: 6,
      customFields: 8,
      schedules: 10,
      campaigns: 12,
    });
    expect(prisma.messagingConnection.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: { in: ["tenant-a", "tenant-b"] },
          archivedAt: null,
          status: { not: "REMOVED" },
        },
      }),
    );
    expect(prisma.department.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: { in: ["tenant-a", "tenant-b"] } } }),
    );

    const allClientsResult = await createService(prisma).dashboard({ period: "month" });
    expect(allClientsResult.clientVolumetry.rows).toHaveLength(2);
    expect(allClientsResult.clientVolumetry.totals).toEqual({
      logins: 0,
      instances: 4,
      contacts: 8,
      attendants: 4,
      accessProfiles: 6,
      departments: 3,
      tags: 5,
      quickReplies: 7,
      customFields: 9,
      schedules: 11,
      campaigns: 13,
    });

    const tenantResult = await createService(prisma).dashboard({
      tenantId: "tenant-b",
      period: "year",
    });
    expect(tenantResult.clientVolumetry.rows).toEqual([
      expect.objectContaining({ clientId: "client-a", instances: 2, contacts: 4, departments: 1 }),
    ]);
    expect(prisma.contact.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          tenantId: { in: ["tenant-b"] },
          archivedAt: null,
          NOT: { normalizedPhone: { startsWith: "group:" } },
        },
      }),
    );
    for (const repository of [
      prisma.messagingConnection,
      prisma.contact,
      prisma.tenantMembership,
      prisma.role,
      prisma.department,
      prisma.tag,
      prisma.quickReply,
      prisma.contactCustomField,
      prisma.schedule,
      prisma.campaign,
    ]) {
      expect(repository.groupBy.mock.calls.at(-1)?.[0]?.where).not.toHaveProperty("createdAt");
    }
  });

  it("returns versioned defaults and update capability before the first save", async () => {
    const service = createService({
      platformSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    const result = await service.dashboardConfiguration({
      platformPermissions: ["platform.settings.update"],
    } as never);

    expect(result).toMatchObject({
      version: 0,
      updatedAt: null,
      canUpdate: true,
      configuration: { schemaVersion: 1 },
    });
    expect(result.configuration.components).toHaveLength(7);
    expect(
      result.configuration.components.map((component) => ({
        id: component.id,
        order: component.order,
        columns: component.columns,
      })),
    ).toEqual([
      { id: "kpis", order: 0, columns: 4 },
      { id: "traffic", order: 1, columns: 2 },
      { id: "clientVolumetry", order: 2, columns: 2 },
      { id: "volumeByClient", order: 3, columns: 1 },
      { id: "percentageByClient", order: 4, columns: 1 },
      { id: "subscriptions", order: 5, columns: 1 },
      { id: "operation", order: 6, columns: 1 },
    ]);
  });

  it("preserves an existing customized dashboard layout", async () => {
    const customizedConfiguration = {
      schemaVersion: 1,
      components: [
        {
          id: "clientVolumetry",
          title: "Minha volumetria",
          visible: false,
          order: 0,
          visualization: "table",
          columns: 3,
          dataSource: "records",
          groupBy: "clientVolumetry",
          valueMode: "count",
        },
        {
          id: "volumeByClient",
          title: "Meu volume",
          visible: true,
          order: 1,
          visualization: "columns",
          columns: 2,
          dataSource: "messages",
          groupBy: "clientVolume",
          valueMode: "count",
        },
      ],
    };
    const service = createService({
      platformSetting: {
        findUnique: vi.fn().mockResolvedValue({
          value: { configuration: customizedConfiguration, version: 4 },
          updatedAt: new Date("2026-10-21T12:00:00.000Z"),
        }),
      },
    });

    const result = await service.dashboardConfiguration({ platformPermissions: [] } as never);

    expect(result.version).toBe(4);
    expect(result.configuration).toEqual(customizedConfiguration);
  });

  it("adds the native volumetry table to an older saved configuration", async () => {
    const oldConfiguration = {
      schemaVersion: 1,
      components: [
        {
          id: "traffic",
          title: "Tráfego",
          visible: true,
          order: 0,
          visualization: "line",
          columns: 2,
          dataSource: "messages",
          groupBy: "hour",
          valueMode: "count",
        },
      ],
    };
    const service = createService({
      platformSetting: {
        findUnique: vi.fn().mockResolvedValue({
          value: { configuration: oldConfiguration, version: 1 },
          updatedAt: new Date("2026-10-21T12:00:00.000Z"),
        }),
      },
    });

    const result = await service.dashboardConfiguration({ platformPermissions: [] } as never);

    expect(result.configuration.components.map((item) => item.id)).toEqual([
      "traffic",
      "clientVolumetry",
    ]);
  });

  it("updates atomically, audits and rejects stale versions", async () => {
    const configuration = {
      schemaVersion: 1,
      components: [
        {
          id: "kpis",
          title: "Indicadores",
          visible: true,
          order: 0,
          visualization: "cards",
          columns: 4,
          dataSource: "records",
          groupBy: "platformKpis",
          valueMode: "count",
        },
      ],
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      platformSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ updatedAt: new Date("2026-10-07T12:00:00.000Z") }),
      },
      platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof tx) => unknown) => callback(tx)),
    };
    const service = createService(prisma);
    const current = {
      userId: "platform-admin",
      platformRole: "ADMIN",
      platformPermissions: ["platform.settings.update"],
    } as never;

    await expect(
      service.updateDashboardConfiguration({ configuration, version: 0 }, current),
    ).resolves.toMatchObject({ version: 1, configuration, canUpdate: true });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "platform.dashboard.configuration.updated",
          metadataJson: expect.objectContaining({ previousVersion: 0, version: 1 }),
        }),
      }),
    );

    tx.platformSetting.findUnique.mockResolvedValueOnce({
      value: { configuration, version: 2 },
      updatedAt: new Date("2026-10-07T13:00:00.000Z"),
    } as never);
    await expect(
      service.updateDashboardConfiguration({ configuration, version: 1 }, current),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("Platform login volumetry", () => {
  it("consolidates successful audited logins and intersects tenant/client/date filters", async () => {
    const prisma = dashboardPrisma();
    prisma.platformAuditLog.groupBy.mockResolvedValue([
      { tenantId: "tenant-a", _count: { _all: 7 } },
      { tenantId: "tenant-orphan", _count: { _all: 2 } },
    ]);
    const service = createService(prisma);
    const query = { period: "custom" as const, start: "2026-10-01", end: "2026-10-02" };
    const all = await service.dashboard(query);
    expect(all.clientVolumetry.rows.find((row) => row.clientId === "client-a")?.logins).toBe(7);
    expect(all.clientVolumetry.rows.find((row) => row.clientId === null)?.logins).toBe(2);
    expect(all.clientVolumetry.rows.find((row) => row.clientId === "client-silent")?.logins).toBe(
      0,
    );
    expect(all.clientVolumetry.totals.logins).toBe(9);
    expect(prisma.platformAuditLog.groupBy).toHaveBeenLastCalledWith({
      by: ["tenantId"],
      orderBy: { tenantId: "asc" },
      _count: { _all: true },
      where: {
        action: "auth.tenant.login",
        targetType: "auth_session",
        tenantId: { in: ["tenant-a", "tenant-orphan"] },
        createdAt: {
          gte: new Date("2026-10-01T03:00:00.000Z"),
          lt: new Date("2026-10-03T03:00:00.000Z"),
        },
      },
    });
    const scoped = await service.dashboard({
      ...query,
      tenantId: "tenant-a",
      clientId: "client-a",
    });
    expect(scoped.clientVolumetry.totals.logins).toBe(7);
    expect(prisma.platformAuditLog.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: { in: ["tenant-a"] } }),
      }),
    );
    const empty = await service.dashboard({ ...query, clientId: "client-silent" });
    expect(empty.clientVolumetry.totals.logins).toBe(0);
    expect(prisma.platformAuditLog.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: { in: [] } }) }),
    );
  });
});

describe("Platform unified login integration", () => {
  it("uses central totals and breakdown with the selected client/tenant and Sao Paulo period", async () => {
    const queryCounts = vi.spyOn(loginMetrics, "readUnifiedLoginCounts").mockResolvedValue({
      status: "available",
      countsByTenant: [
        { tenantId: "tenant-a", local: 2, homologation: 3, production: 5, total: 10 },
        { tenantId: "tenant-orphan", local: 0, homologation: 0, production: 1, total: 1 },
      ],
      updatedAt: "2026-10-28T12:00:00.000Z",
    });
    try {
      const result = await createService(dashboardPrisma()).dashboard({
        period: "custom",
        start: "2026-10-01",
        end: "2026-10-02",
        clientId: "client-a",
        tenantId: "tenant-a",
      });
      expect(result.clientVolumetry.totals.logins).toBe(10);
      expect(result.clientVolumetry.rows[0]).toMatchObject({
        clientId: "client-a",
        logins: 10,
        loginEnvironments: { local: 2, homologation: 3, production: 5 },
      });
      expect(result.clientVolumetry.loginAggregation.status).toBe("available");
      expect(queryCounts.mock.calls[0].slice(-2)).toEqual([
        new Date("2026-10-01T03:00:00.000Z"),
        new Date("2026-10-03T03:00:00.000Z"),
      ]);
    } finally {
      queryCounts.mockRestore();
    }
  });
  it("never falls back to misleading local zero when the central service fails", async () => {
    const queryCounts = vi
      .spyOn(loginMetrics, "readUnifiedLoginCounts")
      .mockResolvedValue({ status: "unavailable", countsByTenant: [] });
    try {
      const result = await createService(dashboardPrisma()).dashboard({ period: "today" });
      expect(result.clientVolumetry.totals.logins).toBeNull();
      expect(result.clientVolumetry.rows.every((row) => row.logins === null)).toBe(true);
      expect(result.clientVolumetry.loginAggregation.status).toBe("unavailable");
    } finally {
      queryCounts.mockRestore();
    }
  });
});
