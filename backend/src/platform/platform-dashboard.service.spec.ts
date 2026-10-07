import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";

function createService(prisma: Record<string, unknown>) {
  return new PlatformService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
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
          platformClient: { id: "client-a", name: "Cliente A" },
        },
        { id: "tenant-orphan", name: "Tenant órfã", platformClient: null },
      ]),
      count: query(1),
    },
    tenantMembership: { count: query(2) },
    messagingConnection: { count: query(3) },
    message: { count: query(messages.length), findMany: query(messages) },
    campaign: { count: query(4) },
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
      where: { tenantId: "__platform_client_without_tenant__", status: "OPEN" },
    });
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              subscriptions: {
                where: { tenantId: "__platform_client_without_tenant__" },
              },
            },
          },
        }),
      }),
    );
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
    expect(result.configuration.components).toHaveLength(6);
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
