import { describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { ConversationsController } from "./conversations.controller";

describe("ConversationsController contact variable context", () => {
  const current = (permissions: string[] = []) =>
    ({ tenantId: "tenant-a", roleKey: "agent", permissions }) as never;
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

    expect(
      controller["serialize"](conversation("tenant-a") as never, current()).contact,
    ).toMatchObject({
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

    expect(
      controller["serialize"](conversation("tenant-b") as never, current()).contact,
    ).toMatchObject({
      contactDepartmentId: null,
      contactDepartment: null,
    });
  });

  it("exposes only the selected instance timezone and typed field metadata", () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const base = conversation("tenant-a");
    const value = {
      ...base,
      connectionId: "connection-a",
      connection: {
        id: "connection-a",
        name: "Comercial",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: "commercial-a",
        timezone: "America/Manaus",
        color: null,
        logoUrl: null,
      },
      contact: {
        ...base.contact,
        customFieldValues: [
          {
            tenantId: "tenant-a",
            fieldId: "field-a",
            value: "true",
            field: {
              tenantId: "tenant-a",
              label: "Ativo",
              variableKey: "ativo",
              type: "CHECKBOX",
              mask: null,
            },
          },
        ],
      },
    };

    expect(
      controller["serialize"](value, current(["contacts.additional_fields.read"])),
    ).toMatchObject({
      connection: { id: "connection-a", timezone: "America/Manaus" },
      contact: {
        customFieldValues: [
          {
            fieldId: "field-a",
            variableKey: "ativo",
            type: "checkbox",
            mask: null,
            value: "true",
          },
        ],
      },
    });
  });

  it("does not return additional-field keys without the specific permission", () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const base = conversation("tenant-a");
    const value = {
      ...base,
      contact: {
        ...base.contact,
        customFieldValues: [
          {
            tenantId: "tenant-a",
            fieldId: "field-a",
            value: "segredo",
            field: {
              tenantId: "tenant-a",
              label: "Código",
              variableKey: "codigo",
              type: "TEXT",
              mask: null,
            },
          },
        ],
      },
    };

    for (const permissions of [["conversations.read"], ["contacts.read", "conversations.read"]]) {
      const serialized = controller["serialize"](value, current(permissions));
      expect(serialized.contact).not.toHaveProperty("customFields");
      expect(serialized.contact).not.toHaveProperty("customFieldValues");
      expect(JSON.stringify(serialized)).not.toContain("variableKey");
      expect(JSON.stringify(serialized)).not.toContain("segredo");
    }
  });

  it("applies the same authorization to list and detail endpoints", async () => {
    const base = conversation("tenant-a");
    const value = {
      ...base,
      contact: {
        ...base.contact,
        customFieldValues: [
          {
            tenantId: "tenant-a",
            fieldId: "field-a",
            value: "segredo",
            field: {
              tenantId: "tenant-a",
              label: "Código",
              variableKey: "codigo",
              type: "TEXT",
              mask: null,
            },
          },
        ],
      },
    };
    const prisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([value]),
        findFirst: vi.fn().mockResolvedValue(value),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      { enqueueMissing: vi.fn() } as never,
    );

    const listed = await controller.list({} as never, current(["conversations.read"]));
    expect(listed.items[0].contact).not.toHaveProperty("customFields");
    expect(listed.items[0].contact).not.toHaveProperty("customFieldValues");
    expect(JSON.stringify(listed)).not.toContain("variableKey");

    const detailed = await controller.detail(
      "conversation-a",
      current(["contacts.additional_fields.read"]),
    );
    expect(detailed.contact?.customFieldValues).toEqual([
      expect.objectContaining({ variableKey: "codigo", value: "segredo" }),
    ]);

    const adminDetail = await controller.detail("conversation-a", {
      tenantId: "tenant-a",
      roleKey: "tenant_admin",
      permissions: ["conversations.read"],
    } as never);
    expect(adminDetail.contact?.customFieldValues).toEqual([
      expect.objectContaining({ variableKey: "codigo", value: "segredo" }),
    ]);
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

describe("ConversationsController active conversation creation", () => {
  const current = {
    userId: "user-a",
    tenantId: "tenant-a",
    membershipId: "membership-a",
    roleId: "role-a",
    roleKey: "tenant_admin",
    platformRole: "USER",
    permissions: ["messages.send"],
    connectionIds: null,
    chatDepartmentIds: null,
    chatScopes: null,
  };

  const contact = {
    id: "contact-a",
    tenantId: "tenant-a",
    name: "Ana",
    phone: "5511999990000",
    normalizedPhone: "5511999990000",
    avatarUrl: null,
    customerId: null,
    email: null,
    departmentName: null,
    contactDepartmentId: null,
    companyRole: null,
    instance: null,
    instanceIds: [],
    archivedAt: null,
    customer: null,
    contactDepartment: null,
    tags: [],
    customFieldValues: [],
  };
  const connection = {
    id: "connection-a",
    tenantId: "tenant-a",
    name: "Principal",
    providerType: MessagingProviderType.EVOLUTION,
    externalReference: "principal",
    status: MessagingConnectionStatus.CONNECTED,
    serviceEnabled: true,
    timezone: "America/Sao_Paulo",
    color: null,
    logoUrl: null,
  };

  it("locks the tenant contact and revalidates a changed profile before inserting", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "contact-a" }]),
      contact: { findFirst: vi.fn().mockResolvedValue(contact) },
      messagingConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
      department: { findFirst: vi.fn().mockResolvedValue({ id: "department-a" }) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          role: { key: "agent", metadata: { chatScopes: [] } },
          departments: [],
        }),
      },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const controller = new ConversationsController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.create(
        {
          contactId: "contact-a",
          connectionId: "connection-a",
          departmentId: "department-a",
          assignToSelf: true,
        },
        {
          ...current,
          roleKey: "agent",
          connectionIds: ["connection-a"],
          chatDepartmentIds: ["department-a"],
          chatScopes: [
            {
              connectionId: "connection-a",
              departmentIds: ["department-a"],
              favoriteDepartmentId: null,
            },
          ],
        } as never,
      ),
    ).rejects.toThrow("O perfil do atendente não permite esta instância no Chat.");
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it("serializes repeated concurrent requests and creates a single active conversation", async () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    let stored: unknown = null;
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "contact-a" }]),
      contact: { findFirst: vi.fn().mockResolvedValue(contact) },
      messagingConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
      department: { findFirst: vi.fn().mockResolvedValue({ id: "department-a" }) },
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({ role: { key: "tenant_admin" }, departments: [] }),
      },
      conversationProtocolCounter: {
        upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }),
      },
      conversation: {
        findFirst: vi.fn(async () => stored),
        create: vi.fn(async () => {
          stored = {
            id: "conversation-a",
            tenantId: "tenant-a",
            contactId: "contact-a",
            connectionId: "connection-a",
            departmentId: "department-a",
            assignedMembershipId: "membership-a",
            status: ConversationStatus.EM_ANDAMENTO,
            protocol: "000001",
            isGroup: false,
            createdAt: now,
            updatedAt: now,
            lastMessageAt: null,
            unreadCount: 0,
            lastMessagePreview: null,
            inboxArchivedAt: null,
            lead: null,
            contact,
            connection,
            department: { id: "department-a", name: "Suporte", color: "#000", description: null },
            assignedMembership: {
              id: "membership-a",
              presentationName: null,
              user: { id: "user-a", name: "Ana", email: "ana@trixus.test", avatarUrl: null },
            },
          };
          return stored;
        }),
        findUniqueOrThrow: vi.fn(async () => stored),
      },
    };
    let queue = Promise.resolve();
    const prisma = {
      $transaction: vi.fn((callback) => {
        const result = queue.then(() => callback(tx));
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      }),
    };
    const messages = { createSystemMessage: vi.fn().mockResolvedValue(undefined) };
    const realtime = { publishConversationCreated: vi.fn(), publishConversationUpdated: vi.fn() };
    const controller = new ConversationsController(
      prisma as never,
      messages as never,
      realtime as never,
      { enqueueMissing: vi.fn() } as never,
    );
    const dto = {
      contactId: "contact-a",
      connectionId: "connection-a",
      departmentId: "department-a",
      assignToSelf: true,
    };

    const results = await Promise.all([
      controller.create(dto, current as never),
      controller.create(dto, current as never),
    ]);

    expect(results.map((item) => item.id)).toEqual(["conversation-a", "conversation-a"]);
    expect(tx.conversation.create).toHaveBeenCalledOnce();
    expect(messages.createSystemMessage).toHaveBeenCalledOnce();
    expect(realtime.publishConversationCreated).toHaveBeenCalledOnce();
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
