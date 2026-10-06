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
import { OUTBOUND_PROVIDER_OUTCOME_UNKNOWN } from "../queue/messaging-outbound.queue";

const current = {
  userId: "user-a",
  tenantId: "tenant-a",
  membershipId: "membership-a",
  roleKey: "tenant_admin",
  permissions: [],
  departmentIds: [],
};

describe("MessagingOutboundService", () => {
  it("rejects voice uploads when the current profile cannot send audio", async () => {
    const prisma = prismaMock();
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    const mediaStorage = { storeUpload: vi.fn() };
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcherMock() as never,
      mediaStorage as never,
    );

    await expect(
      service.sendMedia(
        "conversation-a",
        {
          headers: {
            "content-type": "audio/webm",
            "x-media-type": "audio",
          },
        } as never,
        current as never,
      ),
    ).rejects.toThrow("Sem permissão para enviar mensagens de áudio.");
    expect(mediaStorage.storeUpload).not.toHaveBeenCalled();
  });

  it("does not send if pause commits between the fresh snapshot and the admission lock", async () => {
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message()).mockResolvedValueOnce(null);
    prisma.$queryRaw.mockResolvedValue([{ serviceEnabled: false }]);
    const provider = { send: vi.fn() };
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
    ).resolves.toMatchObject({
      skipped: true,
      status: MessageStatus.QUEUED,
      reason: "SERVICE_PAUSED",
    });
    expect(provider.send).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).toHaveBeenLastCalledWith({
      where: { id: "message-a", tenantId: "tenant-a", status: MessageStatus.SENDING },
      data: {
        status: MessageStatus.QUEUED,
        sendAttempts: { decrement: 1 },
        providerErrorCode: null,
        providerErrorMessage: null,
      },
    });
  });

  it("keeps a paused queued message untouched without resolving or calling its provider", async () => {
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValue(
      message({ connection: connection({ serviceEnabled: false }) }),
    );
    const provider = { send: vi.fn() };
    const registry = registryMock(provider);
    const service = new MessagingOutboundService(
      prisma as never,
      registry as never,
      dispatcherMock() as never,
    );
    await expect(
      service.dispatchQueuedMessage({
        tenantId: "tenant-a",
        messageId: "message-a",
        attempt: 5,
        finalAttempt: true,
      }),
    ).resolves.toMatchObject({
      skipped: true,
      status: MessageStatus.QUEUED,
      reason: "SERVICE_PAUSED",
    });
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(registry.resolve).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("restores QUEUED and its attempt count if service pauses after the initial snapshot", async () => {
    const prisma = prismaMock();
    prisma.message.findFirst
      .mockResolvedValueOnce(message({ connection: connection({ serviceEnabled: true }) }))
      .mockResolvedValueOnce(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection({ serviceEnabled: false }));
    const provider = { send: vi.fn() };
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
    ).resolves.toMatchObject({
      skipped: true,
      status: MessageStatus.QUEUED,
      reason: "SERVICE_PAUSED",
    });
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.SENDING,
          sendAttempts: { increment: 1 },
        }),
      }),
    );
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "message-a", tenantId: "tenant-a", status: MessageStatus.SENDING },
      data: {
        status: MessageStatus.QUEUED,
        sendAttempts: { decrement: 1 },
        providerErrorCode: null,
        providerErrorMessage: null,
      },
    });
    expect(prisma.messagingConnection.findFirst).toHaveBeenCalledWith({
      where: { id: "connection-a", tenantId: "tenant-a" },
      select: { serviceEnabled: true },
    });
    expect(provider.send).not.toHaveBeenCalled();
  });

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

  it("resolves an additional field through the central resolver in a welcome text", async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock();
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({
      ...message(),
      clientMessageId: "automatic:welcome",
      providerStatus: "welcome_queued",
    });
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcher as never,
    );

    await expect(
      service.queueAutomatedText({
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        connectionId: "connection-a",
        externalChatId: "5511999999999@s.whatsapp.net",
        content: "Bem-vinda, {{nome}}. Plano: {{plano}}.",
        templateContext: {
          contactName: "Ana",
          customFieldValues: [
            { label: "Plano", variableKey: "plano", type: "TEXT", value: "Premium" },
          ],
        },
        kind: "welcome",
      }),
    ).resolves.toMatchObject({ created: true });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientMessageId: "automatic:welcome",
          content: "Bem-vinda, Ana. Plano: Premium.",
        }),
      }),
    );
  });

  it("queues absence media with its own idempotency key and resolves an additional field", async () => {
    const prisma = prismaMock();
    const dispatcher = dispatcherMock();
    const mediaStorage = {
      storeDownloaded: vi.fn().mockResolvedValue({
        objectKey: "tenants/tenant-a/messages/absence.ogg",
        mimeType: "audio/ogg",
        fileName: "absence.ogg",
        sizeBytes: 4,
        checksum: "checksum-a",
      }),
    };
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({
      ...message(),
      type: MessageType.VOICE,
      clientMessageId: "automatic:absence",
      providerStatus: "absence_queued",
      mediaStorageKey: "tenants/tenant-a/messages/absence.ogg",
    });
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcher as never,
      mediaStorage as never,
    );

    await expect(
      service.queueAutomatedMedia({
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        connectionId: "connection-a",
        externalChatId: "5511999999999@s.whatsapp.net",
        content: "Voltamos em breve, {{nome}} do plano {{plano}}.",
        templateContext: {
          contactName: "Ana",
          customFieldValues: [
            { label: "Plano", variableKey: "plano", type: "TEXT", value: "Premium" },
          ],
        },
        kind: "absence",
        attachment: {
          fileName: "absence.ogg",
          mimeType: "audio/ogg",
          size: 4,
          dataUrl: "data:audio/ogg;base64,T2dnUw==",
        },
      }),
    ).resolves.toMatchObject({ created: true });

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientMessageId: "automatic:absence" }),
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientMessageId: "automatic:absence",
          providerStatus: "absence_queued",
          content: "Voltamos em breve, Ana do plano Premium.",
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

  it("prefixes a new administrator message with the current presentation name", async () => {
    const prisma = prismaMock();
    const dispatcher = { dispatchMessage: vi.fn().mockResolvedValue(true) };
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.create.mockResolvedValue(message({ status: MessageStatus.QUEUED }));
    const senderName = { resolve: vi.fn().mockResolvedValue("Natã Rabelo") };
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcher as never,
      undefined,
      undefined,
      undefined,
      senderName as never,
    );

    await service.sendText("conversation-a", { content: "Teste" }, {
      ...current,
      permissions: ["chat.agent_name.show"],
    } as never);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "*Natã Rabelo:*\n\nTeste" }),
      }),
    );
    expect(senderName.resolve).toHaveBeenCalled();
  });

  it("resolves a quick-message template with the instance timezone at enqueue time", async () => {
    const prisma = prismaMock();
    const activeConversation = conversation() as any;
    activeConversation.contact.customFieldValues = [
      {
        value: "Premium",
        field: { label: "Plano", variableKey: "plano", type: "TEXT", mask: null },
      },
    ];
    prisma.conversation.findFirst.mockResolvedValue(activeConversation);
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.create.mockImplementation(async ({ data }) => message({ ...data } as never));
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcherMock() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      { now: () => new Date("2026-09-17T15:00:00.000Z") },
    );

    await service.sendText(
      "conversation-a",
      { content: "{{saudacao}}, {{nome}} — {{plano}}", clientMessageId: "quick-a" },
      current as never,
    );

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Boa tarde, Cliente — Premium" }),
      }),
    );
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "conversation-a", tenantId: "tenant-a" }),
      }),
    );
  });

  it("rejects content that becomes empty or oversized after template expansion", async () => {
    const prisma = prismaMock();
    const activeConversation = conversation() as any;
    activeConversation.contact.customFieldValues = [
      {
        value: "x".repeat(4001),
        field: {
          label: "Grande",
          variableKey: "grande",
          type: "TEXT",
          mask: null,
        },
      },
    ];
    prisma.conversation.findFirst.mockResolvedValue(activeConversation);
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcherMock() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      { now: () => new Date("2026-09-17T15:00:00.000Z") },
    );

    await expect(
      service.sendText("conversation-a", { content: "{{email}}" }, current as never),
    ).rejects.toThrow("Mensagem vazia");
    await expect(
      service.sendText("conversation-a", { content: "{{grande}}" }, current as never),
    ).rejects.toThrow("excede 4000");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("does not mix variable values or timezone from another tenant instance", async () => {
    const prisma = prismaMock();
    const tenantA = conversation() as any;
    tenantA.contact.name = "Ana";
    tenantA.connection = connection({ timezone: "America/Sao_Paulo" });
    const tenantB = conversation() as any;
    tenantB.id = "conversation-b";
    tenantB.tenantId = "tenant-b";
    tenantB.contact.name = "Bruna";
    tenantB.connection = connection({
      id: "connection-b",
      tenantId: "tenant-b",
      timezone: "Asia/Tokyo",
    });
    prisma.conversation.findFirst.mockImplementation(async ({ where }) => {
      const serialized = JSON.stringify(where);
      if (serialized.includes("tenant-a") && serialized.includes("conversation-a")) return tenantA;
      if (serialized.includes("tenant-b") && serialized.includes("conversation-b")) return tenantB;
      return null;
    });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.create.mockImplementation(async ({ data }) => message({ ...data } as never));
    const service = new MessagingOutboundService(
      prisma as never,
      registryMock() as never,
      dispatcherMock() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      { now: () => new Date("2026-09-17T15:30:00.000Z") },
    );

    await service.sendText(
      "conversation-a",
      { content: "{{saudacao}}, {{nome}}" },
      current as never,
    );

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          connectionId: "connection-a",
          content: "Boa tarde, Ana",
        }),
      }),
    );
    expect(prisma.conversation.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-b" }) }),
    );
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

  it("blocks automatic retry when the provider outcome is ambiguous", async () => {
    const provider = {
      send: vi
        .fn()
        .mockRejectedValue(
          new MessagingProviderError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Connection closed after request write.",
            true,
            undefined,
            undefined,
            undefined,
            undefined,
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
    ).rejects.toMatchObject({ retryable: false, unknownOutcome: true });
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.FAILED,
          providerErrorCode: OUTBOUND_PROVIDER_OUTCOME_UNKNOWN,
        }),
      }),
    );
    expect(provider.send).toHaveBeenCalledOnce();
  });

  it("persists an accepted provider response locally without sending it again", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({ accepted: true, providerMessageId: "wa-accepted" }),
    };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);
    prisma.message.update
      .mockRejectedValueOnce(
        Object.assign(new Error("database connection lost"), { code: "P1017" }),
      )
      .mockResolvedValueOnce(message({ status: MessageStatus.SENT }));
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
    ).resolves.toMatchObject({ status: MessageStatus.SENT, recovered: true });

    expect(provider.send).toHaveBeenCalledOnce();
    expect(prisma.message.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.SENT,
          providerMessageId: "wa-accepted",
        }),
      }),
    );
  });

  it("blocks retry when the provider reports acceptance without a provider message id", async () => {
    const provider = { send: vi.fn().mockResolvedValue({ accepted: true }) };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);
    prisma.message.update.mockResolvedValue(message({ status: MessageStatus.FAILED }));
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
    ).rejects.toMatchObject({ retryable: false, unknownOutcome: true });
    expect(provider.send).toHaveBeenCalledOnce();
  });

  it("keeps provider acceptance non-retryable when acknowledgement persistence stays down", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({ accepted: true, providerMessageId: "wa-accepted" }),
    };
    const prisma = prismaMock();
    prisma.message.findFirst.mockResolvedValueOnce(message({ status: MessageStatus.QUEUED }));
    prisma.message.findFirst.mockResolvedValueOnce(null);
    prisma.message.update
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockRejectedValueOnce(new Error("database still unavailable"))
      .mockResolvedValueOnce(message({ status: MessageStatus.FAILED }));
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
    ).rejects.toMatchObject({ retryable: false, unknownOutcome: true });
    expect(provider.send).toHaveBeenCalledOnce();
    expect(prisma.message.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessageStatus.FAILED,
          providerErrorCode: OUTBOUND_PROVIDER_OUTCOME_UNKNOWN,
        }),
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
    messagingConnection: { findFirst: vi.fn().mockResolvedValue(connection()) },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(prisma)),
    $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true }]),
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
    name: "Atendimento",
    timezone: "America/Sao_Paulo",
    archivedAt: null,
    serviceEnabled: true,
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
    contact: {
      phone: "+5511999999999",
      normalizedPhone: "+5511999999999",
      name: "Cliente",
      email: null,
      departmentName: null,
      customer: null,
      contactDepartment: null,
      customFieldValues: [],
    },
    department: null,
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
    authorMembership: { user: { id: "user-a", email: "agent@trixus.test", name: "Agent" } },
    conversation: {
      ...conversation(),
      connection: overrides.connection ?? connection(),
    },
  };
}
