import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationType,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { ContactActionsController } from "./contact-actions.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "agent",
  platformRole: "USER",
  connectionIds: ["connection-a"],
  chatDepartmentIds: ["department-a"],
  permissions: ["conversations.read", "contacts.update"],
};

function directConversation() {
  return {
    isGroup: false,
    conversationType: ConversationType.DIRECT,
    externalChatId: "5511999990000@s.whatsapp.net",
    contact: { normalizedPhone: "5511999990000" },
    connection: {
      providerType: MessagingProviderType.EVOLUTION,
      status: MessagingConnectionStatus.CONNECTED,
      externalReference: "instance-a",
      archivedAt: null,
    },
  };
}

describe("ContactActionsController", () => {
  it("blocks only through the visible conversation Evolution instance", async () => {
    const prisma = { conversation: { findFirst: vi.fn().mockResolvedValue(directConversation()) } };
    const evolution = { updateBlockStatus: vi.fn().mockResolvedValue({}) };
    const controller = new ContactActionsController(prisma as never, evolution as never);

    await expect(controller.blockContact("conversation-a", current as never)).resolves.toEqual({
      ok: true,
    });
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
    expect(evolution.updateBlockStatus).toHaveBeenCalledWith({
      instanceName: "instance-a",
      number: "5511999990000@s.whatsapp.net",
      status: "block",
    });
  });

  it("does not reveal or mutate a conversation outside the caller visibility", async () => {
    const controller = new ContactActionsController(
      { conversation: { findFirst: vi.fn().mockResolvedValue(null) } } as never,
      { updateBlockStatus: vi.fn() } as never,
    );
    await expect(controller.blockContact("hidden", current as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects groups and providers without the Evolution blocking contract", async () => {
    const group = { ...directConversation(), isGroup: true };
    const evolution = { updateBlockStatus: vi.fn() };
    const controller = new ContactActionsController(
      { conversation: { findFirst: vi.fn().mockResolvedValue(group) } } as never,
      evolution as never,
    );
    await expect(controller.blockContact("group", current as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(evolution.updateBlockStatus).not.toHaveBeenCalled();
  });
});
