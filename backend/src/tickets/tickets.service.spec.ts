import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_KEY } from "../auth/permissions.decorator";
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
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.create)).toEqual([
      "tickets.create",
    ]);
  });

  it("previews every dependent record before physical deletion", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findMany.mockResolvedValue([
      {
        id: "comment-a",
        bodyText: "Análise inicial",
        updatedAt: new Date("2026-10-08T12:01:00Z"),
        archivedAt: null,
      },
    ]);
    prisma.ticketHistory.findMany.mockResolvedValue([
      { id: "history-a", event: "ticket.created", createdAt: new Date("2026-10-08T12:00:00Z") },
    ]);
    prisma.ticketAttachment.findMany.mockResolvedValue([
      {
        id: "attachment-a",
        originalNameSanitized: "evidencia.pdf",
        objectKey: "tenants/tenant-a/tickets/ticket-a/evidencia.pdf",
        status: "READY",
        deletedAt: null,
        createdAt: new Date("2026-10-08T12:02:00Z"),
      },
    ]);

    const impact = await serviceWith(prisma).deletionPreview("ticket-a", current);

    expect(impact.snapshotToken).toHaveLength(64);
    expect(impact.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "comments", count: 1 }),
        expect.objectContaining({ id: "history", count: 1 }),
        expect.objectContaining({ id: "attachments", count: 1 }),
      ]),
    );
    expect(impact.confirmation).toEqual({ level: "standard", confirmLabel: "Confirmar" });
  });

  it("deletes children and ticket in one transaction, then removes storage objects", async () => {
    const prisma = prismaMock();
    const order: string[] = [];
    mockDeletionState(prisma);
    prisma.outboxEvent.create.mockResolvedValue({ id: "cleanup-event" });
    prisma.ticketAttachment.deleteMany.mockImplementation(async () => {
      order.push("attachments");
      return { count: 1 };
    });
    prisma.ticketComment.deleteMany.mockImplementation(async () => {
      order.push("comments");
      return { count: 1 };
    });
    prisma.ticketHistory.deleteMany.mockImplementation(async () => {
      order.push("history");
      return { count: 1 };
    });
    prisma.ticket.delete.mockImplementation(async () => {
      order.push("ticket");
      return ticket();
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const result = await callback(prisma);
      order.push("commit");
      return result;
    });
    const cleanup = {
      process: vi.fn(async () => {
        order.push("storage");
        return true;
      }),
    };
    const service = serviceWith(prisma, cleanup);
    const impact = await service.deletionPreview("ticket-a", current);

    await expect(service.remove("ticket-a", impact.snapshotToken, current)).resolves.toMatchObject({
      status: "deleted",
      cleanup: "completed",
    });

    expect(order).toEqual(["attachments", "comments", "history", "ticket", "commit", "storage"]);
    expect(prisma.ticket.delete).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "ticket-a" } },
    });
    expect(cleanup.process).toHaveBeenCalledWith("cleanup-event");
  });

  it("revalidates a stale snapshot without deleting anything", async () => {
    const prisma = prismaMock();
    mockDeletionState(prisma);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    const cleanup = { process: vi.fn() };

    const result = await serviceWith(prisma, cleanup).remove("ticket-a", "0".repeat(64), current);

    expect(result.status).toBe("changed");
    expect(prisma.ticket.delete).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(cleanup.process).not.toHaveBeenCalled();
  });
});

function serviceWith(
  prisma: ReturnType<typeof prismaMock>,
  cleanup: { process: ReturnType<typeof vi.fn> } = { process: vi.fn() },
) {
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
    cleanup as never,
  );
}

function prismaMock() {
  return {
    $transaction: vi.fn(),
    department: { findFirst: vi.fn() },
    departmentMembership: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn() },
    ticketProtocolCounter: { upsert: vi.fn() },
    ticket: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    ticketComment: { findMany: vi.fn(), deleteMany: vi.fn() },
    ticketHistory: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    ticketAttachment: { findMany: vi.fn(), deleteMany: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };
}

function mockDeletionState(prisma: ReturnType<typeof prismaMock>) {
  prisma.ticket.findFirst.mockResolvedValue(ticket());
  prisma.ticketComment.findMany.mockResolvedValue([
    {
      id: "comment-a",
      bodyText: "Comentário",
      updatedAt: new Date("2026-10-08T12:01:00Z"),
      archivedAt: null,
    },
  ]);
  prisma.ticketHistory.findMany.mockResolvedValue([
    { id: "history-a", event: "ticket.created", createdAt: new Date("2026-10-08T12:00:00Z") },
  ]);
  prisma.ticketAttachment.findMany.mockResolvedValue([
    {
      id: "attachment-a",
      originalNameSanitized: "evidencia.pdf",
      objectKey: "tenants/tenant-a/tickets/ticket-a/evidencia.pdf",
      status: "READY",
      deletedAt: null,
      createdAt: new Date("2026-10-08T12:02:00Z"),
    },
  ]);
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
