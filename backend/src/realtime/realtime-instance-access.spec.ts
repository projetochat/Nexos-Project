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
        findFirst: vi
          .fn()
          .mockImplementation(async ({ where }) => {
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
});
