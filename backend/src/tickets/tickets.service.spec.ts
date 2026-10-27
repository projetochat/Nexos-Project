import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    prisma.ticket.aggregate.mockResolvedValue({ _max: { number: 13 } });
    prisma.ticketProtocolCounter.update.mockResolvedValue({ lastNumber: 14 });
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
    expect(prisma.ticketProtocolCounter.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", lastNumber: { lt: 13 } },
      data: { lastNumber: 13 },
    });
    expect(prisma.ticketProtocolCounter.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      data: { lastNumber: { increment: 1 } },
    });
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

  it("serializes the persisted author snapshot after the membership is removed", async () => {
    const prisma = prismaMock();
    prisma.ticket.findMany.mockResolvedValue([
      {
        ...ticket(),
        createdByMembershipId: null,
        createdByMembership: null,
        createdByNameSnapshot: "Atendente removido original",
      },
    ]);
    prisma.ticket.count.mockResolvedValue(1);
    const service = serviceWith(prisma);

    const result = await service.list({ page: 1, pageSize: 25 }, current);

    expect(result.items[0].createdByMembership).toEqual({
      id: "deleted",
      user: { id: "deleted", name: "Atendente removido original", email: "" },
    });
  });

  it("serializes the comment author snapshot after the membership is removed", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findMany.mockResolvedValue([
      {
        id: "comment-a",
        bodyText: "Resposta histórica",
        bodyHtmlSanitized: "<p>Resposta histórica</p>",
        internal: true,
        dialogType: "RESPONSE",
        editedAt: null,
        createdAt: new Date("2026-10-01T12:01:00.000Z"),
        updatedAt: new Date("2026-10-01T12:01:00.000Z"),
        authorMembership: null,
        authorNameSnapshot: "Autora removida",
      },
    ]);
    const service = serviceWith(prisma);

    const result = await service.comments("ticket-a", current);

    expect(result[0].authorMembership.user.name).toBe("Autora removida");
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
    prisma.ticketApproval.findMany.mockResolvedValue([
      {
        id: "approval-a",
        kind: "SUPPORT",
        status: "PENDING",
        requestedAt: new Date("2026-10-08T12:03:00Z"),
        decidedAt: null,
      },
    ]);

    const impact = await serviceWith(prisma).deletionPreview("ticket-a", current);

    expect(impact.snapshotToken).toHaveLength(64);
    expect(impact.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "comments", count: 1 }),
        expect.objectContaining({ id: "history", count: 1 }),
        expect.objectContaining({ id: "attachments", count: 1 }),
        expect.objectContaining({ id: "approvals", count: 1 }),
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
    prisma.ticketApproval.deleteMany.mockImplementation(async () => {
      order.push("approvals");
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

    expect(order).toEqual([
      "attachments",
      "approvals",
      "comments",
      "history",
      "ticket",
      "commit",
      "storage",
    ]);
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

describe("TicketsService PACK 11 workflow", () => {
  it("creates a DEV approval for the contract manager in the same tenant", async () => {
    const prisma = prismaMock();
    prisma.department.findFirst.mockResolvedValue({ id: "department-other" });
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findFirst.mockResolvedValue({ contactId: "contract-manager" });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.ticket.aggregate.mockResolvedValue({ _max: { number: 14 } });
    prisma.ticketProtocolCounter.update.mockResolvedValue({ lastNumber: 15 });
    prisma.ticket.create.mockResolvedValue({
      ...ticket(),
      category: TicketCategory.DEV,
      status: TicketStatus.AGUARDANDO_APROVACAO,
      customerId: "customer-a",
    });
    prisma.ticketApproval.create.mockResolvedValue({ id: "approval-a" });
    prisma.ticketHistory.create.mockResolvedValue({});

    await serviceWith(prisma).create(
      {
        title: "Nova integração",
        descriptionHtml: "<p>Implementar integração.</p>",
        departmentId: "department-other",
        customerId: "customer-a",
        category: TicketCategory.DEV,
      },
      current,
    );

    expect(prisma.customerPortalAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          customerId: "customer-a",
          accessProfile: "FULL_ACCESS",
        }),
      }),
    );
    expect(prisma.ticketApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        ticketId: "ticket-a",
        kind: "DEVELOPMENT",
        approverContactId: "contract-manager",
      }),
    });
  });

  it("rejects a branch that is outside the tenant/customer relation", async () => {
    const prisma = prismaMock();
    prisma.department.findFirst.mockResolvedValue({ id: "department-other" });
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerBranch.findFirst.mockResolvedValue(null);

    await expect(
      serviceWith(prisma).create(
        {
          title: "Falha",
          descriptionHtml: "<p>Falha na filial.</p>",
          departmentId: "department-other",
          customerId: "customer-a",
          originBranchId: "branch-from-other-tenant",
        },
        current,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customerBranch.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        customerId: "customer-a",
        id: "branch-from-other-tenant",
      }),
    });
  });

  it("allows only the dialog author to edit and preserves creation metadata", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findFirst.mockResolvedValue({
      id: "comment-a",
      ticketId: "ticket-a",
      authorMembershipId: "membership-other",
      createdAt: new Date("2026-10-16T12:00:00Z"),
    });

    await expect(
      serviceWith(prisma).updateComment(
        "ticket-a",
        "comment-a",
        { bodyHtml: "<p>Texto alterado.</p>" },
        current,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticketComment.update).not.toHaveBeenCalled();
  });

  it("records solution dialog, solution date and status atomically", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue({ ...ticket(), status: TicketStatus.EM_EXECUCAO });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.ticketComment.create.mockResolvedValue(comment({ dialogType: "SOLUTION" }));
    prisma.ticket.update.mockResolvedValue({});
    prisma.ticketHistory.create.mockResolvedValue({});

    const result = await serviceWith(prisma).solve(
      "ticket-a",
      { bodyHtml: "<p>Solução aplicada.</p>" },
      current,
    );

    expect(result).toMatchObject({ dialogType: "SOLUTION", bodyText: "Solução aplicada." });
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.CONCLUIDA,
          solvedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: "ticket.solved" }) }),
    );
  });

  it("scopes a portal manager to the assigned customer department", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-manager",
      contactId: "contact-manager",
      customerId: "customer-a",
      departmentId: "customer-department-a",
      branchId: "branch-a",
      accessProfile: "MANAGER",
      active: true,
      contact: { id: "contact-manager", active: true, archivedAt: null },
      department: {
        id: "customer-department-a",
        name: "Financeiro",
        active: true,
        archivedAt: null,
      },
      branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", portalAccessId: "access-manager" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }),
            {
              customerId: "customer-a",
              customerDepartmentId: "customer-department-a",
            },
          ],
        },
      }),
    );
  });

  it("scopes a full-access portal user to the whole customer", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-full",
      contactId: "contact-full",
      customerId: "customer-a",
      departmentId: null,
      branchId: "branch-a",
      accessProfile: "FULL_ACCESS",
      active: true,
      contact: { id: "contact-full", active: true, archivedAt: null },
      department: null,
      branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", portalAccessId: "access-full" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }),
            { customerId: "customer-a" },
          ],
        },
      }),
    );
  });

  it("scopes a collaborator portal user to the contact's own tickets", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-collaborator",
      contactId: "contact-collaborator",
      customerId: "customer-a",
      departmentId: "customer-department-a",
      branchId: "branch-a",
      accessProfile: "COLLABORATOR",
      active: true,
      contact: { id: "contact-collaborator", active: true, archivedAt: null },
      department: {
        id: "customer-department-a",
        name: "Financeiro",
        active: true,
        archivedAt: null,
      },
      branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", portalAccessId: "access-collaborator" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }),
            { customerId: "customer-a", requesterContactId: "contact-collaborator" },
          ],
        },
      }),
    );
  });

  it.each([
    [
      "COLLABORATOR",
      "access-collaborator-summary",
      "contact-collaborator-summary",
      "customer-department-summary",
      { customerId: "customer-a", requesterContactId: "contact-collaborator-summary" },
    ],
    [
      "MANAGER",
      "access-manager-summary",
      "contact-manager-summary",
      "customer-department-summary",
      { customerId: "customer-a", customerDepartmentId: "customer-department-summary" },
    ],
    [
      "FULL_ACCESS",
      "access-full-summary",
      "contact-full-summary",
      null,
      { customerId: "customer-a" },
    ],
  ])(
    "uses the same %s portal scope for summary cards",
    async (accessProfile, accessId, contactId, departmentId, expectedScope) => {
      const prisma = prismaMock();
      prisma.customerPortalAccess.findFirst.mockResolvedValue({
        id: accessId,
        contactId,
        customerId: "customer-a",
        departmentId,
        branchId: "branch-a",
        accessProfile,
        active: true,
        contact: { id: contactId, active: true, archivedAt: null },
        department: departmentId
          ? { id: departmentId, name: "Financeiro", active: true, archivedAt: null }
          : null,
        branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
      });
      prisma.ticket.groupBy.mockResolvedValue([]);

      await serviceWith(prisma).summary(
        {},
        { ...current, roleKey: "customer_portal", portalAccessId: accessId },
      );

      expect(prisma.ticket.groupBy).toHaveBeenCalledWith({
        by: ["status"],
        where: {
          AND: [expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }), expectedScope],
        },
        _count: { _all: true },
      });
    },
  );

  it("builds the portal dashboard only from the full-access customer's tickets", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-full-dashboard",
      contactId: "contact-full",
      customerId: "customer-a",
      departmentId: null,
      branchId: "branch-a",
      accessProfile: "FULL_ACCESS",
      active: true,
      customer: { id: "customer-a", name: "DIPS" },
      contact: { id: "contact-full", active: true, archivedAt: null },
      department: null,
      branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
    });
    prisma.customerDepartment.findMany.mockResolvedValue([
      { id: "customer-department-a", name: "Comercial" },
    ]);
    prisma.customerBranch.findMany.mockResolvedValue([{ id: "branch-a", name: "Matriz" }]);
    prisma.ticket.findMany.mockResolvedValue([
      {
        status: "VALIDADO",
        priority: "ALTA",
        category: "SUPORTE",
        createdAt: new Date("2026-10-01T10:00:00.000Z"),
        solvedAt: new Date("2026-10-01T14:00:00.000Z"),
        closedAt: null,
        validatedAt: new Date("2026-10-01T15:00:00.000Z"),
        customerDepartmentId: "customer-department-a",
        originBranchId: "branch-a",
        customerDepartment: { id: "customer-department-a", name: "Comercial" },
        originBranch: { id: "branch-a", name: "Matriz" },
      },
    ]);

    const result = await serviceWith(prisma).portalDashboard(
      {
        createdFrom: "2026-10-01T00:00:00.000Z",
        createdTo: "2026-10-31T23:59:59.999Z",
      },
      { ...current, roleKey: "customer_portal", portalAccessId: "access-full-dashboard" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              tenantId: "tenant-a",
              archivedAt: null,
              createdAt: {
                gte: new Date("2026-10-01T00:00:00.000Z"),
                lte: new Date("2026-10-31T23:59:59.999Z"),
              },
            }),
            { customerId: "customer-a" },
          ],
        },
      }),
    );
    expect(result.metrics).toMatchObject({ total: 1, completed: 1, averageResolutionHours: 5 });
    expect(result.byDepartment).toEqual([
      { id: "customer-department-a", label: "Comercial", count: 1 },
    ]);
  });

  it("denies the portal dashboard to a manager profile", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-manager-dashboard",
      accessProfile: "MANAGER",
      active: true,
    });

    await expect(
      serviceWith(prisma).portalDashboard(
        {},
        { ...current, roleKey: "customer_portal", portalAccessId: "access-manager-dashboard" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it("returns the protected ticket fields from the active portal link", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-collaborator",
      contactId: "contact-collaborator",
      customerId: "customer-a",
      departmentId: "customer-department-a",
      branchId: "branch-a",
      accessProfile: "COLLABORATOR",
      active: true,
      customer: { id: "customer-a", name: "DIPS" },
      contact: {
        id: "contact-collaborator",
        name: "Douglas Rezende",
        active: true,
        archivedAt: null,
        customerDepartment: { id: "customer-department-contact", name: "Comercial" },
      },
      department: {
        id: "customer-department-a",
        name: "Comercial",
        active: true,
        archivedAt: null,
      },
      branch: { id: "branch-a", name: "Matriz", status: "ACTIVE", archivedAt: null },
    });
    prisma.customerDepartment.findFirst.mockResolvedValue({
      id: "customer-department-a",
      name: "Comercial",
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a", name: "Matriz" });
    prisma.department.findFirst.mockResolvedValue({
      id: "service-department-a",
      name: "Comercial",
    });

    await expect(
      serviceWith(prisma).portalTicketCreateContext({
        ...current,
        roleKey: "customer_portal",
        portalAccessId: "access-collaborator",
      }),
    ).resolves.toEqual({
      customer: { id: "customer-a", name: "DIPS" },
      department: { id: "customer-department-a", name: "Comercial" },
      contact: { id: "contact-collaborator", name: "Douglas Rezende" },
      branch: { id: "branch-a", name: "Matriz" },
      serviceDepartment: { id: "service-department-a", name: "Comercial" },
    });
  });

  it("uses the contact's registered department for a full-access portal link", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-full",
      contactId: "contact-full",
      customerId: "customer-a",
      departmentId: null,
      branchId: "branch-a",
      accessProfile: "FULL_ACCESS",
      active: true,
      customer: { id: "customer-a", name: "DIPS" },
      contact: {
        id: "contact-full",
        name: "Natã Rabelo",
        active: true,
        archivedAt: null,
        customerDepartment: { id: "customer-department-contact", name: "Comercial" },
      },
      department: null,
      branch: { id: "branch-a", name: "Matriz", status: "ACTIVE", archivedAt: null },
    });
    prisma.customerDepartment.findFirst.mockResolvedValue({
      id: "customer-department-contact",
      name: "Comercial",
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a", name: "Matriz" });
    prisma.department.findFirst.mockResolvedValue({
      id: "service-department-a",
      name: "Comercial",
    });

    await serviceWith(prisma).portalTicketCreateContext({
      ...current,
      roleKey: "customer_portal",
      portalAccessId: "access-full",
    });

    expect(prisma.customerDepartment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "customer-department-contact" }),
      }),
    );
  });

  it("uses Atendimento for ticket routing when the customer department has no internal homonym", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-collaborator",
      contactId: "contact-collaborator",
      customerId: "customer-a",
      departmentId: "customer-department-a",
      branchId: "branch-a",
      accessProfile: "COLLABORATOR",
      active: true,
      customer: { id: "customer-a", name: "DIPS" },
      contact: {
        id: "contact-collaborator",
        name: "Douglas Rezende",
        active: true,
        archivedAt: null,
        customerDepartment: { id: "customer-department-a", name: "Comercial" },
      },
      department: {
        id: "customer-department-a",
        name: "Comercial",
        active: true,
        archivedAt: null,
      },
      branch: { id: "branch-a", name: "Matriz", status: "ACTIVE", archivedAt: null },
    });
    prisma.customerDepartment.findFirst.mockResolvedValue({
      id: "customer-department-a",
      name: "Comercial",
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a", name: "Matriz" });
    prisma.department.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "service-department-default", name: "Atendimento" });

    await expect(
      serviceWith(prisma).portalTicketCreateContext({
        ...current,
        roleKey: "customer_portal",
        portalAccessId: "access-collaborator",
      }),
    ).resolves.toEqual({
      customer: { id: "customer-a", name: "DIPS" },
      department: { id: "customer-department-a", name: "Comercial" },
      contact: { id: "contact-collaborator", name: "Douglas Rezende" },
      branch: { id: "branch-a", name: "Matriz" },
      serviceDepartment: { id: "service-department-default", name: "Atendimento" },
    });

    expect(prisma.department.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          name: { equals: "Atendimento", mode: "insensitive" },
        }),
      }),
    );
  });

  it("does not infer a customer actor from an internal membership without portal context", async () => {
    const prisma = prismaMock();

    await expect(serviceWith(prisma)["actorCustomerContact"](current)).resolves.toBeNull();

    expect(prisma.customerPortalAccess.findFirst).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
  });

  it("allows an authorized attendant to choose another active branch and department of the customer", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      customerDepartmentId: "department-from-contact",
      customerBranchId: "branch-from-contact",
    });
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerDepartment.findFirst.mockResolvedValue({ id: "department-selected" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-selected" });

    const result = await serviceWith(prisma)["resolveRelations"](
      {
        requesterContactId: "contact-a",
        customerId: "customer-a",
        customerDepartmentId: "department-selected",
        originBranchId: "branch-selected",
      },
      current,
    );

    expect(result).toMatchObject({
      requesterContactId: "contact-a",
      customerId: "customer-a",
      customerDepartmentId: "department-selected",
      originBranchId: "branch-selected",
    });
  });

  it("does not expose internal dialogs to a customer portal contact", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-manager",
      contactId: "contact-manager",
      customerId: "customer-a",
      customerDepartmentId: "customer-department-a",
      customerBranchId: "branch-a",
      accessProfile: "MANAGER",
      active: true,
      contact: { id: "contact-manager", active: true, archivedAt: null },
      department: {
        id: "customer-department-a",
        name: "Financeiro",
        active: true,
        archivedAt: null,
      },
      branch: { id: "branch-a", status: "ACTIVE", archivedAt: null },
    });
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findMany.mockResolvedValue([]);

    await serviceWith(prisma).comments("ticket-a", {
      ...current,
      roleKey: "customer_portal",
      portalAccessId: "access-manager",
    });

    expect(prisma.ticketComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          ticketId: "ticket-a",
          archivedAt: null,
          internal: false,
        },
      }),
    );
  });

  it("keeps an independent portal access pending until the invitation is accepted", async () => {
    const prisma = prismaMock();
    preparePortalInvitationPersistence(prisma);
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara@example.test",
      accessProfile: "COLLABORATOR",
      department: { name: "Financeiro" },
      branch: { name: "Unidade01" },
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: portalContactDelivery(),
    });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [
        { id: "membership-agent", userId: "user-agent", status: "ACTIVE", role: { key: "agent" } },
      ],
    });

    await expect(
      serviceWith(prisma, undefined, successfulPortalEmail()).inviteCustomerContact(
        "contact-a",
        current,
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });
    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: { active: false },
    });
    expect(prisma.userInvitation.create).toHaveBeenCalled();
  });

  it("accepts numbers in a generic portal login", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: null,
      email: "clara@example.test",
    });
    prisma.customerPortalAccess.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "access-a",
      login: "douglas.rezende2",
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: portalContactDelivery(),
    });
    prisma.customerPortalAccess.create.mockResolvedValue({ id: "access-a" });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [
        { id: "membership-agent", userId: "user-agent", status: "ACTIVE", role: { key: "agent" } },
      ],
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });

    await serviceWith(prisma).linkCustomerPortalUser(
      "customer-a",
      {
        contactId: "contact-a",
        login: "douglas.rezende2",
        accessProfile: "FULL_ACCESS",
        customerBranchId: "branch-a",
        customerDepartmentId: null,
      },
      current,
    );

    expect(prisma.customerPortalAccess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ login: "douglas.rezende2", contactId: "contact-a" }),
    });
  });

  it("links a contact without e-mail by alias and sends the activation through WhatsApp", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendCustomerPortalInvitation: vi.fn(),
    };
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: null,
    });
    prisma.customerPortalAccess.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "access-a",
      login: "flow.id",
      membership: null,
      user: null,
      customer: { id: "customer-a", name: "DIPS" },
      contact: portalContactDelivery({ email: null, name: "Flow iD" }),
    });
    prisma.customerPortalAccess.create.mockResolvedValue({ id: "access-a" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      serviceWith(prisma, undefined, email).linkCustomerPortalUser(
        "customer-a",
        {
          contactId: "contact-a",
          login: "flow.id",
          accessProfile: "FULL_ACCESS",
          customerBranchId: "branch-a",
          customerDepartmentId: null,
        },
        current,
      ),
    ).resolves.toMatchObject({
      status: "pending",
      contactId: "contact-a",
      delivery: { provider: "whatsapp", queued: true },
    });

    expect(email.assertInvitationDeliveryReady).not.toHaveBeenCalled();
    expect(email.sendCustomerPortalInvitation).not.toHaveBeenCalled();
    expect(prisma.userInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactId: "contact-a",
        portalAccessId: "access-a",
        email: expect.stringMatching(/^portal-[a-f0-9]{40}@identity\.trixus\.invalid$/),
      }),
    });
  });

  it("rejects a repeated alias owned by another identity, including a pending access", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: "nata@example.test",
    });
    prisma.customerPortalAccess.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: "user-nata", memberships: [] });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        userId: "user-other",
        user: { email: "outra.pessoa@example.test" },
        contact: { email: "outra.pessoa@example.test" },
      },
    ]);

    await expect(
      serviceWith(prisma).linkCustomerPortalUser(
        "customer-a",
        {
          contactId: "contact-a",
          login: "login.repetido",
          accessProfile: "FULL_ACCESS",
          customerBranchId: "branch-a",
          customerDepartmentId: null,
        },
        current,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "PORTAL_LOGIN_IDENTITY_CONFLICT",
        message: "Este login já pertence a outra pessoa. Informe outro login.",
      },
    });
    expect(prisma.customerPortalAccess.create).not.toHaveBeenCalled();
  });

  it("allows a repeated alias when all accesses belong to the same identity", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-b" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: "nata@example.test",
    });
    prisma.customerPortalAccess.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "access-b",
      login: "nata.rabelo",
      membership: null,
      user: null,
      customer: { id: "customer-b", name: "Cliente B" },
      contact: portalContactDelivery({ email: "nata@example.test", name: "Natã Rabelo" }),
    });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        userId: "user-nata",
        user: { email: "nata@example.test" },
        contact: { email: "nata@example.test" },
      },
    ]);
    prisma.customerPortalAccess.create.mockResolvedValue({ id: "access-b" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-b" });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-nata",
      memberships: [
        { id: "membership-nata", userId: "user-nata", status: "ACTIVE", role: { key: "agent" } },
      ],
    });
    await expect(
      serviceWith(prisma).linkCustomerPortalUser(
        "customer-b",
        {
          contactId: "contact-a",
          login: "nata.rabelo",
          accessProfile: "FULL_ACCESS",
          customerBranchId: "branch-b",
          customerDepartmentId: null,
        },
        current,
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });
  });

  it("allows an internal tenant account to receive a separate portal access", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: "clara@example.test",
    });
    prisma.customerPortalAccess.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "access-a",
      login: "clara@example.test",
      membership: null,
      customer: { id: "customer-a", name: "DIPS" },
      contact: portalContactDelivery(),
    });
    prisma.customerPortalAccess.create.mockResolvedValue({ id: "access-a" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [
        {
          id: "membership-admin",
          userId: "user-admin",
          status: "ACTIVE",
          role: { key: "tenant_admin" },
        },
      ],
    });

    await expect(
      serviceWith(prisma).linkCustomerPortalUser(
        "customer-a",
        {
          contactId: "contact-a",
          login: "douglas.rezende2",
          accessProfile: "FULL_ACCESS",
          customerBranchId: "branch-a",
          customerDepartmentId: null,
        },
        current,
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });

    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: { active: false },
    });
    expect(prisma.role.upsert).toHaveBeenCalledWith({
      where: { tenantId_key: { tenantId: "tenant-a", key: "customer_portal" } },
      create: expect.objectContaining({ tenantId: "tenant-a", key: "customer_portal" }),
      update: { active: true },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: ["tickets.read", "tickets.create", "tickets.update"].map((permissionId) => ({
        roleId: "role-portal",
        permissionId,
      })),
      skipDuplicates: true,
    });
    expect(prisma.userInvitation.create).toHaveBeenCalled();
  });

  it("requires a new activation when a removed portal link is created again", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: "nata@example.test",
    });
    prisma.customerPortalAccess.findFirst
      .mockResolvedValueOnce({
        id: "access-a",
        active: false,
        revokedAt: new Date("2026-10-22T12:00:00.000Z"),
        invitations: [{ expiresAt: new Date(Date.now() + 60_000) }],
      })
      .mockResolvedValueOnce({
        id: "access-a",
        login: "nata.rabelo",
        membership: null,
        customer: { id: "customer-a", name: "DIPS" },
        contact: portalContactDelivery({ email: "nata@example.test", name: "Natã Rabelo" }),
      });
    prisma.customerPortalAccess.update.mockResolvedValue({ id: "access-a" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.customerDepartment.findFirst.mockResolvedValue({ id: "department-a" });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [
        {
          id: "membership-internal",
          userId: "user-internal",
          status: "ACTIVE",
          role: { key: "agent" },
        },
      ],
    });

    await expect(
      serviceWith(prisma).linkCustomerPortalUser(
        "customer-a",
        {
          contactId: "contact-a",
          login: "nata.rabelo",
          accessProfile: "COLLABORATOR",
          customerBranchId: "branch-a",
          customerDepartmentId: "department-a",
        },
        current,
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });

    expect(prisma.customerPortalAccess.create).not.toHaveBeenCalled();
    expect(prisma.customerPortalAccess.update).toHaveBeenNthCalledWith(1, {
      where: { id: "access-a" },
      data: {
        login: "nata.rabelo",
        accessProfile: "COLLABORATOR",
        departmentId: "department-a",
        branchId: "branch-a",
        active: false,
        revokedAt: null,
        userId: null,
        membershipId: null,
      },
    });
    expect(prisma.userInvitation.create).toHaveBeenCalled();
    expect(
      prisma.customerPortalAccess.update.mock.calls.some((call) => call[0]?.data?.active === true),
    ).toBe(false);
  });

  it("clears a stale identity before reusing an inactive access after the contact email changed", async () => {
    const prisma = prismaMock();
    preparePortalWhatsAppDelivery(prisma);
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      customerId: "customer-a",
      email: "novo@example.test",
    });
    prisma.customerPortalAccess.findFirst
      .mockResolvedValueOnce({
        id: "access-a",
        active: false,
        userId: "user-old",
        membershipId: "membership-old",
        user: { email: "antigo@example.test" },
        membership: { user: { email: "antigo@example.test" } },
        invitations: [],
      })
      .mockResolvedValueOnce({
        id: "access-a",
        login: "novo.login",
        membership: null,
        user: null,
        customer: { id: "customer-a", name: "DIPS" },
        contact: portalContactDelivery({ email: "novo@example.test", name: "Contato Novo" }),
      });
    prisma.customerPortalAccess.update.mockResolvedValue({ id: "access-a" });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-new" }).mockResolvedValueOnce({
      id: "user-new",
      memberships: [
        {
          id: "membership-new",
          userId: "user-new",
          status: "ACTIVE",
          role: { key: "agent" },
        },
      ],
    });
    await serviceWith(prisma).linkCustomerPortalUser(
      "customer-a",
      {
        contactId: "contact-a",
        login: "novo.login",
        accessProfile: "FULL_ACCESS",
        customerBranchId: "branch-a",
        customerDepartmentId: null,
      },
      current,
    );

    expect(prisma.customerPortalAccess.update).toHaveBeenNthCalledWith(1, {
      where: { id: "access-a" },
      data: {
        login: "novo.login",
        accessProfile: "FULL_ACCESS",
        departmentId: null,
        branchId: "branch-a",
        active: false,
        revokedAt: null,
        userId: null,
        membershipId: null,
      },
    });
    expect(prisma.customerPortalAccess.update).toHaveBeenNthCalledWith(2, {
      where: { id: "access-a" },
      data: { active: false },
    });
  });

  it("never reactivates a membership whose user email differs from the contact", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "nata.rabelo",
      active: false,
      userId: "user-old",
      user: { email: "antigo@example.test" },
      membership: {
        id: "membership-old",
        status: "ACTIVE",
        user: { email: "antigo@example.test" },
      },
      customer: { id: "customer-a", name: "DIPS" },
      contact: {
        id: "contact-a",
        active: true,
        archivedAt: null,
        email: "novo@example.test",
      },
    });

    await expect(
      serviceWith(prisma).inviteCustomerContact("contact-a", current, "customer-a"),
    ).rejects.toMatchObject({
      response: { code: "PORTAL_ACCESS_IDENTITY_MISMATCH" },
    });
    expect(prisma.customerPortalAccess.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lists only contacts explicitly linked to the customer portal", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara.silva",
        active: true,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: null,
        contact: {
          id: "contact-a",
          name: "Clara",
          email: "clara@example.test",
          phone: "+5562999999999",
          active: true,
        },
        invitations: [{ id: "invite-a", expiresAt: new Date(Date.now() + 60_000) }],
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(prisma.customerPortalAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          customerId: "customer-a",
          revokedAt: null,
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ login: "clara.silva", accessStatus: "PENDING" }),
    ]);
  });

  it("does not report an access as active before an invitation is accepted", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara@example.test",
        active: true,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: { status: "ACTIVE" },
        contact: portalContactDelivery(),
        invitations: [{ id: "invite-a", expiresAt: new Date(Date.now() + 60_000) }],
        _count: { invitations: 0 },
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(result[0]).toMatchObject({ accessStatus: "PENDING" });
  });

  it("keeps a recreated link pending even when the access has an accepted invitation in its history", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara@example.test",
        active: true,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: { status: "ACTIVE" },
        contact: portalContactDelivery(),
        invitations: [{ id: "invite-new", expiresAt: new Date(Date.now() + 60_000) }],
        _count: { invitations: 1 },
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(result[0]).toMatchObject({ accessStatus: "PENDING" });
  });

  it("reports an access as active only after an invitation was accepted", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara@example.test",
        active: true,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: { status: "ACTIVE" },
        contact: portalContactDelivery(),
        invitations: [],
        _count: { invitations: 1 },
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(result[0]).toMatchObject({ accessStatus: "ACTIVE" });
  });

  it("reports an expired pending invitation separately and keeps it available for resend", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara@example.test",
        active: false,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: null,
        contact: portalContactDelivery(),
        invitations: [{ id: "invite-a", expiresAt: new Date(Date.now() - 60_000) }],
        _count: { invitations: 0 },
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(result[0]).toMatchObject({ accessStatus: "EXPIRED" });
  });

  it("keeps a deactivated contact access visible when it was not explicitly revoked", async () => {
    const prisma = prismaMock();
    prisma.customer.findFirst.mockResolvedValue({ id: "customer-a" });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        id: "access-a",
        login: "clara.silva",
        active: false,
        accessProfile: "COLLABORATOR",
        branch: null,
        department: null,
        membership: null,
        contact: {
          id: "contact-a",
          name: "Clara",
          email: "clara@example.test",
          phone: "+5562999999999",
          active: false,
        },
        invitations: [],
      },
    ]);

    const result = await serviceWith(prisma).listCustomerPortalUsers("customer-a", current);

    expect(result).toEqual([
      expect.objectContaining({ login: "clara.silva", accessStatus: "DISABLED" }),
    ]);
    expect(prisma.customerPortalAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });

  it("updates the portal login and access assignment without changing the customer link", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      contact: { id: "contact-a", email: "clara@example.test" },
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });

    await expect(
      serviceWith(prisma).updateCustomerPortalUser(
        "customer-a",
        "contact-a",
        {
          login: "clara.silva",
          accessProfile: "FULL_ACCESS",
          customerDepartmentId: null,
          customerBranchId: "branch-a",
        },
        current,
      ),
    ).resolves.toEqual({
      contactId: "contact-a",
      login: "clara.silva",
      accessProfile: "FULL_ACCESS",
      customerDepartmentId: null,
      customerBranchId: "branch-a",
    });

    expect(prisma.customerPortalAccess.findFirst.mock.calls[0]?.[0]).toEqual({
      where: {
        tenantId: "tenant-a",
        customerId: "customer-a",
        contactId: "contact-a",
        revokedAt: null,
        contact: { archivedAt: null },
      },
      include: {
        contact: { select: { id: true, email: true } },
        user: { select: { email: true } },
        membership: { select: { user: { select: { email: true } } } },
      },
    });
    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: {
        login: "clara.silva",
        accessProfile: "FULL_ACCESS",
        departmentId: null,
        branchId: "branch-a",
      },
    });
  });

  it("disables one portal access without revoking the row or changing the internal membership", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      active: true,
      contact: { id: "contact-a", email: "clara@example.test" },
      user: { email: "clara@example.test" },
      membership: { user: { email: "clara@example.test" } },
    });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );

    await expect(
      serviceWith(prisma).updateCustomerPortalUser(
        "customer-a",
        "contact-a",
        {
          login: "clara@example.test",
          accessProfile: "FULL_ACCESS",
          customerDepartmentId: null,
          customerBranchId: "branch-a",
          active: false,
        },
        current,
      ),
    ).resolves.toMatchObject({ contactId: "contact-a", active: false, status: "disabled" });

    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: expect.objectContaining({ active: false }),
    });
    expect(prisma.customerPortalAccess.update.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      "revokedAt",
    );
    expect(prisma.userInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        portalAccessId: "access-a",
        status: "PENDING",
      },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", portalAccessId: "access-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
  });

  it("keeps a disabled access pending after queuing a new WhatsApp invitation", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst
      .mockResolvedValueOnce({
        id: "access-a",
        active: false,
        contact: { id: "contact-a", email: "clara@example.test" },
        user: { email: "clara@example.test" },
        membership: { user: { email: "clara@example.test" } },
      })
      .mockResolvedValueOnce({
        id: "access-a",
        login: "clara.silva",
        active: false,
        userId: "user-clara",
        user: { email: "clara@example.test" },
        membership: {
          id: "membership-internal",
          userId: "user-clara",
          status: "ACTIVE",
          user: { email: "clara@example.test" },
        },
        customer: { id: "customer-a", name: "SDE" },
        contact: {
          id: "contact-a",
          active: true,
          archivedAt: null,
          name: "Clara",
          email: "clara@example.test",
          phone: "+55 62 99999-9999",
          normalizedPhone: "5562999999999",
          instance: "whatsapp-principal",
          instanceIds: ["connection-a"],
        },
      });
    prisma.customerBranch.findFirst.mockResolvedValue({ id: "branch-a" });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [
        {
          id: "membership-internal",
          userId: "user-clara",
          status: "ACTIVE",
          role: { key: "agent" },
        },
      ],
    });
    prisma.messagingConnection.findMany.mockResolvedValue([
      { id: "connection-a", name: "WhatsApp principal", externalReference: "evolution-a" },
    ]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });
    prisma.conversation.create.mockResolvedValue({ id: "conversation-invitation" });
    prisma.message.create.mockResolvedValue({ id: "message-invitation" });

    const result = await serviceWith(prisma).updateCustomerPortalUser(
      "customer-a",
      "contact-a",
      {
        login: "clara.silva",
        accessProfile: "FULL_ACCESS",
        customerDepartmentId: null,
        customerBranchId: "branch-a",
        active: true,
      },
      current,
    );

    expect(result).toMatchObject({
      contactId: "contact-a",
      status: "pending",
      delivery: { provider: "whatsapp", queued: true },
    });
    expect(prisma.customerPortalAccess.update).toHaveBeenLastCalledWith({
      where: { id: "access-a" },
      data: { active: false },
    });
    expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
  });

  it("rejects changing an access to an alias owned by another identity", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      userId: "user-clara",
      user: { email: "clara@example.test" },
      membership: null,
      contact: { id: "contact-a", email: "clara@example.test" },
    });
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      {
        userId: "user-other",
        user: { email: "outra@example.test" },
        contact: { email: "outra@example.test" },
      },
    ]);

    await expect(
      serviceWith(prisma).updateCustomerPortalUser(
        "customer-a",
        "contact-a",
        {
          login: "alias.de.outra.pessoa",
          accessProfile: "FULL_ACCESS",
          customerDepartmentId: null,
          customerBranchId: "branch-a",
        },
        current,
      ),
    ).rejects.toMatchObject({ response: { code: "PORTAL_LOGIN_IDENTITY_CONFLICT" } });

    expect(prisma.customerPortalAccess.update).not.toHaveBeenCalled();
  });

  it("revokes portal access without removing the contact from the customer", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara.silva",
      accessProfile: "COLLABORATOR",
      customer: { name: "SDE" },
      department: { name: "Financeiro" },
      branch: { name: "Unidade01" },
      contact: {
        id: "contact-a",
        name: "Clara",
        instance: "whatsapp-principal",
        instanceIds: ["connection-a"],
        customerDepartment: { name: "Financeiro" },
        customerBranch: { name: "Unidade01" },
      },
    });
    prisma.messagingConnection.findMany.mockResolvedValue([
      { id: "connection-a", name: "WhatsApp principal", externalReference: "evolution-a" },
    ]);
    prisma.conversation.create.mockResolvedValue({ id: "conversation-removal" });
    prisma.message.create.mockResolvedValue({ id: "message-removal" });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );

    const result = await serviceWith(prisma).revokeCustomerPortalUser(
      "customer-a",
      "contact-a",
      current,
    );

    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: {
        active: false,
        revokedAt: expect.any(Date),
        userId: null,
        membershipId: null,
      },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ portalAccessId: "access-a" }),
      }),
    );
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "QUEUED",
        clientMessageId: expect.stringMatching(/^portal-access-removal:access-a:/),
        content: expect.stringMatching(
          /acesso ao Portal do Cliente da SDE foi removido[\s\S]*Nome: Clara[\s\S]*Login: clara\.silva[\s\S]*Perfil: Colaborador[\s\S]*Departamento: Financeiro[\s\S]*Filial: Unidade01/,
        ),
      }),
      select: { id: true },
    });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        protocol: "000042",
        lastMessagePreview: "Conversa encerrada - protocolo 000042.",
      }),
      select: { id: true },
    });
    expect(prisma.message.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ content: "Conversa iniciada - protocolo 000042." }),
        expect.objectContaining({ content: "Conversa encerrada - protocolo 000042." }),
      ],
    });
    expect(result).toMatchObject({
      revoked: true,
      contactId: "contact-a",
      delivery: { provider: "whatsapp", queued: true, protocol: "000042" },
    });
  });

  it("resends the invitation for the customer selected by the client screen", async () => {
    const prisma = prismaMock();
    preparePortalInvitationPersistence(prisma);
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-customer-b" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-customer-b",
      login: "clara@example.test",
      active: false,
      membership: { id: "membership-a", status: "ACTIVE" },
      customer: { id: "customer-b", name: "Cliente B" },
      contact: portalContactDelivery(),
    });

    await expect(
      serviceWith(prisma, undefined, successfulPortalEmail()).inviteCustomerContact(
        "contact-a",
        current,
        "customer-b",
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });

    expect(prisma.customerPortalAccess.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        contactId: "contact-a",
        customerId: "customer-b",
        revokedAt: null,
        contact: { archivedAt: null, active: true },
      },
      select: { id: true },
    });
    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-customer-b" },
      data: { active: false },
    });
  });

  it("requires a customer selection when a generic resend finds multiple accesses", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findMany.mockResolvedValue([
      { id: "access-customer-a" },
      { id: "access-customer-b" },
    ]);

    await expect(
      serviceWith(prisma).inviteCustomerContact("contact-a", current),
    ).rejects.toMatchObject({
      response: {
        code: "CUSTOMER_PORTAL_ACCESS_SELECTION_REQUIRED",
        message: "Selecione o cliente para reenviar o convite deste contato.",
      },
    });
    expect(prisma.customerPortalAccess.findFirst).not.toHaveBeenCalled();
  });

  it("does not invite an inactive customer contact", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findMany.mockResolvedValue([]);

    await expect(serviceWith(prisma).inviteCustomerContact("contact-a", current)).rejects.toThrow(
      "Contato ativo com acesso ao portal é obrigatório",
    );
    expect(prisma.customerPortalAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contactId: "contact-a" }),
      }),
    );
    expect(prisma.userInvitation.create).not.toHaveBeenCalled();
  });

  it("keeps restored portal access pending until the new invitation is accepted", async () => {
    const prisma = prismaMock();
    preparePortalInvitationPersistence(prisma);
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara@example.test",
      customer: { id: "customer-a", name: "SDE" },
      membership: { id: "portal-membership", status: "ACTIVE" },
      active: false,
      contact: portalContactDelivery(),
    });

    await expect(
      serviceWith(prisma, undefined, successfulPortalEmail()).inviteCustomerContact(
        "contact-a",
        current,
      ),
    ).resolves.toMatchObject({ status: "pending", contactId: "contact-a" });
    expect(prisma.customerPortalAccess.update).toHaveBeenCalledWith({
      where: { id: "access-a" },
      data: { active: false },
    });
  });

  it("hides all tickets from an inactive portal contact", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      contactId: "contact-a",
      active: false,
      customerId: "customer-a",
      accessProfile: "FULL_ACCESS",
      contact: { id: "contact-a", active: true, archivedAt: null },
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", portalAccessId: "access-a" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }),
            { id: "__customer_portal_without_active_contact__" },
          ],
        },
      }),
    );
  });

  it("creates a portal invitation with only the ticket permissions", async () => {
    const prisma = prismaMock();
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendCustomerPortalInvitation: vi
        .fn()
        .mockResolvedValue({ delivered: true, provider: "resend", messageId: "message-a" }),
    };
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara@example.test",
      accessProfile: "COLLABORATOR",
      department: { name: "Financeiro" },
      branch: { name: "Unidade01" },
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: {
        id: "contact-a",
        active: true,
        archivedAt: null,
        name: "Clara",
        email: "Clara@Example.Test",
      },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });

    const beforeInvitation = Date.now();
    const result = await serviceWith(prisma, undefined, email).inviteCustomerContact(
      "contact-a",
      current,
    );

    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: {
        roleId: "role-portal",
        permissionId: { notIn: ["tickets.read", "tickets.create", "tickets.update"] },
      },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: ["tickets.read", "tickets.create", "tickets.update"].map((permissionId) => ({
        roleId: "role-portal",
        permissionId,
      })),
      skipDuplicates: true,
    });
    expect(email.sendCustomerPortalInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "clara@example.test",
        contactName: "Clara",
        login: "clara@example.test",
        profileName: "Colaborador",
        departmentName: "Financeiro",
        branchName: "Unidade01",
      }),
    );
    expect(prisma.userInvitation.updateMany).not.toHaveBeenCalled();
    const invitationExpiresAt = prisma.userInvitation.create.mock.calls[0]?.[0]?.data
      ?.expiresAt as Date;
    expect(invitationExpiresAt.getTime()).toBeGreaterThanOrEqual(
      beforeInvitation + 48 * 60 * 60_000,
    );
    expect(invitationExpiresAt.getTime()).toBeLessThanOrEqual(
      beforeInvitation + 48 * 60 * 60_000 + 1_000,
    );
    expect(result).toMatchObject({
      id: "invitation-a",
      contactId: "contact-a",
      email: "clara@example.test",
      status: "pending",
      delivery: { delivered: true, provider: "resend" },
      deliveries: {
        email: { delivered: true, provider: "resend" },
        whatsapp: { delivered: false, provider: "whatsapp" },
      },
    });
  });

  it("uses the configured tenant app URL in the customer portal invitation", async () => {
    vi.stubEnv("TRIXUS_TENANT_APP_URL", "https://hom.trixus.com.br/");
    vi.stubEnv("TENANT_APP_URL", "http://localhost:3000");

    const prisma = prismaMock();
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendCustomerPortalInvitation: vi.fn().mockRejectedValue(new Error("SMTP indisponível")),
    };
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara@example.test",
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: {
        id: "contact-a",
        active: true,
        archivedAt: null,
        name: "Clara",
        email: "clara@example.test",
        phone: "+55 62 99999-9999",
        normalizedPhone: "5562999999999",
        instance: "whatsapp-principal",
        instanceIds: ["connection-a"],
      },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });
    prisma.messagingConnection.findMany.mockResolvedValue([
      { id: "connection-a", name: "WhatsApp principal", externalReference: "evolution-a" },
    ]);
    prisma.conversation.create.mockResolvedValue({ id: "conversation-invitation" });
    prisma.message.create.mockResolvedValue({ id: "message-invitation" });

    const result = await serviceWith(prisma, undefined, email).inviteCustomerContact(
      "contact-a",
      current,
    );

    expect(email.sendCustomerPortalInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptUrl: expect.stringMatching(
          /^https:\/\/hom\.trixus\.com\.br\/login\/portal-cliente\?invite=[A-Za-z0-9_-]+$/,
        ),
      }),
    );
    expect(result).toMatchObject({
      status: "pending",
      delivery: { provider: "whatsapp", queued: true },
      deliveries: {
        email: { delivered: false, provider: "email", error: "SMTP indisponível" },
        whatsapp: { provider: "whatsapp", queued: true },
      },
    });
  });

  it("queues a generic-login invitation by WhatsApp in its own closed conversation", async () => {
    vi.stubEnv("TRIXUS_TENANT_APP_URL", "https://hom.trixus.com.br/");
    const prisma = prismaMock();
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendCustomerPortalInvitation: vi.fn(),
    };
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara.silva",
      accessProfile: "COLLABORATOR",
      department: { name: "Financeiro" },
      branch: { name: "Unidade01" },
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: {
        id: "contact-a",
        active: true,
        archivedAt: null,
        name: "Clara",
        phone: "+55 62 99999-9999",
        normalizedPhone: "5562999999999",
        email: "clara@example.test",
        instance: "whatsapp-principal",
        instanceIds: ["connection-a"],
      },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.messagingConnection.findMany.mockResolvedValue([
      { id: "connection-a", name: "WhatsApp principal", externalReference: "evolution-a" },
    ]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });
    prisma.conversation.create.mockResolvedValue({ id: "conversation-invitation" });
    prisma.message.create.mockResolvedValue({ id: "message-invitation" });

    const result = await serviceWith(prisma, undefined, email).inviteCustomerContact(
      "contact-a",
      current,
    );

    expect(email.assertInvitationDeliveryReady).not.toHaveBeenCalled();
    expect(email.sendCustomerPortalInvitation).not.toHaveBeenCalled();
    expect(prisma.messagingConnection.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-a",
        status: "CONNECTED",
        providerType: { in: ["EVOLUTION", "META_CLOUD"] },
      }),
      select: { id: true, name: true, externalReference: true },
    });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        contactId: "contact-a",
        connectionId: "connection-a",
        status: "FECHADA",
        protocol: "000042",
        closedAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(prisma.message.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          direction: "SYSTEM",
          type: "SYSTEM",
          content: "Conversa iniciada - protocolo 000042.",
        }),
        expect.objectContaining({
          direction: "SYSTEM",
          type: "SYSTEM",
          content: "Conversa encerrada - protocolo 000042.",
        }),
      ],
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conversation-invitation",
        connectionId: "connection-a",
        status: "QUEUED",
        clientMessageId: "portal-invitation:invitation-a",
        content: expect.stringMatching(
          /Nome: Clara[\s\S]*Login: clara\.silva[\s\S]*Perfil: Colaborador[\s\S]*Departamento: Financeiro[\s\S]*Filial: Unidade01[\s\S]*https:\/\/hom\.trixus\.com\.br\/login\/portal-cliente\?invite=/,
        ),
      }),
      select: { id: true },
    });
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "MESSAGING_OUTBOUND_REQUESTED",
        aggregateId: "message-invitation",
      }),
    });
    expect(result).toMatchObject({
      status: "pending",
      delivery: {
        delivered: false,
        queued: true,
        provider: "whatsapp",
        conversationId: "conversation-invitation",
        protocol: "000042",
      },
    });
  });

  it("revokes the invitation when a generic login has no connected WhatsApp instance", async () => {
    const prisma = prismaMock();
    prisma.customerPortalAccess.findMany.mockResolvedValue([{ id: "access-a" }]);
    prisma.customerPortalAccess.findFirst.mockResolvedValue({
      id: "access-a",
      login: "clara.silva",
      membership: null,
      customer: { id: "customer-a", name: "SDE" },
      contact: {
        id: "contact-a",
        active: true,
        archivedAt: null,
        name: "Clara",
        phone: "+55 62 99999-9999",
        normalizedPhone: "5562999999999",
        email: "clara@example.test",
        instance: null,
        instanceIds: ["connection-a"],
      },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.messagingConnection.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });

    await expect(serviceWith(prisma).inviteCustomerContact("contact-a", current)).rejects.toThrow(
      "Nenhuma instância de WhatsApp vinculada ao contato está conectada.",
    );

    expect(prisma.userInvitation.updateMany).toHaveBeenLastCalledWith({
      where: { id: "invitation-a", tenantId: "tenant-a", status: "PENDING" },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("TicketsService dialog attachment association", () => {
  it("rejects an attachment when the informed dialog does not belong to the ticket", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findFirst.mockResolvedValue(null);

    await expect(
      serviceWith(prisma).uploadAttachment(
        "ticket-a",
        { headers: { "x-comment-id": "comment-from-another-ticket" } } as never,
        current,
      ),
    ).rejects.toThrow("Diálogo do anexo não encontrado neste chamado.");

    expect(prisma.ticketComment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "comment-from-another-ticket",
        tenantId: "tenant-a",
        ticketId: "ticket-a",
        archivedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.ticketAttachment.create).not.toHaveBeenCalled();
  });

  it("returns the dialog identifier with each centralized attachment", async () => {
    const prisma = prismaMock();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketAttachment.findMany.mockResolvedValue([
      {
        id: "attachment-a",
        commentId: "comment-a",
        uploadedByMembershipId: "membership-a",
        uploadedByNameSnapshot: null,
        uploadedByMembership: {
          id: "membership-a",
          presentationName: "Douglas Rezende",
          user: { name: "Nome global" },
        },
        originalNameSanitized: "evidencia.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: "READY",
        scanStatus: "CLEAN",
        createdAt: new Date("2026-10-23T12:00:00.000Z"),
        deletedAt: null,
      },
    ]);

    await expect(serviceWith(prisma).attachments("ticket-a", current)).resolves.toEqual([
      expect.objectContaining({
        id: "attachment-a",
        commentId: "comment-a",
        uploadedBy: { id: "membership-a", name: "Douglas Rezende" },
      }),
    ]);
  });
});

describe("persisted conversation images", () => {
  const imageActor = { ...current, permissions: [...current.permissions, "conversations.read"] };
  function setup() {
    const prisma = prismaMock();
    prisma.department.findFirst.mockResolvedValue({ id: "department-a" });
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-a",
      contactId: null,
      contact: null,
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.ticketProtocolCounter.update.mockResolvedValue({ lastNumber: 1 });
    prisma.ticket.create.mockResolvedValue(ticket());
    prisma.ticketHistory.create.mockResolvedValue({});
    Object.assign(prisma.ticket, { findUniqueOrThrow: vi.fn().mockResolvedValue(ticket()) });
    const storage = {
      completeUpload: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const media = {
      readObject: vi.fn().mockResolvedValue(Buffer.from("89504e470d0a1a0a00000000", "hex")),
    };
    const service = serviceWith(prisma);
    Object.assign(service, {
      storage,
      messagingMediaStorage: media,
      scanner: { scan: vi.fn().mockResolvedValue("NOT_SCANNED") },
      entitlements: {
        assertFeature: vi.fn(),
        getUsage: vi.fn().mockResolvedValue({ storageBytes: 0 }),
        assertWithinLimit: vi.fn(),
      },
    });
    const image = {
      id: "message-image",
      mediaStorageKey: "tenants/tenant-a/image.png",
      mediaMimeType: "image/png",
      mediaFileName: "image.png",
      mediaChecksum: null,
    };
    prisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([image]);
    const dto = {
      title: "Chamado com imagem",
      departmentId: "department-a",
      conversationId: "conversation-a",
      descriptionHtml:
        '<p>Histórico</p><img src="/ticket-images/conversations/conversation-a/messages/message-image">',
    };
    return { prisma, service, storage, media, dto };
  }

  it("stores image bytes as ticket attachments and persists only the new ticket reference", async () => {
    const { prisma, service, storage, dto } = setup();
    await service.create(dto, imageActor);
    const data = prisma.ticket.create.mock.calls[0][0].data;
    const attachment = prisma.ticketAttachment.create.mock.calls[0][0].data;
    expect(data.descriptionHtmlSanitized).toContain(
      `/ticket-images/tickets/${data.id}/attachments/${attachment.id}`,
    );
    expect(data.descriptionHtmlSanitized).not.toMatch(/data:|blob:|conversations\//);
    expect(attachment).toMatchObject({
      tenantId: "tenant-a",
      ticketId: "ticket-a",
      sourceMessageId: "message-image",
      status: "READY",
    });
    expect(storage.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.any(Buffer), mimeType: "image/png" }),
    );
    expect(prisma.message.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          conversationId: "conversation-a",
          id: { in: ["message-image"] },
        }),
      }),
    );
  });

  it("rejects a different conversation or unresolved message before storing anything", async () => {
    const first = setup();
    first.dto.descriptionHtml = first.dto.descriptionHtml.replace(
      "conversation-a/messages",
      "conversation-other/messages",
    );
    await expect(first.service.create(first.dto, imageActor)).rejects.toThrow("não pertence");
    expect(first.storage.completeUpload).not.toHaveBeenCalled();
    const second = setup();
    second.prisma.message.findMany.mockReset().mockResolvedValue([]);
    await expect(second.service.create(second.dto, imageActor)).rejects.toThrow(
      "não está disponível",
    );
    expect(second.storage.completeUpload).not.toHaveBeenCalled();
  });

  it("requires chat read access and rechecks conversation visibility before copying images", async () => {
    const first = setup();
    await expect(first.service.create(first.dto, current)).rejects.toThrow("Sem permissão");
    expect(first.storage.completeUpload).not.toHaveBeenCalled();
    const second = setup();
    second.prisma.conversation.findFirst
      .mockResolvedValueOnce({ id: "conversation-a" })
      .mockResolvedValueOnce(null);
    await expect(second.service.create(second.dto, imageActor)).rejects.toThrow(
      "Conversa não encontrada",
    );
    expect(second.storage.completeUpload).not.toHaveBeenCalled();
  });

  it("rejects more than ten image references rather than silently dropping images", async () => {
    const { service, storage, dto } = setup();
    dto.descriptionHtml =
      "<p>Histórico</p>" +
      Array.from(
        { length: 11 },
        (_, i) => `<img src="/ticket-images/conversations/conversation-a/messages/image-${i}">`,
      ).join("");
    await expect(service.create(dto, imageActor)).rejects.toThrow("máximo 10");
    expect(storage.completeUpload).not.toHaveBeenCalled();
  });

  it("compensates both a partial storage failure and a history failure", async () => {
    for (const failure of ["storage", "history"]) {
      const { prisma, service, storage, dto } = setup();
      if (failure === "storage")
        storage.completeUpload.mockRejectedValue(new Error("partial write"));
      else prisma.ticketHistory.create.mockRejectedValue(new Error("history failed"));
      await expect(service.create(dto, imageActor)).rejects.toThrow();
      expect(storage.deleteObject).toHaveBeenCalledWith(
        storage.completeUpload.mock.calls[0][0].objectKey,
      );
    }
  });

  it("rejects unresolved chat references and other-ticket references in persisted dialogs", async () => {
    for (const source of [
      "/ticket-images/conversations/conversation-a/messages/message-image",
      "/ticket-images/tickets/other-ticket/attachments/image-a",
    ]) {
      const { prisma, service } = setup();
      prisma.ticket.findFirst.mockResolvedValue(ticket());
      await expect(
        service.createComment(
          "ticket-a",
          { bodyHtml: `<p>Imagem</p><img src="${source}">` },
          imageActor,
        ),
      ).rejects.toThrow("não pertence");
      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    }
  });

  it("rejects image references from another ticket when updating an existing description", async () => {
    const { prisma, service } = setup();
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    await expect(
      service.update(
        "ticket-a",
        {
          descriptionHtml:
            '<p>Imagem</p><img src="/ticket-images/tickets/other-ticket/attachments/image-a">',
        },
        current,
      ),
    ).rejects.toThrow("não pertence");
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

function serviceWith(
  prisma: ReturnType<typeof prismaMock>,
  cleanup: { process: ReturnType<typeof vi.fn> } | undefined = { process: vi.fn() },
  email?: {
    assertInvitationDeliveryReady: ReturnType<typeof vi.fn>;
    sendCustomerPortalInvitation: ReturnType<typeof vi.fn>;
  },
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
    (cleanup ?? { process: vi.fn() }) as never,
    {} as never,
    email as never,
  );
}

function successfulPortalEmail() {
  return {
    assertInvitationDeliveryReady: vi.fn(),
    sendCustomerPortalInvitation: vi
      .fn()
      .mockResolvedValue({ delivered: true, provider: "resend", messageId: "message-a" }),
  };
}

function preparePortalInvitationPersistence(prisma: ReturnType<typeof prismaMock>) {
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(prisma),
  );
  prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
  prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });
}

function preparePortalWhatsAppDelivery(prisma: ReturnType<typeof prismaMock>) {
  preparePortalInvitationPersistence(prisma);
  prisma.messagingConnection.findMany.mockResolvedValue([
    { id: "connection-a", name: "WhatsApp principal", externalReference: "evolution-a" },
  ]);
  prisma.conversation.create.mockResolvedValue({ id: "conversation-invitation" });
  prisma.message.create.mockResolvedValue({ id: "message-invitation" });
}

function portalContactDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-a",
    active: true,
    archivedAt: null,
    name: "Clara",
    email: "clara@example.test",
    phone: "+55 62 99999-9999",
    normalizedPhone: "5562999999999",
    instance: "whatsapp-principal",
    instanceIds: ["connection-a"],
    ...overrides,
  };
}

function prismaMock() {
  return {
    $transaction: vi.fn(),
    department: { findFirst: vi.fn() },
    departmentMembership: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    messagingConnection: { findMany: vi.fn() },
    contact: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    customerPortalAccess: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    customer: { findFirst: vi.fn() },
    customerBranch: { findFirst: vi.fn(), findMany: vi.fn() },
    customerDepartment: { findFirst: vi.fn(), findMany: vi.fn() },
    tenantMembership: { findFirst: vi.fn(), update: vi.fn() },
    authSession: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    role: { upsert: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
    userInvitation: { create: vi.fn(), updateMany: vi.fn() },
    conversationProtocolCounter: {
      upsert: vi.fn().mockResolvedValue({ lastNumber: 42 }),
    },
    ticketProtocolCounter: { upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    ticketApproval: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    ticket: {
      create: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { number: 0 } }),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    ticketComment: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    ticketHistory: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    ticketAttachment: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };
}

function comment(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-10-16T12:00:00.000Z");
  return {
    id: "comment-a",
    bodyText: "Solução aplicada.",
    bodyHtmlSanitized: "<p>Solução aplicada.</p>",
    internal: false,
    dialogType: "RESPONSE",
    editedAt: null,
    createdAt: now,
    updatedAt: now,
    authorMembership: {
      id: "membership-agent",
      user: { id: "user-agent", name: "Atendente", email: "agent@trixus.test" },
    },
    ...overrides,
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
  prisma.ticketApproval.findMany.mockResolvedValue([
    {
      id: "approval-a",
      kind: "SUPPORT",
      status: "PENDING",
      requestedAt: new Date("2026-10-08T12:03:00Z"),
      decidedAt: null,
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
    customerDepartmentId: null,
    originBranchId: null,
    conversationId: null,
    assignedMembershipId: null,
    createdByMembershipId: "membership-agent",
    createdByNameSnapshot: null,
    closedAt: null,
    startedAt: null,
    approvedAt: null,
    solvedAt: null,
    validatedAt: null,
    substatus: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    department: { id: "department-other", name: "Financeiro", color: "#000000" },
    requesterContact: null,
    customer: null,
    customerDepartment: null,
    originBranch: null,
    conversation: null,
    assignedMembership: null,
    createdByMembership: {
      id: "membership-agent",
      user: { id: "user-agent", name: "Atendente", email: "agent@trixus.test" },
    },
    _count: { comments: 0, attachments: 0 },
  };
}
