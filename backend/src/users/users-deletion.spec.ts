import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { UsersController } from "./users.controller";

const current = {
  userId: "user-admin",
  membershipId: "membership-admin",
  tenantId: "tenant-a",
  roleKey: "tenant_admin",
  platformRole: "NONE",
  permissions: ["users.delete"],
};

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "membership-agent",
    tenantId: "tenant-a",
    userId: "user-agent",
    roleId: "role-agent",
    presentationName: "Agente Local",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-21T00:00:00.000Z"),
    user: {
      id: "user-agent",
      email: "agente@trixus.test",
      name: "Nome Global",
      passwordHash: "hash",
      keepSidebarCollapsed: false,
      status: "ACTIVE",
      platformRole: "NONE",
    },
    role: { id: "role-agent", key: "agent", name: "Atendente" },
    departments: [],
    ...overrides,
  };
}

function fixture(counts: Partial<Record<string, number>> = {}) {
  const values = {
    open: 0,
    conversations: 2,
    messages: 3,
    history: 1,
    tickets: 0,
    comments: 0,
    approvals: 0,
    attachments: 0,
    campaigns: 0,
    ...counts,
  };
  const conversationCount = vi
    .fn()
    .mockImplementation(({ where }) =>
      Promise.resolve(where.status === "EM_ANDAMENTO" ? values.open : values.conversations),
    );
  const tx = {
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue(membership()),
      delete: vi.fn().mockResolvedValue({}),
    },
    conversation: { count: conversationCount },
    message: {
      count: vi.fn().mockResolvedValue(values.messages),
      updateMany: vi.fn().mockResolvedValue({ count: values.messages }),
    },
    messageReaction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ticketHistory: {
      count: vi.fn().mockResolvedValue(values.history),
      findMany: vi.fn().mockResolvedValue([{ id: "history-a", metadata: { event: "status" } }]),
      update: vi.fn().mockResolvedValue({}),
    },
    ticket: {
      count: vi.fn().mockResolvedValue(values.tickets),
      updateMany: vi.fn().mockResolvedValue({ count: values.tickets }),
    },
    ticketComment: {
      count: vi.fn().mockResolvedValue(values.comments),
      updateMany: vi.fn().mockResolvedValue({ count: values.comments }),
    },
    ticketApproval: {
      count: vi.fn().mockResolvedValue(values.approvals),
      updateMany: vi.fn().mockResolvedValue({ count: values.approvals }),
    },
    ticketAttachment: {
      count: vi.fn().mockResolvedValue(values.attachments),
      updateMany: vi.fn().mockResolvedValue({ count: values.attachments }),
    },
    campaign: {
      count: vi.fn().mockResolvedValue(values.campaigns),
      updateMany: vi.fn().mockResolvedValue({ count: values.campaigns }),
    },
    notification: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx, values };
}

describe("physical attendant deletion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("previews the preserved operational records and blocks an in-progress conversation", async () => {
    const { prisma } = fixture({ open: 1 });
    const controller = new UsersController(prisma as never, {} as never);

    const impact = await controller.deletionPreview("membership-agent", current as never);

    expect(impact.blockedReason).toContain("1 conversa(s) em andamento");
    expect(impact.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "assigned-conversations", count: 2 }),
        expect.objectContaining({ id: "authored-messages", count: 3 }),
        expect.objectContaining({ id: "ticket-history", count: 1 }),
      ]),
    );
    expect(impact.snapshotToken).toHaveLength(64);
  });

  it.each([
    ["the tenant administrator", { role: { id: "role-admin", key: "tenant_admin", name: "Administrador" } }, "administrador"],
    ["the current user", { id: "membership-admin", userId: "user-admin" }, "próprio acesso"],
  ])("blocks %s", async (_label, overrides, expected) => {
    const { prisma } = fixture();
    prisma.tenantMembership.findFirst.mockResolvedValue(membership(overrides));
    const controller = new UsersController(prisma as never, {} as never);

    const impact = await controller.deletionPreview("membership-agent", current as never);

    expect(impact.blockedReason).toContain(expected);
  });

  it("does not block historical authorship and snapshots every former Restrict relation", async () => {
    const { prisma } = fixture({ tickets: 1, comments: 2, approvals: 3, attachments: 4, campaigns: 5 });
    const controller = new UsersController(prisma as never, {} as never);

    const impact = await controller.deletionPreview("membership-agent", current as never);

    expect(impact.dependencies).toContainEqual(
      expect.objectContaining({ id: "historical-authorship", count: 15 }),
    );
    expect(impact.blockedReason).toBeUndefined();
    await expect(
      controller.remove("membership-agent", { snapshotToken: impact.snapshotToken }, current as never),
    ).resolves.toEqual({ status: "deleted" });
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { createdByNameSnapshot: "Agente Local" } }),
    );
    expect(prisma.ticketComment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { authorNameSnapshot: "Agente Local" } }),
    );
    expect(prisma.ticketApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { requestedByNameSnapshot: "Agente Local" } }),
    );
    expect(prisma.ticketAttachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { uploadedByNameSnapshot: "Agente Local" } }),
    );
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { createdByNameSnapshot: "Agente Local" } }),
    );
    expect(prisma.tenantMembership.delete).toHaveBeenCalled();
  });

  it("revalidates the preview and returns changed without mutating on a stale snapshot", async () => {
    const { prisma, values } = fixture();
    const controller = new UsersController(prisma as never, {} as never);
    const impact = await controller.deletionPreview("membership-agent", current as never);
    values.open = 1;

    const result = await controller.remove(
      "membership-agent",
      { snapshotToken: impact.snapshotToken },
      current as never,
    );

    expect(result.status).toBe("changed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tenantMembership.delete).not.toHaveBeenCalled();
  });

  it("revalidates again under the membership lock before deleting", async () => {
    const { prisma, tx, values } = fixture();
    const controller = new UsersController(prisma as never, {} as never);
    const impact = await controller.deletionPreview("membership-agent", current as never);
    prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => unknown) => {
        values.open = 1;
        return callback(tx);
      },
    );

    const result = await controller.remove(
      "membership-agent",
      { snapshotToken: impact.snapshotToken },
      current as never,
    );

    expect(result.status).toBe("changed");
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.tenantMembership.delete).not.toHaveBeenCalled();
    expect(tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("snapshots authorship, preserves notifications and deletes only the tenant membership", async () => {
    const { prisma, tx } = fixture();
    const controller = new UsersController(prisma as never, {} as never);
    const impact = await controller.deletionPreview("membership-agent", current as never);

    await expect(
      controller.remove("membership-agent", { snapshotToken: impact.snapshotToken }, current as never),
    ).resolves.toEqual({ status: "deleted" });

    expect(tx.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { participantName: "Agente Local" } }),
    );
    expect(tx.ticketHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            actorSnapshot: expect.objectContaining({
              membershipId: "membership-agent",
              name: "Agente Local",
            }),
          }),
        },
      }),
    );
    expect(tx.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { membershipId: null } }),
    );
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tenant_membership.deleted",
          targetId: "membership-agent",
        }),
      }),
    );
    expect(tx.tenantMembership.delete).toHaveBeenCalledWith({
      where: { id: "membership-agent" },
    });
    expect(prisma).not.toHaveProperty("user.delete");
  });
});

describe("attendant historical authorship migration", () => {
  it("backfills every name snapshot before replacing Restrict with SetNull", () => {
    const sql = readFileSync(
      new URL(
        "../../prisma/migrations/20261021170000_attendant_historical_authorship_snapshots/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    for (const column of [
      "createdByNameSnapshot",
      "authorNameSnapshot",
      "requestedByNameSnapshot",
      "uploadedByNameSnapshot",
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
    expect(sql.match(/ON DELETE SET NULL/g)).toHaveLength(5);
    expect(sql.indexOf('UPDATE "tickets"')).toBeLessThan(
      sql.indexOf('ALTER TABLE "tickets" ALTER COLUMN "createdByMembershipId" DROP NOT NULL'),
    );
  });
});
