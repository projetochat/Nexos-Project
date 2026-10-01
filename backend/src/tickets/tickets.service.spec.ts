import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../auth/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { TicketCategory, TicketPriority, TicketStatus } from "../generated/prisma";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

const current = {
  userId: "user-agent",
  tenantId: "tenant-a",
  membershipId: "membership-agent",
  roleId: "role-agent",
  roleKey: "agent",
  platformRole: "USER",
  permissions: ["tickets.read", "tickets.create"],
} satisfies AuthenticatedUser;

describe("TicketsService tenant-wide temporary access policy", () => {
  it("allows an attendant to create a ticket in a tenant department without department membership", async () => {
    const prisma = prismaMock();
    prisma.department.findFirst.mockResolvedValue({ id: "department-other" });
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-other-department",
      contactId: "contact-a",
      departmentId: "department-other",
      assignedMembershipId: "membership-other",
      contact: { id: "contact-a", customerId: "customer-a" },
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.ticketProtocolCounter.upsert.mockResolvedValue({ lastNumber: 14 });
    prisma.ticket.create.mockResolvedValue(ticket());
    prisma.ticketHistory.create.mockResolvedValue({});
    const service = serviceWith(prisma);

    await expect(
      service.create(
        {
          title: "Falha no equipamento",
          descriptionHtml: "<p>Precisa de atendimento.</p>",
          departmentId: "department-other",
          conversationId: "conversation-other-department",
        },
        current,
      ),
    ).resolves.toMatchObject({ id: "ticket-a", protocol: "TKT-000014" });

    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "department-other", active: true },
    });
    expect(prisma.departmentMembership.findMany).not.toHaveBeenCalled();
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "conversation-other-department" },
      include: { contact: { select: { id: true, customerId: true } } },
    });
    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          departmentId: "department-other",
          createdByMembershipId: "membership-agent",
          conversationId: "conversation-other-department",
        }),
      }),
    );
  });

  it("lists every non-archived ticket in the tenant without a department-membership filter", async () => {
    const prisma = prismaMock();
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);
    const service = serviceWith(prisma);

    await service.list({ page: 1, pageSize: 25 }, current);

    const where = prisma.ticket.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: "tenant-a", archivedAt: null });
    expect(where).not.toHaveProperty("OR");
    expect(prisma.departmentMembership.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.count).toHaveBeenCalledWith({ where });
  });

  it("keeps ticket detail isolated by tenant", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(null);
    const service = serviceWith(prisma);

    await expect(service.detail("ticket-from-another-tenant", current)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-from-another-tenant", tenantId: "tenant-a" },
      }),
    );
  });

  it("keeps creation and tenant-wide reading behind their ticket permissions", () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.list)).toEqual([
      "tickets.read",
    ]);
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, TicketsController.prototype.create)).toEqual([
      "tickets.manage",
      "tickets.create",
    ]);
  });
});

function serviceWith(prisma: ReturnType<typeof prismaMock>) {
  return new TicketsService(
    prisma as never,
    {} as never,
    {} as never,
    {
      publishTicketCreated: vi.fn(),
      publishTicketUpdated: vi.fn(),
      publishTicketStatusUpdated: vi.fn(),
      publishTicketAssignmentUpdated: vi.fn(),
      publishTicketCommentCreated: vi.fn(),
      publishTicketAttachmentCreated: vi.fn(),
      publishTicketAttachmentRemoved: vi.fn(),
    } as never,
    { assertFeature: vi.fn().mockResolvedValue(undefined) } as never,
  );
}

function prismaMock() {
  return {
    $transaction: vi.fn(),
    department: { findFirst: vi.fn() },
    departmentMembership: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn() },
    ticketProtocolCounter: { upsert: vi.fn() },
    ticket: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    ticketHistory: { create: vi.fn() },
  };
}

function ticket() {
  const now = new Date("2026-10-01T12:00:00.000Z");
  return {
    id: "ticket-a",
    tenantId: "tenant-a",
    number: 14,
    protocol: "TKT-000014",
    title: "Falha no equipamento",
    descriptionText: "Precisa de atendimento.",
    descriptionHtmlSanitized: "<p>Precisa de atendimento.</p>",
    status: TicketStatus.ABERTO,
    priority: TicketPriority.NORMAL,
    category: TicketCategory.SUPORTE,
    departmentId: "department-other",
    requesterContactId: null,
    customerId: null,
    conversationId: null,
    assignedMembershipId: null,
    createdByMembershipId: "membership-agent",
    closedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    department: { id: "department-other", name: "Financeiro", color: "#000000" },
    requesterContact: null,
    customer: null,
    conversation: null,
    assignedMembership: null,
    createdByMembership: {
      id: "membership-agent",
      user: { id: "user-agent", name: "Atendente", email: "agent@trixus.test" },
    },
    _count: { comments: 0, attachments: 0 },
  };
}
