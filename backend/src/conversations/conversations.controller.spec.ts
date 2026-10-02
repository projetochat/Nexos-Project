import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { ConversationsController } from "./conversations.controller";

describe("ConversationsController connection selection", () => {
  it("uses the explicitly selected connection instead of another contact instance", async () => {
    const selectedConnection = {
      id: "connection-selected",
      providerType: MessagingProviderType.EVOLUTION,
      externalReference: "instance-selected",
      status: MessagingConnectionStatus.CONNECTED,
    };
    const prisma = {
      messagingConnection: {
        findFirst: vi.fn().mockResolvedValue(selectedConnection),
      },
    };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const connection = await controller["resolveConversationConnection"](
      "connection-selected",
      {
        userId: "user-a",
        tenantId: "tenant-a",
        membershipId: "membership-a",
        roleId: "role-a",
        roleKey: "agent",
        platformRole: "USER",
        connectionIds: ["connection-selected"],
      },
      { instance: "instance-older", instanceIds: ["connection-older", "connection-selected"] },
    );

    expect(prisma.messagingConnection.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [{ id: "connection-selected" }, { id: { in: ["connection-selected"] } }],
        tenantId: "tenant-a",
        archivedAt: null,
      },
    });
    expect(connection).toBe(selectedConnection);
  });

  it("rejects assigning a conversation to an attendant outside its Chat scope", async () => {
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          role: {
            key: "agent",
            metadata: {
              connectionIds: ["connection-other"],
              departmentIds: ["department-other"],
            },
          },
          departments: [],
        }),
      },
    };
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller["assertAssignableMembership"](
        prisma as never,
        "membership-a",
        "tenant-a",
        "connection-selected",
        "department-selected",
      ),
    ).rejects.toThrow("O perfil do atendente não permite esta instância no Chat.");
  });
});
