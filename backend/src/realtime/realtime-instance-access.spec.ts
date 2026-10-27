import { describe, expect, it, vi } from "vitest";
import { RealtimeService } from "./realtime.service";

describe("realtime instance access", () => {
  it("checks the current profile before subscriptions and stops access immediately after revocation", async () => {
    const role = {
      key: "agent",
      metadata: { connectionIds: ["vocical"], departmentIds: ["department-a"] },
      permissions: [{ permissionId: "conversations.read" }],
    };
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockImplementation(async () => ({
          role,
          tenant: { authRevokedAt: null },
        })),
      },
      impersonationSession: { findFirst: vi.fn() },
      conversation: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          const serialized = JSON.stringify(where);
          const identity = Array.isArray(where.AND) ? where.AND[0] : where;
          return serialized.includes('"connectionId":{"in":["vocical"]}') &&
            identity.id === "vocical-chat"
            ? { id: identity.id }
            : null;
        }),
      },
    };
    const service = new RealtimeService({} as never, prisma as never);
    const context = { membershipId: "member-a", userId: "user-a", tenantId: "tenant-a" } as never;
    expect(await service.canAccessConversation(context, "other-chat")).toBe(false);
    expect(await service.canAccessConversation(context, "vocical-chat")).toBe(true);
    role.metadata.connectionIds = [];
    expect(await service.canAccessConversation(context, "vocical-chat")).toBe(false);
  });

  it("does not broadcast conversation data to sockets outside the instance", async () => {
    const allowed = {
      data: { context: { membershipId: "allowed", tenantId: "tenant-a" } },
      emit: vi.fn(),
    };
    const denied = {
      data: { context: { membershipId: "denied", tenantId: "tenant-a" } },
      emit: vi.fn(),
    };
    const withoutPermission = {
      data: { context: { membershipId: "without-permission", tenantId: "tenant-a" } },
      emit: vi.fn(),
    };
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => ({
          role: {
            key: "agent",
            metadata: {
              connectionIds:
                where.id === "allowed" || where.id === "without-permission" ? ["vocical"] : [],
              departmentIds: ["department-a"],
            },
            permissions:
              where.id === "without-permission" ? [] : [{ permissionId: "conversations.read" }],
          },
          tenant: { authRevokedAt: null },
        })),
      },
      impersonationSession: { findFirst: vi.fn() },
      conversation: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          const identity = Array.isArray(where.AND) ? where.AND[0] : where;
          return JSON.stringify(where).includes('"connectionId":{"in":["vocical"]}')
            ? { id: identity.id }
            : null;
        }),
      },
    };
    const service = new RealtimeService({} as never, prisma as never);
    service["server"] = {
      in: () => ({ fetchSockets: async () => [allowed, denied, withoutPermission] }),
    } as unknown as NonNullable<RealtimeService["server"]>;
    await service["publishScoped"]("tenant:tenant-a", "conversation.updated", {
      conversationId: "vocical-chat",
    });
    expect(allowed.emit).toHaveBeenCalledOnce();
    expect(denied.emit).not.toHaveBeenCalled();
    expect(withoutPermission.emit).not.toHaveBeenCalled();
  });

  it("broadcasts contact updates independently from the Chat instance scope", async () => {
    const socket = {
      data: { context: { membershipId: "contact-reader", tenantId: "tenant-a" } },
      emit: vi.fn(),
    };
    const prisma = {
      tenantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          role: {
            key: "agent",
            metadata: { connectionIds: [], departmentIds: [] },
            permissions: [{ permissionId: "contacts.read" }],
          },
          tenant: { authRevokedAt: null },
        }),
      },
      impersonationSession: { findFirst: vi.fn() },
      contact: { findFirst: vi.fn().mockResolvedValue({ id: "contact-a" }) },
    };
    const service = new RealtimeService({} as never, prisma as never);
    service["server"] = {
      in: () => ({ fetchSockets: async () => [socket] }),
    } as unknown as NonNullable<RealtimeService["server"]>;

    await service["publishScoped"]("tenant:tenant-a", "contact.updated", {
      contactId: "contact-a",
    });

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: "contact-a", tenantId: "tenant-a" },
      select: { id: true },
    });
    expect(socket.emit).toHaveBeenCalledOnce();
  });

  it.each([
    "ticket.created",
    "ticket.updated",
    "ticket.status.updated",
    "ticket.assignment.updated",
    "ticket.comment.created",
    "ticket.attachment.created",
    "ticket.attachment.removed",
  ] as const)("isolates %s between portal customers", async (event) => {
    const { service, sockets } = portalRealtimeFixture({
      ticketId: "ticket-a",
      customerId: "customer-a",
      departmentId: "department-a",
      requesterContactId: "contact-a",
      accesses: {
        "access-a": {
          customerId: "customer-a",
          contactId: "contact-a",
          departmentId: null,
          accessProfile: "FULL_ACCESS",
        },
        "access-b": {
          customerId: "customer-b",
          contactId: "contact-b",
          departmentId: null,
          accessProfile: "FULL_ACCESS",
        },
      },
    });

    await service["publishScoped"]("tenant:tenant-a", event, { ticketId: "ticket-a" });

    expect(sockets["access-a"].emit).toHaveBeenCalledOnce();
    expect(sockets["access-b"].emit).not.toHaveBeenCalled();
  });

  it("isolates manager departments and collaborator ownership", async () => {
    const { service, sockets } = portalRealtimeFixture({
      ticketId: "ticket-a",
      customerId: "customer-a",
      departmentId: "department-a",
      requesterContactId: "contact-a",
      accesses: {
        "manager-a": {
          customerId: "customer-a",
          contactId: "manager-contact-a",
          departmentId: "department-a",
          accessProfile: "MANAGER",
        },
        "manager-b": {
          customerId: "customer-a",
          contactId: "manager-contact-b",
          departmentId: "department-b",
          accessProfile: "MANAGER",
        },
        "collaborator-a": {
          customerId: "customer-a",
          contactId: "contact-a",
          departmentId: "department-a",
          accessProfile: "COLLABORATOR",
        },
        "collaborator-b": {
          customerId: "customer-a",
          contactId: "contact-b",
          departmentId: "department-a",
          accessProfile: "COLLABORATOR",
        },
      },
    });

    await service["publishScoped"]("tenant:tenant-a", "ticket.comment.created", {
      ticketId: "ticket-a",
    });

    expect(sockets["manager-a"].emit).toHaveBeenCalledOnce();
    expect(sockets["manager-b"].emit).not.toHaveBeenCalled();
    expect(sockets["collaborator-a"].emit).toHaveBeenCalledOnce();
    expect(sockets["collaborator-b"].emit).not.toHaveBeenCalled();
  });
});

function portalRealtimeFixture(input: {
  ticketId: string;
  customerId: string;
  departmentId: string;
  requesterContactId: string;
  accesses: Record<
    string,
    {
      customerId: string;
      contactId: string;
      departmentId: string | null;
      accessProfile: "FULL_ACCESS" | "MANAGER" | "COLLABORATOR";
    }
  >;
}) {
  const sockets = Object.fromEntries(
    Object.keys(input.accesses).map((portalAccessId) => [
      portalAccessId,
      {
        data: {
          context: {
            userId: `user-${portalAccessId}`,
            tenantId: "tenant-a",
            membershipId: `membership-${portalAccessId}`,
            portalAccessId,
          },
        },
        emit: vi.fn(),
      },
    ]),
  ) as Record<string, { data: { context: object }; emit: ReturnType<typeof vi.fn> }>;
  const prisma = {
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        role: {
          key: "tenant_admin",
          metadata: {},
          permissions: [{ permissionId: "users.create" }],
        },
        tenant: { authRevokedAt: null },
      }),
    },
    impersonationSession: { findFirst: vi.fn() },
    customerPortalAccess: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => input.accesses[where.id] ?? null),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue({
        id: "role-portal",
        key: "customer_portal",
        active: true,
        metadata: {},
        permissions: [{ permissionId: "tickets.read" }],
      }),
    },
    ticket: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        if (where.id !== input.ticketId || where.tenantId !== "tenant-a") return null;
        if (where.customerId !== input.customerId) return null;
        if (where.customerDepartmentId && where.customerDepartmentId !== input.departmentId) {
          return null;
        }
        if (where.requesterContactId && where.requesterContactId !== input.requesterContactId) {
          return null;
        }
        return { id: input.ticketId };
      }),
    },
  };
  const service = new RealtimeService({} as never, prisma as never);
  service["server"] = {
    in: () => ({ fetchSockets: async () => Object.values(sockets) }),
  } as unknown as NonNullable<RealtimeService["server"]>;
  return { service, sockets, prisma };
}
