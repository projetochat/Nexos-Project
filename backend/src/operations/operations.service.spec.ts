import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

afterEach(() => vi.useRealTimers());

describe("dashboard week ranges", () => {
  it.each([
    ["week", "2026-09-13T03:00:00.000Z", "2026-09-15T15:00:00.000Z"],
    ["previous_week", "2026-09-06T03:00:00.000Z", "2026-09-13T03:00:00.000Z"],
  ] as const)(
    "uses Sunday boundaries for %s in the company timezone",
    async (period, start, end) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T15:00:00.000Z"));
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
        conversation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const metrics = {
        snapshot: vi.fn().mockResolvedValue({}),
        chartData: vi.fn().mockResolvedValue({}),
        semantics: vi.fn().mockReturnValue({}),
      };
      const service = new OperationsService(prisma as never, metrics as never);
      const result = await service.dashboard(
        { tenantId: "tenant-a", roleKey: "agent", connectionIds: ["vocical"] } as never,
        { period },
      );
      expect(result.range).toEqual({ start, end });
      expect(metrics.snapshot).toHaveBeenNthCalledWith(
        1,
        "tenant-a",
        {
          start: new Date(start),
          end: new Date(end),
        },
        { period, allowedConnectionIds: ["vocical"] },
      );
      expect(metrics.chartData).toHaveBeenCalledWith(
        "tenant-a",
        expect.anything(),
        {
          period,
          allowedConnectionIds: ["vocical"],
        },
        "America/Sao_Paulo",
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-a", archivedAt: null, connectionId: { in: ["vocical"] } },
          orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
          take: 7,
        }),
      );
    },
  );
});

describe("dashboard configurable contact data", () => {
  it("groups only tenant-scoped contacts allowed by the dashboard filters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T15:00:00.000Z"));
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contact: {
        groupBy: vi.fn().mockResolvedValue([
          { customerId: "customer-a", _count: { _all: 3 } },
          { customerId: null, _count: { _all: 1 } },
        ]),
      },
      customer: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "customer-a", name: "Empresa A", color: "#2563eb" }]),
      },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      {
        tenantId: "tenant-a",
        roleKey: "agent",
        connectionIds: ["connection-a"],
      } as never,
      {
        period: "today",
        groupBy: "customer",
        departmentId: "department-a",
      },
    );

    expect(prisma.contact.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["customerId"],
        where: expect.objectContaining({
          tenantId: "tenant-a",
          archivedAt: null,
          departmentId: "department-a",
          instanceIds: { hasSome: ["connection-a"] },
        }),
        take: 20,
      }),
    );
    expect(result.items).toEqual([
      { nome: "Empresa A", total: 3, cor: "#2563eb" },
      { nome: "Sem empresa", total: 1, cor: "#64748b" },
    ]);
  });

  it("rejects personalized fields that do not belong to the current tenant", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contactCustomField: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new OperationsService(prisma as never, {} as never);

    await expect(
      service.dashboardComponentData({ tenantId: "tenant-a", roleKey: "tenant_admin" } as never, {
        period: "today",
        groupBy: "custom:field-from-another-tenant",
      }),
    ).rejects.toThrow("Campo personalizado inválido.");
  });

  it("includes contacts without a value in personalized field groups", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      contactCustomField: { findFirst: vi.fn().mockResolvedValue({ id: "field-a" }) },
      contactCustomFieldValue: {
        groupBy: vi.fn().mockResolvedValue([
          { value: "Instagram", _count: { _all: 3 } },
          { value: "", _count: { _all: 1 } },
        ]),
      },
      contact: { count: vi.fn().mockResolvedValue(2) },
    };
    const service = new OperationsService(prisma as never, {} as never);

    const result = await service.dashboardComponentData(
      { tenantId: "tenant-a", roleKey: "tenant_admin" } as never,
      { period: "today", groupBy: "custom:field-a" },
    );

    expect(prisma.contact.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        customFieldValues: { none: { fieldId: "field-a" } },
      }),
    });
    expect(result.items).toEqual([
      { nome: "Instagram", total: 3 },
      { nome: "Não informado", total: 3 },
    ]);
  });
});
