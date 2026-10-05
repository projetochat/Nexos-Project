import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { QuickRepliesController } from "./quick-replies.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "agent",
  platformRole: "USER",
  permissions: ["chat.quick_replies.read", "chat.quick_replies.create"],
} satisfies AuthenticatedUser;

function controllerWith(prisma: object) {
  return new QuickRepliesController(prisma as never);
}

function quickReply(overrides: Record<string, unknown> = {}) {
  return {
    id: "quick-reply-a",
    tenantId: "tenant-a",
    title: "Boas-vindas",
    shortcut: "/boas-vindas",
    normalizedShortcut: "boas-vindas",
    content: "Olá",
    messages: null,
    intervalSeconds: 0,
    attachmentFileName: null,
    attachmentMimeType: null,
    attachmentSize: null,
    attachmentDataUrl: null,
    closeOnSend: false,
    departmentId: null,
    createdByMembershipId: "original-membership",
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    department: null,
    ...overrides,
  };
}

describe("quick replies tenant-wide catalog", () => {
  it("lists every active reply in the tenant without restricting by membership departments", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = controllerWith({ quickReply: { findMany } });

    await controller.list({} as never, current);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-a", archivedAt: null },
      }),
    );
  });

  it("does not use the department classification to limit visibility", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = controllerWith({ quickReply: { findMany } });

    await controller.list({ departmentId: "department-a" } as never, current);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-a", archivedAt: null },
      }),
    );
  });

  it("rejects a department from another tenant on creation", async () => {
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue(null) },
      quickReply: { findFirst: vi.fn(), create: vi.fn() },
    };
    const controller = controllerWith(prisma);

    await expect(
      controller.create(
        {
          title: "Boas-vindas",
          shortcut: "boas-vindas",
          content: "Olá",
          departmentId: "department-b",
        },
        current,
      ),
    ).rejects.toThrow("Departamento inexistente para este tenant");
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: "department-b", tenantId: "tenant-a", active: true },
    });
    expect(prisma.quickReply.create).not.toHaveBeenCalled();
  });

  it("restores an archived global reply with the same normalized shortcut", async () => {
    const archived = quickReply({
      id: "archived-global",
      archivedAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    const update = vi.fn().mockResolvedValue(
      quickReply({
        id: "archived-global",
        title: "Novo título",
        content: "Novo conteúdo",
      }),
    );
    const prisma = {
      quickReply: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: archived.id }),
        create: vi.fn(),
        update,
      },
    };
    const controller = controllerWith(prisma);

    const result = await controller.create(
      { title: " Novo título ", shortcut: "BOAS-VINDAS", content: " Novo conteúdo " },
      current,
    );

    expect(prisma.quickReply.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: "tenant-a",
        departmentId: null,
        normalizedShortcut: "boas-vindas",
        archivedAt: { not: null },
      },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_id: { tenantId: "tenant-a", id: "archived-global" } },
        data: expect.objectContaining({
          title: "Novo título",
          shortcut: "/boas-vindas",
          normalizedShortcut: "boas-vindas",
          content: "Novo conteúdo",
          departmentId: null,
          archivedAt: null,
        }),
      }),
    );
    expect(update.mock.calls[0][0].data).not.toHaveProperty("createdByMembershipId");
    expect(update.mock.calls[0][0].data).not.toHaveProperty("createdAt");
    expect(prisma.quickReply.create).not.toHaveBeenCalled();
    expect(result.id).toBe("archived-global");
  });

  it("restores only an archived reply from the same tenant and department", async () => {
    const update = vi.fn().mockResolvedValue(
      quickReply({
        id: "archived-department",
        departmentId: "department-a",
        department: { id: "department-a", name: "Suporte", color: "#2563eb" },
      }),
    );
    const prisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue({ id: "department-a" }),
      },
      quickReply: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: "archived-department" }),
        create: vi.fn(),
        update,
      },
    };
    const controller = controllerWith(prisma);

    await controller.create(
      {
        title: "Boas-vindas",
        shortcut: "boas-vindas",
        content: "Olá",
        departmentId: "department-a",
      },
      current,
    );

    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: "department-a", tenantId: "tenant-a", active: true },
    });
    expect(prisma.quickReply.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: "tenant-a",
        departmentId: "department-a",
        normalizedShortcut: "boas-vindas",
        archivedAt: { not: null },
      },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_id: { tenantId: "tenant-a", id: "archived-department" } },
        data: expect.objectContaining({ departmentId: "department-a", archivedAt: null }),
      }),
    );
    expect(prisma.quickReply.create).not.toHaveBeenCalled();
  });

  it("creates a new reply when no archived record exists in the same tenant and scope", async () => {
    const create = vi.fn().mockResolvedValue(quickReply());
    const prisma = {
      quickReply: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create,
        update: vi.fn(),
      },
    };
    const controller = controllerWith(prisma);

    await controller.create(
      { title: "Boas-vindas", shortcut: "boas-vindas", content: "Olá" },
      current,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          departmentId: null,
          normalizedShortcut: "boas-vindas",
          createdByMembershipId: "membership-a",
        }),
      }),
    );
    expect(prisma.quickReply.update).not.toHaveBeenCalled();
  });

  it("keeps rejecting an active duplicate before looking for archived records", async () => {
    const prisma = {
      quickReply: {
        findFirst: vi.fn().mockResolvedValue({ id: "active-reply" }),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const controller = controllerWith(prisma);

    await expect(
      controller.create({ title: "Boas-vindas", shortcut: "boas-vindas", content: "Olá" }, current),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUICK_REPLY_SHORTCUT_ALREADY_EXISTS" }),
    });
    expect(prisma.quickReply.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.quickReply.create).not.toHaveBeenCalled();
    expect(prisma.quickReply.update).not.toHaveBeenCalled();
  });
});
