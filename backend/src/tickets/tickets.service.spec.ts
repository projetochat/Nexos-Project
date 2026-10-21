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
    prisma.contact.findFirst.mockResolvedValue({ id: "contract-manager" });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.ticketProtocolCounter.upsert.mockResolvedValue({ lastNumber: 15 });
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

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          customerId: "customer-a",
          customerAccessProfile: "FULL_ACCESS",
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

  it("scopes a portal manager to its customer, department and branch", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-manager",
      customerId: "customer-a",
      customerDepartmentId: "customer-department-a",
      customerBranchId: "branch-a",
      customerAccessProfile: "MANAGER",
      portalAccessActive: true,
      customerDepartment: { id: "customer-department-a", name: "Financeiro" },
      customerBranch: { id: "branch-a", status: "ACTIVE" },
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", membershipId: "portal-membership" },
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ tenantId: "tenant-a", archivedAt: null }),
            {
              customerId: "customer-a",
              customerDepartmentId: "customer-department-a",
              originBranchId: "branch-a",
            },
          ],
        },
      }),
    );
  });

  it("does not expose internal dialogs to a customer portal contact", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-manager",
      customerId: "customer-a",
      customerDepartmentId: "customer-department-a",
      customerBranchId: "branch-a",
      customerAccessProfile: "MANAGER",
      portalAccessActive: true,
      customerDepartment: { id: "customer-department-a", name: "Financeiro" },
      customerBranch: { id: "branch-a", status: "ACTIVE" },
    });
    prisma.ticket.findFirst.mockResolvedValue(ticket());
    prisma.ticketComment.findMany.mockResolvedValue([]);

    await serviceWith(prisma).comments("ticket-a", {
      ...current,
      roleKey: "customer_portal",
      membershipId: "portal-membership",
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

  it("does not replace an existing tenant role when inviting a customer contact", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      name: "Clara",
      email: "clara@example.test",
      customer: { id: "customer-a", name: "SDE" },
      portalMembership: null,
    });
    prisma.user.findUnique.mockResolvedValue({
      memberships: [{ id: "membership-agent", status: "ACTIVE", role: { key: "agent" } }],
    });

    await expect(
      serviceWith(prisma).inviteCustomerContact("contact-a", current),
    ).rejects.toMatchObject({ response: { code: "CONTACT_EMAIL_ALREADY_TENANT_MEMBER" } });
    expect(prisma.userInvitation.create).not.toHaveBeenCalled();
  });

  it("does not invite an inactive customer contact", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(serviceWith(prisma).inviteCustomerContact("contact-a", current)).rejects.toThrow(
      "Contato ativo com cliente, perfil e e-mail é obrigatório",
    );
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true }),
      }),
    );
    expect(prisma.userInvitation.create).not.toHaveBeenCalled();
  });

  it("restores portal access only after an explicit access action", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      active: true,
      name: "Clara",
      email: "clara@example.test",
      customer: { id: "customer-a", name: "SDE" },
      portalMembership: { id: "portal-membership", status: "ACTIVE" },
      portalAccessActive: false,
    });
    prisma.contact.update.mockResolvedValue({});

    await expect(serviceWith(prisma).inviteCustomerContact("contact-a", current)).resolves.toEqual({
      status: "active",
      contactId: "contact-a",
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "contact-a" } },
      data: { portalAccessActive: true },
    });
  });

  it("hides all tickets from an inactive portal contact", async () => {
    const prisma = prismaMock();
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      active: false,
      customerId: "customer-a",
      customerAccessProfile: "FULL_ACCESS",
      portalAccessActive: true,
    });
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await serviceWith(prisma).list(
      { page: 1, pageSize: 25 },
      { ...current, roleKey: "customer_portal", membershipId: "portal-membership" },
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
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      name: "Clara",
      email: "Clara@Example.Test",
      customer: { id: "customer-a", name: "SDE" },
      portalMembership: null,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });

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
      expect.objectContaining({ to: "clara@example.test", contactName: "Clara" }),
    );
    expect(result).toMatchObject({
      id: "invitation-a",
      contactId: "contact-a",
      email: "clara@example.test",
      status: "pending",
    });
  });

  it("uses the configured tenant app URL in the customer portal invitation", async () => {
    vi.stubEnv("TRIXUS_TENANT_APP_URL", "https://hom.trixus.com.br/");
    vi.stubEnv("TENANT_APP_URL", "http://localhost:3000");

    const prisma = prismaMock();
    const email = {
      assertInvitationDeliveryReady: vi.fn(),
      sendCustomerPortalInvitation: vi
        .fn()
        .mockResolvedValue({ delivered: true, provider: "resend", messageId: "message-a" }),
    };
    prisma.contact.findFirst.mockResolvedValue({
      id: "contact-a",
      name: "Clara",
      email: "clara@example.test",
      customer: { id: "customer-a", name: "SDE" },
      portalMembership: null,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.role.upsert.mockResolvedValue({ id: "role-portal" });
    prisma.userInvitation.create.mockResolvedValue({ id: "invitation-a" });

    await serviceWith(prisma, undefined, email).inviteCustomerContact("contact-a", current);

    expect(email.sendCustomerPortalInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptUrl: expect.stringMatching(
          /^https:\/\/hom\.trixus\.com\.br\/login\?invite=[A-Za-z0-9_-]+$/,
        ),
      }),
    );
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
    email as never,
  );
}

function prismaMock() {
  return {
    $transaction: vi.fn(),
    department: { findFirst: vi.fn() },
    departmentMembership: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    customerBranch: { findFirst: vi.fn() },
    customerDepartment: { findFirst: vi.fn() },
    tenantMembership: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    role: { upsert: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
    userInvitation: { create: vi.fn(), updateMany: vi.fn() },
    ticketProtocolCounter: { upsert: vi.fn() },
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
      findMany: vi.fn(),
      count: vi.fn(),
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
    ticketAttachment: { findMany: vi.fn(), deleteMany: vi.fn() },
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
