import { describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../generated/prisma";
import { MessagingErrorCode, MessagingProviderError } from "./messaging.contracts";
import { MessagingOutboundService, OutboundDispatchError } from "./messaging-outbound.service";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleKey: "tenant_admin",
  permissions: [],
  departmentIds: [],
};

describe("MessagingOutboundService", () => {
  it("creates outbound messages as QUEUED and writes a minimal outbox event", async () => {
    const prisma = prismaMock();
    const dispatcher = { dispatchMessage: vi.fn().mockResolvedValue(true) };
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.create.mockResolvedValue(message({ status: MessageStatus.QUEUED }));

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcher as never,
    );

    const result = await service.sendText(
      "conversation-a",
      { content: " Ola ", clientMessageId: "c1" },
      current as never,
    );

    expect(result.status).toBe("queued");
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.QUEUED,
          content: "Ola",
          clientMessageId: "c1",
        }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aggregateId: "message-a",
          payload: { tenantId: "tenant-a", messageId: "message-a" },
        }),
      }),
    );
    expect(dispatcher.dispatchMessage).toHaveBeenCalledWith("message-a");
  });

  it("marks QUEUED messages as SENT after provider acceptance", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({ accepted: true, providerMessageId: "wa-1" }),
    };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);
    prisma.message.update.mockResolvedValue(message({ status: MessageStatus.SENT }));

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 1,
        finalAttempt: false,
      }),
    ).resolves.toMatchObject({ status: MessageStatus.SENT });

    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.SENDING,
          sendAttempts: { increment: 1 },
        }),
      }),
    );
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ messageId: "message-a" }));
  });

  it("does not send duplicate jobs for terminal successful messages", async () => {
    const provider = { send: vi.fn() };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValue(message({ status: MessageStatus.SENT }));

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 2,
        finalAttempt: false,
      }),
    ).resolves.toMatchObject({ skipped: true, status: MessageStatus.SENT });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("keeps retryable provider errors retryable before the final attempt", async () => {
    const provider = {
      send: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Temporary provider failure.",
            true,
          ),
        ),
    };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 1,
        finalAttempt: false,
      }),
    ).rejects.toMatchObject({ retryable: true });
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: MessageStatus.FAILED }),
      }),
    );
  });

  it("persists FAILED when retryable errors exhaust attempts", async () => {
    const provider = {
      send: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Temporary provider failure.",
            true,
          ),
        ),
    };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 5,
        finalAttempt: true,
      }),
    ).rejects.toBeInstanceOf(OutboundDispatchError);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MessageStatus.FAILED }),
      }),
    );
  });

  it("fails disconnected connections without provider fallback", async () => {
    const provider = { send: vi.fn() };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValue(
      message({
        status: MessageStatus.QUEUED,
        connection: { ...connection(), status: MessagingConnectionStatus.DISCONNECTED },
      }),
    );

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 1,
        finalAttempt: false,
      }),
    ).rejects.toMatchObject({ retryable: false });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("fails removed connections without provider fallback", async () => {
    const provider = { send: vi.fn() };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValue(
      message({
        status: MessageStatus.QUEUED,
        connection: { ...connection(), status: MessagingConnectionStatus.REMOVED },
      }),
    );

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 1,
        finalAttempt: false,
      }),
    ).rejects.toMatchObject({ retryable: false });
    expect(provider.send).not.toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MessageStatus.FAILED }),
      }),
    );
  });

  it("guards same-conversation ordering when a predecessor is pending", async () => {
    const provider = { send: vi.fn() };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(
      message({ id: "message-b", status: MessageStatus.QUEUED }),
    );
    prisma.message.findFirst.mockResolvedValueOnce({ id: "message-a" });

    const service = new MessagingOutboundService(
      prisma as never,
      registryMock(provider) as never,
      dispatcherMock() as never,
    );

    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-b",
        attempt: 1,
        finalAttempt: false,
      }),
    ).rejects.toMatchObject({ retryable: true });
    expect(provider.send).not.toHaveBeenCalled();
  });
});

function prismaMock() {
  const prisma = {
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    departmentMembership: { findMany: vi.fn() },
    messagingConnection: { findFirst: vi.fn() },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}

function registryMock(provider = { send: vi.fn().mockResolvedValue({ accepted: true }) }) {
  return {
    resolve: vi.fn().mockReturnValue(provider),
    assertSupports: vi.fn(),
  };
}

function dispatcherMock() {
  return { dispatchMessage: vi.fn().mockResolvedValue(true) };
}

function connection(overrides = {}) {
  return {
    id: "connection-a",
    tenantId: "tenant-a",
    providerType: MessagingProviderType.DEVELOPMENT,
    status: MessagingConnectionStatus.CONNECTED,
    externalReference: "dev-a",
    ...overrides,
  };
}

function conversation() {
  return {
    id: "conversation-a",
    tenantId: "tenant-a",
    assignedMembershipId: "membership-a",
    status: ConversationStatus.EM_ANDAMENTO,
    connectionId: "connection-a",
    contact: { phone: "+5511999999999", normalizedPhone: "+5511999999999", name: "Cliente" },
    connection: connection(),
  };
}

function message(overrides: { id?: string; status?: MessageStatus; connection?: unknown } = {}) {
  return {
    id: overrides.id ?? "message-a",
    tenantId: "tenant-a",
    conversationId: "conversation-a",
    connectionId: "connection-a",
    direction: MessageDirection.OUTBOUND,
    type: MessageType.TEXT,
    status: overrides.status ?? MessageStatus.QUEUED,
    authorMembershipId: "membership-a",
    content: "Ola",
    clientMessageId: "client-a",
    providerMessageId: null,
    providerStatus: null,
    providerErrorCode: null,
    providerErrorMessage: null,
    providerAcceptedAt: null,
    sendAttempts: 0,
    lastAttemptAt: null,
    externalMessageId: null,
    readAt: null,
    createdAt: new Date("2026-07-30T13:00:00.000Z"),
    updatedAt: new Date("2026-07-30T13:00:00.000Z"),
    authorMembership: { user: { id: "user-a", email: "agent@nexo.test", name: "Agent" } },
    conversation: {
      ...conversation(),
      connection: overrides.connection ?? connection(),
    },
  };
}
