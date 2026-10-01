import { describe, expect, it, vi } from "vitest";
import {
  messageTrafficByHour,
  OperationsMetricsService,
  uniqueInboundContacts,
  uniqueInboundConversations,
} from "./operations-metrics.service";
it("counts only real traffic and uses the organization's timezone instead of UTC", () => {
  const rows = [
    {
      createdAt: new Date("2026-09-18T03:00:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { id: "conversation-a", contactId: "contact-a" },
    },
    {
      createdAt: new Date("2026-09-18T07:36:00Z"),
      direction: "OUTBOUND",
      type: "IMAGE",
      conversation: { id: "conversation-a", contactId: "contact-a" },
    },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "SYSTEM", type: "SYSTEM" },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "SYSTEM", type: "SYSTEM" },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "INBOUND", type: "SYSTEM" },
  ];
  const chart = messageTrafficByHour(rows, "America/Sao_Paulo");
  expect(chart[0]).toMatchObject({ recebidas: 1, total: 1 });
  expect(chart[0]).toMatchObject({ contatosAtendidos: 1 });
  expect(chart[0]).toMatchObject({ atendimentos: 1 });
  expect(chart[4]).toMatchObject({ enviadas: 1, total: 1 });
  expect(chart[4]).toMatchObject({ contatosAtendidos: 0 });
  expect(chart[7].total).toBe(0);
  expect(chart.every((hour) => hour.total === hour.recebidas + hour.enviadas)).toBe(true);
  expect(messageTrafficByHour(rows.slice(0, 1), "America/Manaus")[23].total).toBe(1);
});
it("counts each conversation once at its first inbound message, including repeat contacts", () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, minute) => ({
      createdAt: new Date(`2026-09-18T12:${String(minute).padStart(2, "0")}:00Z`),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { id: "conversation-a", contactId: "contact-a" },
    })),
    {
      createdAt: new Date("2026-09-18T13:00:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { id: "conversation-a", contactId: "contact-a" },
    },
    {
      createdAt: new Date("2026-09-18T13:30:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { id: "conversation-b", contactId: "contact-a" },
    },
  ];
  const chart = messageTrafficByHour(rows, "UTC");
  expect(chart[12]).toMatchObject({ recebidas: 10, contatosAtendidos: 1, atendimentos: 1 });
  expect(chart[13]).toMatchObject({ recebidas: 2, contatosAtendidos: 1, atendimentos: 1 });
  expect(uniqueInboundContacts(rows.slice(0, 10))).toBe(1);
  expect(uniqueInboundContacts(rows)).toBe(1);
  expect(uniqueInboundConversations(rows.slice(0, 10))).toBe(1);
  expect(uniqueInboundConversations(rows)).toBe(2);
});
it("filters system events in the database while preserving tenant and instance scope", async () => {
  const prisma = {
    conversation: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    message: { findMany: vi.fn().mockResolvedValue([]) },
    contact: { findMany: vi.fn().mockResolvedValue([]) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    messagingConnection: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const result = await new OperationsMetricsService(prisma as never).chartData(
    "tenant-a",
    { start: new Date(), end: new Date() },
    { connectionId: "vocical" },
    "America/Sao_Paulo",
  );
  expect(prisma.message.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        direction: { in: ["INBOUND", "OUTBOUND"] },
        type: { not: "SYSTEM" },
        conversation: expect.objectContaining({ connectionId: "vocical" }),
      }),
      select: expect.objectContaining({
        conversation: { select: { id: true, contactId: true } },
      }),
    }),
  );
  expect(result.messageContactsTotal).toBe(0);
  expect(result.messageAttendancesTotal).toBe(0);
  expect(result.messagesByHour).toHaveLength(24);
});

it("aggregates high-volume customer and tag charts by contact before loading metadata", async () => {
  const groupBy = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { contactId: "contact-a", _count: { _all: 30_000 } },
      { contactId: "contact-b", _count: { _all: 20_000 } },
    ])
    .mockResolvedValueOnce([]);
  const prisma = {
    conversation: { groupBy },
    message: { findMany: vi.fn().mockResolvedValue([]) },
    contact: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "contact-a",
          customer: { id: "customer-a", name: "Cliente A", color: "#111111" },
          tags: [{ tag: { id: "tag-a", name: "VIP", color: "#222222" } }],
        },
        {
          id: "contact-b",
          customer: { id: "customer-a", name: "Cliente A", color: "#111111" },
          tags: [],
        },
      ]),
    },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    messagingConnection: { findMany: vi.fn().mockResolvedValue([]) },
  };

  const result = await new OperationsMetricsService(prisma as never).chartData("tenant-a", {
    start: new Date("2026-09-01"),
    end: new Date("2026-10-01"),
  });

  expect(prisma.contact.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { tenantId: "tenant-a", id: { in: ["contact-a", "contact-b"] } },
    }),
  );
  expect(result.byCustomer).toEqual([{ nome: "Cliente A", cor: "#111111", total: 50_000 }]);
  expect(result.byTag).toEqual([{ nome: "VIP", cor: "#222222", total: 30_000, percentual: 100 }]);
});

it("batches contact metadata lookups instead of exceeding PostgreSQL bind limits", async () => {
  const contactRows = Array.from({ length: 10_001 }, (_, index) => ({
    contactId: `contact-${index}`,
    _count: { _all: 1 },
  }));
  const groupBy = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(contactRows)
    .mockResolvedValueOnce([]);
  const contactFindMany = vi.fn().mockResolvedValue([]);
  const prisma = {
    conversation: { groupBy },
    message: { findMany: vi.fn().mockResolvedValue([]) },
    contact: { findMany: contactFindMany },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    messagingConnection: { findMany: vi.fn().mockResolvedValue([]) },
  };

  await new OperationsMetricsService(prisma as never).chartData("tenant-a", {
    start: new Date("2026-09-01"),
    end: new Date("2026-10-01"),
  });

  expect(contactFindMany).toHaveBeenCalledTimes(2);
  expect(contactFindMany.mock.calls.every(([query]) => query.where.id.in.length <= 10_000)).toBe(
    true,
  );
});
