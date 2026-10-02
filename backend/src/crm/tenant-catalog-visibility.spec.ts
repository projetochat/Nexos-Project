import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PERMISSIONS_KEY } from "../auth/permissions.decorator";
import { DepartmentsController } from "../departments/departments.controller";
import { TagsController } from "./tags.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "agent",
  platformRole: "USER",
} satisfies AuthenticatedUser;

describe("tenant-wide catalogs", () => {
  it("exposes tags with chat.tags.read and scopes the query to the current tenant", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new TagsController(
      { tag: { findMany } } as never,
      { publishContactTagsUpdated: vi.fn() } as never,
    );

    await controller.list(current);

    expect(Reflect.getMetadata(PERMISSIONS_KEY, TagsController.prototype.list)).toEqual([
      "chat.tags.read",
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", archivedAt: null },
      orderBy: [{ name: "asc" }],
    });
  });

  it("returns every active department in the tenant without membership filtering", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "department-a",
        tenantId: "tenant-a",
        name: "Comercial",
        description: null,
        color: "#3B82F6",
        active: true,
        createdAt,
        updatedAt: createdAt,
        members: [],
        conversations: [],
      },
    ]);
    const controller = new DepartmentsController(
      { department: { findMany } } as never,
      {} as never,
    );

    const result = await controller.list(current);

    expect(Reflect.getMetadata(PERMISSIONS_KEY, DepartmentsController.prototype.list)).toEqual([
      "departments.read",
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-a", active: true } }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "department-a", memberCount: 0, openConversationCount: 0 }),
    ]);
  });
});
