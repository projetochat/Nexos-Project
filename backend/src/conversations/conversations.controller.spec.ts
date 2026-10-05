import { describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { ConversationsController } from "./conversations.controller";

describe("ConversationsController contact variable context", () => {
  function conversation(contactDepartmentTenantId: string) {
    const now = new Date("2026-10-05T12:00:00.000Z");
    return {
      id: "conversation-a",
      tenantId: "tenant-a",
      contactId: "contact-a",
      connectionId: null,
      departmentId: null,
      assignedMembershipId: null,
      status: ConversationStatus.ABERTA,
      isGroup: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      protocol: null,
      unreadCount: 0,
      lastMessagePreview: null,
      inboxArchivedAt: null,
      lead: null,
      assignedMembership: null,
      department: null,
      connection: null,
      contact: {
        id: "contact-a",
        name: "Ana",
        phone: "5511999990000",
        avatarUrl: null,
        customerId: "customer-a",
        email: "ana@exemplo.com",
        departmentName: "Legado",
        contactDepartmentId: "contact-department-a",
        contactDepartment: {
          id: "contact-department-a",
          tenantId: contactDepartmentTenantId,
          name: "Financeiro",
          color: "#123456",
          archivedAt: null,
        },
        companyRole: null,
        instance: null,
        customer: null,
        tags: [],
        customFieldValues: [],
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  it("serializes the registered contact department when it belongs to the conversation tenant", () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(controller["serialize"](conversation("tenant-a") as never).contact).toMatchObject({
      contactDepartmentId: "contact-department-a",
      contactDepartment: { id: "contact-department-a", nome: "Financeiro", cor: "#123456" },
    });
  });

  it("does not expose a contact department relation from another tenant", () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(controller["serialize"](conversation("tenant-b") as never).contact).toMatchObject({
      contactDepartmentId: null,
      contactDepartment: null,
    });
  });
});

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

  it("uses the profile favorite only for its linked instance", async () => {
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue({ id: "department-favorite" }) },
    };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const current = {
      tenantId: "tenant-a",
      roleKey: "agent",
      connectionIds: ["connection-a"],
      chatDepartmentIds: ["department-favorite"],
      chatScopes: [
        {
          connectionId: "connection-a",
          departmentIds: ["department-favorite"],
          favoriteDepartmentId: "department-favorite",
        },
      ],
    };

    await expect(
      controller["resolveDepartmentId"](undefined, current as never, "connection-a"),
    ).resolves.toBe("department-favorite");
    await expect(
      controller["resolveDepartmentId"](undefined, current as never, "connection-b"),
    ).rejects.toThrow("Selecione um departamento para iniciar o atendimento.");
  });

  it("uses the valid profile favorite when starting an unassigned passive conversation", async () => {
    const prisma = {
      department: { findFirst: vi.fn().mockResolvedValue({ id: "department-favorite" }) },
    };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const current = {
      tenantId: "tenant-a",
      roleKey: "agent",
      connectionIds: ["connection-a"],
      chatDepartmentIds: ["department-favorite"],
      chatScopes: [
        {
          connectionId: "connection-a",
          departmentIds: ["department-favorite"],
          favoriteDepartmentId: "department-favorite",
        },
      ],
    };

    await expect(
      controller["resolveAssignedDepartmentId"](undefined, null, "connection-a", current as never),
    ).resolves.toBe("department-favorite");
  });

  it("prefers the current favorite over the passive conversation's previous department", async () => {
    const prisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue({ id: "department-favorite" }),
      },
    };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const current = {
      tenantId: "tenant-a",
      roleKey: "agent",
      connectionIds: ["connection-a"],
      chatDepartmentIds: ["department-favorite"],
      chatScopes: [
        {
          connectionId: "connection-a",
          departmentIds: ["department-favorite"],
          favoriteDepartmentId: "department-favorite",
        },
      ],
    };

    await expect(
      controller["resolveAssignedDepartmentId"](
        undefined,
        "department-stale",
        "connection-a",
        current as never,
      ),
    ).resolves.toBe("department-favorite");
  });
});

describe("ConversationsController department transfer scope", () => {
  const current = {
    userId: "user-a",
    tenantId: "tenant-a",
    membershipId: "membership-actor",
    roleId: "role-actor",
    roleKey: "agent",
    platformRole: "USER",
    connectionIds: ["connection-a"],
    chatDepartmentIds: ["department-target"],
    permissions: ["conversations.assign"],
  };
  const conversation = {
    id: "conversation-a",
    tenantId: "tenant-a",
    connectionId: "connection-a",
    departmentId: "department-origin",
    assignedMembershipId: "membership-assignee",
    status: ConversationStatus.EM_ANDAMENTO,
  };

  function setup(input?: {
    department?: { id: string } | null;
    assigneeRole?: { key: string; metadata?: unknown };
  }) {
    const updated = {
      ...conversation,
      departmentId: "department-target",
      updatedAt: new Date("2026-10-02T12:00:00.000Z"),
    };
    const tx = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          role: input?.assigneeRole ?? {
            key: "agent",
            metadata: {
              connectionIds: ["connection-a"],
              departmentIds: ["department-target"],
            },
          },
          departments: [],
        }),
      },
      conversation: {
        update: vi.fn().mockResolvedValue(updated),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      department: {
        findUnique: vi.fn().mockResolvedValue({ name: "Suporte" }),
      },
    };
    const prisma = {
      department: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            input && "department" in input ? input.department : { id: "department-target" },
          ),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const messages = { createSystemMessage: vi.fn().mockResolvedValue(undefined) };
    const realtime = {
      publishAssignmentUpdated: vi.fn(),
      publishConversationUpdated: vi.fn(),
    };
    const controller = new ConversationsController(
      prisma as never,
      messages as never,
      realtime as never,
      {} as never,
    );
    vi.spyOn(
      controller as unknown as {
        findVisibleConversation: (id: string, actor: unknown) => Promise<unknown>;
      },
      "findVisibleConversation",
    ).mockResolvedValue(conversation);
    vi.spyOn(
      controller as unknown as { serialize: (value: unknown) => unknown },
      "serialize",
    ).mockImplementation((value) => value);
    return { controller, prisma, tx, messages, realtime, updated };
  }

  it("rejects a department outside the actor Chat scope without mutations or events", async () => {
    const context = setup({ department: null });
    const actorOutsideDepartment = {
      ...current,
      chatDepartmentIds: ["department-other"],
    };

    await expect(
      context.controller.transferDepartment(
        conversation.id,
        { departmentId: "department-target" },
        actorOutsideDepartment as never,
      ),
    ).rejects.toThrow("Departamento não liberado para esta instância.");

    expect(context.prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        active: true,
        AND: [{ id: "department-target" }, { id: { in: ["department-other"] } }],
        connections: { some: { connectionId: "connection-a" } },
      },
    });
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.tx.conversation.update).not.toHaveBeenCalled();
    expect(context.messages.createSystemMessage).not.toHaveBeenCalled();
    expect(context.realtime.publishAssignmentUpdated).not.toHaveBeenCalled();
    expect(context.realtime.publishConversationUpdated).not.toHaveBeenCalled();
  });

  it("rejects a compatible actor when the assigned attendant cannot access the target department", async () => {
    const context = setup({
      assigneeRole: {
        key: "agent",
        metadata: {
          connectionIds: ["connection-a"],
          departmentIds: ["department-other"],
        },
      },
    });

    await expect(
      context.controller.transferDepartment(
        conversation.id,
        { departmentId: "department-target" },
        current as never,
      ),
    ).rejects.toThrow("O perfil do atendente não permite este departamento no Chat.");

    expect(context.tx.conversation.update).not.toHaveBeenCalled();
    expect(context.messages.createSystemMessage).not.toHaveBeenCalled();
    expect(context.realtime.publishAssignmentUpdated).not.toHaveBeenCalled();
    expect(context.realtime.publishConversationUpdated).not.toHaveBeenCalled();
  });

  it("transfers when actor and assigned attendant can access the target department", async () => {
    const context = setup();

    await expect(
      context.controller.transferDepartment(
        conversation.id,
        { departmentId: "department-target" },
        current as never,
      ),
    ).resolves.toEqual(context.updated);

    expect(context.tx.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversation.id },
        data: expect.objectContaining({ departmentId: "department-target" }),
      }),
    );
    expect(context.messages.createSystemMessage).toHaveBeenCalledOnce();
    expect(context.realtime.publishAssignmentUpdated).toHaveBeenCalledOnce();
    expect(context.realtime.publishConversationUpdated).toHaveBeenCalledOnce();
  });
});
