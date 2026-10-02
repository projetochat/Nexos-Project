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
});
