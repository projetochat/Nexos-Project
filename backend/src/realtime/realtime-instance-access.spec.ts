import { describe, expect, it, vi } from "vitest";
import { RealtimeService } from "./realtime.service";

describe("realtime instance access", () => {
  it("checks the current profile before subscriptions and stops access immediately after revocation", async () => {
    const role = { key: "agent", metadata: { connectionIds: ["vocical"] } };
    const prisma = {
      tenantMembership: { findFirst: vi.fn().mockImplementation(async () => ({ role })) },
      conversation: { findFirst: vi.fn().mockImplementation(async ({ where }) => where.connectionId.in.includes("vocical") && where.id === "vocical-chat" ? { id: where.id } : null) },
    };
    const service = new RealtimeService({} as never, prisma as never);
    const context = { membershipId: "member-a", userId: "user-a", tenantId: "tenant-a" } as never;
    expect(await service.canAccessConversation(context, "other-chat")).toBe(false);
    expect(await service.canAccessConversation(context, "vocical-chat")).toBe(true);
    role.metadata.connectionIds = [];
    expect(await service.canAccessConversation(context, "vocical-chat")).toBe(false);
  });

  it("does not broadcast conversation data to sockets outside the instance", async () => {
    const allowed = { data: { context: { membershipId: "allowed", tenantId: "tenant-a" } }, emit: vi.fn() };
    const denied = { data: { context: { membershipId: "denied", tenantId: "tenant-a" } }, emit: vi.fn() };
    const prisma = {
      tenantMembership: { findFirst: vi.fn().mockImplementation(async ({ where }) => ({ role: { key: "agent", metadata: { connectionIds: where.id === "allowed" ? ["vocical"] : [] } } })) },
      conversation: { findFirst: vi.fn().mockImplementation(async ({ where }) => where.connectionId.in.includes("vocical") ? { id: where.id } : null) },
    };
    const service = new RealtimeService({} as never, prisma as never);
    (service as any).server = { in: () => ({ fetchSockets: async () => [allowed, denied] }) };
    await (service as any).publishScoped("tenant:tenant-a", "conversation.updated", { conversationId: "vocical-chat" });
    expect(allowed.emit).toHaveBeenCalledOnce();
    expect(denied.emit).not.toHaveBeenCalled();
  });
});
