import { describe, expect, it, vi } from "vitest";
import { ConversationType, MessagingConnectionStatus } from "../generated/prisma";
import { PERMISSIONS_KEY } from "../auth/permissions.decorator";
import { GroupsController } from "./groups.controller";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleId: "role-a",
  roleKey: "tenant_admin",
  platformRole: "USER",
  connectionIds: [],
};

const baseGroup = {
  id: "group-a",
  tenantId: "tenant-a",
  contactId: "contact-a",
  departmentId: null,
  assignedMembershipId: null,
  connectionId: "connection-a",
  status: "ABERTA",
  protocol: null,
  isGroup: true,
  conversationType: ConversationType.GROUP,
  externalChatId: "120363@g.us",
  externalGroupId: "120363@g.us",
  groupName: "Grupo A",
  groupImageUrl: null,
  groupSubjectUpdatedAt: null,
  groupMetadataJson: null,
  unreadCount: 0,
  lastMessagePreview: null,
  lastMessageAt: null,
  inboxArchivedAt: null,
  archivedAt: null,
  closedAt: null,
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-02T10:00:00.000Z"),
  contact: {
    id: "contact-a",
    tenantId: "tenant-a",
    name: "Grupo A",
    phone: "120363@g.us",
    normalizedPhone: "group:120363@g.us",
    avatarUrl: null,
  },
  connection: {
    id: "connection-a",
    name: "Instância A",
    externalReference: "instance-a",
    status: MessagingConnectionStatus.CONNECTED,
    color: "#22c55e",
    ownerExternalId: "5562992728679@s.whatsapp.net",
    ownerPhoneNormalized: "+5562992728679",
  },
};

describe("GroupsController", () => {
  it("keeps permissions as the action boundary for reading, creating, editing and leaving", () => {
    const list = Object.getOwnPropertyDescriptor(GroupsController.prototype, "list")?.value;
    const create = Object.getOwnPropertyDescriptor(GroupsController.prototype, "create")?.value;
    const leave = Object.getOwnPropertyDescriptor(GroupsController.prototype, "leave")?.value;
    const updateName = Object.getOwnPropertyDescriptor(
      GroupsController.prototype,
      "updateName",
    )?.value;

    expect(Reflect.getMetadata(PERMISSIONS_KEY, list)).toEqual(["groups.read"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, create)).toEqual(["groups.create"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, leave)).toEqual(["groups.leave"]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, updateName)).toEqual(["groups.update"]);
  });

  it("keeps manual group synchronization available through the sync endpoint", async () => {
    const groupsSync = {
      sync: vi.fn().mockResolvedValue({
        synced: 3,
        created: 1,
        updated: 2,
        failed: 0,
        connections: 1,
        groups: 3,
        participants: 42,
        inactiveParticipants: 0,
        participantNamesUpdated: 0,
      }),
    };
    const controller = new GroupsController({} as never, {} as never, groupsSync as never);

    const result = await controller.sync({ connectionId: "connection-a" }, current as never);

    expect(groupsSync.sync).toHaveBeenCalledOnce();
    expect(groupsSync.sync).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      connectionId: "connection-a",
    });
    expect(result).toMatchObject({ synced: 3, participants: 42 });
  });

  it("synchronizes the tenant group base without applying personal Chat scopes", async () => {
    const groupsSync = {
      sync: vi.fn().mockResolvedValue({ synced: 0, participants: 0 }),
    };
    const controller = new GroupsController({} as never, {} as never, groupsSync as never);

    await controller.sync({ connectionId: "connection-a" }, {
      ...current,
      roleKey: "agent",
      connectionIds: ["connection-a"],
      chatDepartmentIds: ["department-a"],
    } as never);

    expect(groupsSync.sync).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      connectionId: "connection-a",
    });
  });

  it("resolves the group department from the tenant and connection instead of personal scopes", async () => {
    const prisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue({ id: "department-preferred" }),
      },
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const departmentId = await controller["resolveGroupDepartmentId"]("connection-a", "tenant-a");

    expect(departmentId).toBe("department-preferred");
    expect(prisma.department.findFirst).toHaveBeenCalledOnce();
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        active: true,
        connections: { some: { connectionId: "connection-a" } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
  });

  it("rejects group creation when the tenant connection has no active department", async () => {
    const prisma = {
      department: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    await expect(
      controller["resolveGroupDepartmentId"]("connection-a", "tenant-a"),
    ).rejects.toThrow("Selecione um departamento permitido no Chat.");

    expect(prisma.department.findFirst).toHaveBeenCalledOnce();
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        active: true,
        connections: { some: { connectionId: "connection-a" } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
  });

  it("returns only the instance fields required by the group filter", async () => {
    const prisma = {
      messagingConnection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "connection-a",
            name: "Instância A",
            color: "#22c55e",
            externalReference: "instance-a",
          },
        ]),
      },
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const result = await controller.instanceOptions({
      ...current,
      roleKey: "agent",
      connectionIds: [],
    } as never);

    expect(prisma.messagingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          archivedAt: null,
          status: {
            in: [MessagingConnectionStatus.CONNECTED, MessagingConnectionStatus.DISCONNECTED],
          },
        },
        select: {
          id: true,
          name: true,
          color: true,
          externalReference: true,
        },
      }),
    );
    expect(result).toEqual([
      {
        id: "connection-a",
        value: "connection-a",
        name: "Instância A",
        color: "#22c55e",
        externalReference: "instance-a",
      },
    ]);
  });

  it("returns a lightweight group summary with the active participant count", async () => {
    const summary = { ...baseGroup, _count: { participants: 1015 } };
    const prisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([summary]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn().mockResolvedValue([[summary], 1]),
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const result = await controller.listSummary({ page: "1", pageSize: "12" }, current as never);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          contact: { select: { name: true, avatarUrl: true } },
          connection: {
            select: {
              id: true,
              name: true,
              externalReference: true,
              status: true,
              color: true,
            },
          },
          _count: { select: { participants: { where: { active: true } } } },
        },
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: "group-a",
      participantsCount: 1015,
    });
    expect(result.items[0]).not.toHaveProperty("participants");
  });

  it("shares the tenant group list without applying personal Chat scopes", async () => {
    const prisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    await controller.list({}, {
      ...current,
      roleKey: "agent",
      connectionIds: ["connection-a"],
      chatDepartmentIds: ["department-a"],
    } as never);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          archivedAt: null,
          conversationType: ConversationType.GROUP,
          AND: [{ OR: [{ connectionId: null }, { connection: { is: { archivedAt: null } } }] }],
        },
      }),
    );
  });

  it("resolves management actions tenant-wide while retaining tenant isolation", async () => {
    const prisma = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(baseGroup),
      },
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    await controller["resolveManagedGroup"]("group-a", {
      ...current,
      roleKey: "agent",
      connectionIds: [],
      chatDepartmentIds: [],
    } as never);

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ OR: [{ connectionId: null }, { connection: { is: { archivedAt: null } } }] }],
          id: "group-a",
          tenantId: "tenant-a",
          archivedAt: null,
          conversationType: ConversationType.GROUP,
        },
      }),
    );
  });

  it("preserves participants in the original paginated list contract", async () => {
    const group = {
      ...baseGroup,
      participants: [
        {
          id: "participant-active",
          displayName: "Maria",
          phone: "5511999999999",
          externalParticipantId: "5511999999999@s.whatsapp.net",
          isAdmin: false,
          isSuperAdmin: false,
          active: true,
          lastSeenAt: new Date("2026-09-02T09:00:00.000Z"),
        },
      ],
    };
    const prisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([group]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn().mockResolvedValue([[group], 1]),
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const result = await controller.list({ page: "1", pageSize: "12" }, current as never);

    expect(result.items[0].participants).toHaveLength(1);
  });

  it("keeps returning complete active participants from the detail endpoint", async () => {
    const group = {
      ...baseGroup,
      participants: [
        {
          id: "participant-active",
          displayName: "Maria",
          phone: "5511999999999",
          externalParticipantId: "5511999999999@s.whatsapp.net",
          isAdmin: false,
          isSuperAdmin: false,
          active: true,
          lastSeenAt: new Date("2026-09-02T09:00:00.000Z"),
        },
        {
          id: "participant-inactive",
          displayName: "João",
          phone: "5511888888888",
          externalParticipantId: "5511888888888@s.whatsapp.net",
          isAdmin: false,
          isSuperAdmin: false,
          active: false,
          lastSeenAt: new Date("2026-09-01T09:00:00.000Z"),
        },
      ],
    };
    const prisma = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(group),
      },
    };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const result = await controller.detail("group-a", current as never);

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          participants: expect.objectContaining({ where: { active: true } }),
        }),
      }),
    );
    expect(result.participantsCount).toBe(1);
    expect(result.participants).toEqual([
      expect.objectContaining({ id: "participant-active", name: "Maria", active: true }),
    ]);
  });

  it("exposes the current instance and its participant-management capability", async () => {
    const group = {
      ...baseGroup,
      participants: [
        {
          id: "participant-owner",
          displayName: "Instância A",
          phone: "5562992728679",
          lid: null,
          externalParticipantId: "5562992728679@s.whatsapp.net",
          isAdmin: true,
          isSuperAdmin: false,
          active: true,
          lastSeenAt: new Date("2026-09-02T09:00:00.000Z"),
        },
      ],
    };
    const prisma = { conversation: { findFirst: vi.fn().mockResolvedValue(group) } };
    const controller = new GroupsController(prisma as never, {} as never, {} as never);

    const result = await controller.detail("group-a", current as never);

    expect(result.canManageParticipants).toBe(true);
    expect(result.participants[0]).toMatchObject({
      isCurrentInstance: true,
      name: "Instância A",
    });
  });

  it("blocks participant administration when the connected instance is not an admin", async () => {
    const group = {
      ...baseGroup,
      participants: [
        {
          id: "participant-owner",
          displayName: "Instância A",
          phone: "5562992728679",
          lid: null,
          externalParticipantId: "5562992728679@s.whatsapp.net",
          isAdmin: false,
          isSuperAdmin: false,
          active: true,
          lastSeenAt: new Date("2026-09-02T09:00:00.000Z"),
        },
      ],
    };
    const prisma = { conversation: { findFirst: vi.fn().mockResolvedValue(group) } };
    const evolution = { updateGroupParticipants: vi.fn() };
    const controller = new GroupsController(prisma as never, evolution as never, {} as never);

    await expect(
      controller.updateAdmins(
        "group-a",
        { action: "promote", participantIds: ["5511999999999@s.whatsapp.net"] },
        current as never,
      ),
    ).rejects.toThrow("não possui privilégio para gerenciar participantes");
    expect(evolution.updateGroupParticipants).not.toHaveBeenCalled();
  });
});
