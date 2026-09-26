import { describe, expect, it, vi } from "vitest";
import {
  messageTrafficByHour,
  OperationsMetricsService,
  uniqueInboundContacts,
} from "./operations-metrics.service";
it("counts only real traffic and uses the organization's timezone instead of UTC", () => {
  const rows = [
    {
      createdAt: new Date("2026-09-18T03:00:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { contactId: "contact-a" },
    },
    {
      createdAt: new Date("2026-09-18T07:36:00Z"),
      direction: "OUTBOUND",
      type: "IMAGE",
      conversation: { contactId: "contact-a" },
    },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "SYSTEM", type: "SYSTEM" },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "SYSTEM", type: "SYSTEM" },
    { createdAt: new Date("2026-09-18T07:36:00Z"), direction: "INBOUND", type: "SYSTEM" },
  ];
  const chart = messageTrafficByHour(rows, "America/Sao_Paulo");
  expect(chart[0]).toMatchObject({ recebidas: 1, total: 1 });
  expect(chart[0]).toMatchObject({ contatosAtendidos: 1 });
  expect(chart[4]).toMatchObject({ enviadas: 1, total: 1 });
  expect(chart[4]).toMatchObject({ contatosAtendidos: 0 });
  expect(chart[7].total).toBe(0);
  expect(chart.every((hour) => hour.total === hour.recebidas + hour.enviadas)).toBe(true);
  expect(messageTrafficByHour(rows.slice(0, 1), "America/Manaus")[23].total).toBe(1);
});
it("counts each inbound contact once in the period and once per hour", () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, minute) => ({
      createdAt: new Date(`2026-09-18T12:${String(minute).padStart(2, "0")}:00Z`),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { contactId: "contact-a" },
    })),
    {
      createdAt: new Date("2026-09-18T13:00:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { contactId: "contact-a" },
    },
    {
      createdAt: new Date("2026-09-18T12:30:00Z"),
      direction: "INBOUND",
      type: "TEXT",
      conversation: { contactId: "contact-b" },
    },
  ];
  const chart = messageTrafficByHour(rows, "UTC");
  expect(chart[12]).toMatchObject({ recebidas: 11, contatosAtendidos: 2 });
  expect(chart[13]).toMatchObject({ recebidas: 1, contatosAtendidos: 1 });
  expect(uniqueInboundContacts(rows.slice(0, 10))).toBe(1);
  expect(uniqueInboundContacts(rows)).toBe(2);
});
it("filters system events in the database while preserving tenant and instance scope", async () => {
  const prisma = {
    conversation: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: { findMany: vi.fn().mockResolvedValue([]) },
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
        conversation: { select: { contactId: true } },
      }),
    }),
  );
  expect(result.messageContactsTotal).toBe(0);
  expect(result.messagesByHour).toHaveLength(24);
});
