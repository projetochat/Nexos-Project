import { describe, expect, it, vi } from "vitest";
import { ConversationStatus, MessageDirection, MessageStatus } from "../generated/prisma";
import { DepartmentInactivityClosureService } from "./department-inactivity-closure.service";

describe("DepartmentInactivityClosureService", () => {
  it("queues the configured message and closes an eligible conversation atomically", async () => {
    const now = new Date("2026-10-20T18:00:00.000Z");
    const latest = {
      id: "agent-message",
      direction: MessageDirection.OUTBOUND,
      authorMembershipId: "membership-a",
      createdAt: new Date("2026-10-20T16:59:00.000Z"),
    };
    const outbound = {
      id: "inactivity-message",
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      connectionId: "connection-a",
      status: MessageStatus.QUEUED,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Podemos continuar quando você precisar.",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: {
        findFirst: vi.fn().mockResolvedValueOnce(latest).mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValueOnce(outbound).mockResolvedValueOnce({ id: "system-a" }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: "outbox-a" }) },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const outbox = { dispatchMessage: vi.fn().mockResolvedValue(true) };
    const realtime = {
      publishMessageCreated: vi.fn(),
      publishConversationUpdated: vi.fn(),
    };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      outbox as never,
      realtime as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(now)).resolves.toEqual({ departments: 1, scanned: 1, closed: 1 });

    expect(tx.message.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          clientMessageId: "automatic:inactivity:agent-message",
          content: "Podemos continuar quando você precisar.",
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateId: "inactivity-message",
        payload: { tenantId: "tenant-a", messageId: "inactivity-message" },
      }),
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "conversation-a" },
      data: expect.objectContaining({ status: ConversationStatus.FECHADA, closedAt: now }),
    });
    expect(outbox.dispatchMessage).toHaveBeenCalledWith("inactivity-message");
    expect(realtime.publishConversationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "inactivity.closed" }),
    );
  });

  it("does not close when the client replied after the attendant", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Mensagem final",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "client-message",
          direction: MessageDirection.INBOUND,
          authorMembershipId: null,
          createdAt: new Date("2026-10-20T16:00:00.000Z"),
        }),
        create: vi.fn(),
      },
      outboxEvent: { create: vi.fn() },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const outbox = { dispatchMessage: vi.fn() };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      outbox as never,
      { publishMessageCreated: vi.fn(), publishConversationUpdated: vi.fn() } as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(new Date("2026-10-20T18:00:00.000Z"))).resolves.toEqual({
      departments: 1,
      scanned: 1,
      closed: 0,
    });
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(outbox.dispatchMessage).not.toHaveBeenCalled();
  });

  it("revalidates the deadline under lock before closing", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "conversation-a" }]),
      department: {
        findFirst: vi.fn().mockResolvedValue({
          inactivityTimeoutMinutes: 60,
          inactivityClosureMessage: "Mensagem final",
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-a",
          tenantId: "tenant-a",
          contactId: "contact-a",
          connectionId: "connection-a",
          externalChatId: "556299999999",
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fresh-agent-message",
          direction: MessageDirection.OUTBOUND,
          authorMembershipId: "membership-a",
          createdAt: new Date("2026-10-20T17:30:00.000Z"),
        }),
        create: vi.fn(),
      },
      outboxEvent: { create: vi.fn() },
    };
    const prisma = {
      department: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "department-a", tenantId: "tenant-a", inactivityTimeoutMinutes: 60 },
          ]),
      },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: "conversation-a" }]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new DepartmentInactivityClosureService(
      prisma as never,
      { dispatchMessage: vi.fn() } as never,
      { publishMessageCreated: vi.fn(), publishConversationUpdated: vi.fn() } as never,
      { get: vi.fn() } as never,
    );

    await expect(service.runOnce(new Date("2026-10-20T18:00:00.000Z"))).resolves.toEqual({
      departments: 1,
      scanned: 1,
      closed: 0,
    });
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
