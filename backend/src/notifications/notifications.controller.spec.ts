import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ConversationStatus } from "../generated/prisma";
import { NotificationsController } from "./notifications.controller";

const current = {
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleKey: "agent",
  permissions: ["notifications.read"],
  connectionIds: ["connection-a"],
  chatDepartmentIds: ["department-a"],
} as AuthenticatedUser;

function setup() {
  const prisma = {
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    notification: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    lead: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([{ id: "lead-a" }]) },
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
    },
  };
  return {
    prisma,
    controller: new NotificationsController(prisma as never),
  };
}

describe("NotificationsController.target", () => {
  it("routes a closed lead conversation to history through the shared visibility scope", async () => {
    const { controller, prisma } = setup();
    prisma.notification.findFirst.mockResolvedValue({ entityType: "lead", entityId: "lead-a" });
    prisma.lead.findFirst.mockResolvedValue({ conversationId: "conversation-a" });
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-a",
      status: ConversationStatus.FECHADA,
    });

    await expect(controller.target("notification-a", current)).resolves.toEqual({
      conversationId: "conversation-a",
      destination: "history",
    });
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: "conversation-a", tenantId: "tenant-a", archivedAt: null },
          {
            AND: [
              { connectionId: { in: ["connection-a"] } },
              { departmentId: { in: ["department-a"] } },
              {
                OR: [{ assignedMembershipId: "membership-a" }, { assignedMembershipId: null }],
              },
            ],
          },
        ],
      },
      select: { id: true, status: true },
    });
  });

  it("does not reveal a conversation outside the attendant visibility", async () => {
    const { controller, prisma } = setup();
    prisma.notification.findFirst.mockResolvedValue({
      entityType: "conversation",
      entityId: "conversation-hidden",
    });
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(controller.target("notification-a", current)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("filters notification previews by conversations actually visible to the attendant", async () => {
    const { controller, prisma } = setup();

    await controller.list({}, current);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { entityType: "conversation", entityId: { in: ["conversation-a"] } },
            { entityType: "lead", entityId: { in: ["lead-a"] } },
          ]),
        }),
      }),
    );
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { tenantId: "tenant-a", archivedAt: null },
            {
              AND: [
                { connectionId: { in: ["connection-a"] } },
                { departmentId: { in: ["department-a"] } },
                {
                  OR: [{ assignedMembershipId: "membership-a" }, { assignedMembershipId: null }],
                },
              ],
            },
          ],
        },
        select: { id: true },
      }),
    );
  });
});
