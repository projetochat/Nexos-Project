import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  MessagingConnectionStatus,
  MessagingHistoryImportKind,
  MessagingHistoryImportStatus,
} from "../generated/prisma";
import { MessagingHistoryImportService } from "./messaging-history-import.service";

type HistoryImportRunner = {
  run(importId: string): Promise<void>;
};

describe("MessagingHistoryImportService", () => {
  it("puts a direct conversation whose last message was outbound into history", async () => {
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const leadDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const importUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      messagingConnection: { findFirst: vi.fn().mockResolvedValue({ id: "connection-1" }) },
      outboxEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      messagingHistoryImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "import-1",
          tenantId: "tenant-1",
          kind: MessagingHistoryImportKind.DIRECT,
          startDate: new Date("2026-09-01T03:00:00.000Z"),
          status: MessagingHistoryImportStatus.PENDING,
          connection: {
            id: "connection-1",
            tenantId: "tenant-1",
            externalReference: "instance-1",
            status: MessagingConnectionStatus.CONNECTED,
            archivedAt: null,
          },
        }),
        update: importUpdate,
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-1",
          contactId: "contact-1",
          departmentId: "department-1",
          isGroup: false,
        }),
        update: conversationUpdate,
      },
      lead: { deleteMany: leadDeleteMany, upsert: vi.fn() },
      $transaction: vi.fn(async (work: unknown) =>
        typeof work === "function" ? work(prisma) : Promise.all(work as Promise<unknown>[]),
      ),
    };
    const evolution = {
      findChats: vi.fn().mockResolvedValue([{ remoteJid: "5511999999999@s.whatsapp.net" }]),
      findMessages: vi.fn().mockResolvedValue([
        { key: { id: "in-1" }, messageTimestamp: 1_789_000_000 },
        { key: { id: "out-1" }, messageTimestamp: 1_789_000_010 },
      ]),
    };
    const translator = {
      translate: vi.fn((payload: { data: { key: { id: string } } }) => ({
        kind: "inbound",
        event: {
          tenantId: "tenant-1",
          connectionId: "connection-1",
          externalMessageId: payload.data.key.id,
          externalChatId: "5511999999999@s.whatsapp.net",
          conversationType: "DIRECT",
          fromMe: payload.data.key.id === "out-1",
          sender: { phone: "+5511999999999", normalizedPhone: "+5511999999999" },
          type: "TEXT",
          content: payload.data.key.id,
          occurredAt: new Date(
            payload.data.key.id === "out-1" ? 1_789_000_010_000 : 1_789_000_000_000,
          ),
        },
      })),
    };
    const inbound = {
      process: vi.fn().mockResolvedValue({
        duplicate: false,
        createdConversation: true,
        message: { conversationId: "conversation-1" },
        conversationId: "conversation-1",
      }),
    };

    const service = new MessagingHistoryImportService(
      prisma as never,
      evolution as never,
      translator as never,
      inbound as never,
    );

    await (service as unknown as HistoryImportRunner).run("import-1");

    expect(inbound.process).toHaveBeenCalledWith(
      expect.objectContaining({ externalMessageId: "in-1" }),
      { historical: true },
    );
    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ConversationStatus.FECHADA,
          protocol: null,
          unreadCount: 0,
        }),
      }),
    );
    expect(leadDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", conversationId: "conversation-1" },
    });
  });

  it("stores an imported direct conversation ending in a contact message in history", async () => {
    const leadUpsert = vi.fn().mockResolvedValue({ id: "lead-1" });
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      messagingConnection: { findFirst: vi.fn().mockResolvedValue({ id: "connection-1" }) },
      outboxEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      messagingHistoryImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "import-2",
          tenantId: "tenant-1",
          kind: MessagingHistoryImportKind.DIRECT,
          startDate: new Date("2026-09-01T03:00:00.000Z"),
          status: MessagingHistoryImportStatus.PENDING,
          connection: {
            id: "connection-1",
            tenantId: "tenant-1",
            externalReference: "instance-1",
            status: MessagingConnectionStatus.CONNECTED,
            archivedAt: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-1",
          contactId: "contact-1",
          departmentId: "department-1",
          isGroup: false,
        }),
        update: conversationUpdate,
      },
      lead: { deleteMany: vi.fn(), upsert: leadUpsert },
      $transaction: vi.fn(async (work: unknown) =>
        typeof work === "function" ? work(prisma) : Promise.all(work as Promise<unknown>[]),
      ),
    };
    const evolution = {
      findChats: vi.fn().mockResolvedValue([{ remoteJid: "5511999999999@s.whatsapp.net" }]),
      findMessages: vi
        .fn()
        .mockResolvedValue([{ key: { id: "in-1" }, messageTimestamp: 1_789_000_000 }]),
    };
    const translator = {
      translate: vi.fn(() => ({
        kind: "inbound",
        event: {
          tenantId: "tenant-1",
          connectionId: "connection-1",
          externalMessageId: "in-1",
          externalChatId: "5511999999999@s.whatsapp.net",
          conversationType: "DIRECT",
          fromMe: false,
          sender: { phone: "+5511999999999", normalizedPhone: "+5511999999999" },
          type: "TEXT",
          content: "Olá",
          occurredAt: new Date(1_789_000_000_000),
        },
      })),
    };
    const inbound = {
      process: vi.fn().mockResolvedValue({
        duplicate: false,
        createdConversation: true,
        message: { conversationId: "conversation-1" },
        conversationId: "conversation-1",
      }),
    };

    const service = new MessagingHistoryImportService(
      prisma as never,
      evolution as never,
      translator as never,
      inbound as never,
    );

    await (service as unknown as HistoryImportRunner).run("import-2");

    expect(leadUpsert).not.toHaveBeenCalled();
    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ConversationStatus.FECHADA, protocol: null }),
      }),
    );
  });

  it("always stores imported group conversations in history without creating leads", async () => {
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const leadDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      messagingConnection: { findFirst: vi.fn().mockResolvedValue({ id: "connection-1" }) },
      outboxEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      messagingHistoryImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "import-3",
          tenantId: "tenant-1",
          kind: MessagingHistoryImportKind.GROUP,
          startDate: new Date("2026-09-01T03:00:00.000Z"),
          status: MessagingHistoryImportStatus.PENDING,
          connection: {
            id: "connection-1",
            tenantId: "tenant-1",
            externalReference: "instance-1",
            status: MessagingConnectionStatus.CONNECTED,
            archivedAt: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "group-conversation-1",
          contactId: "group-contact-1",
          departmentId: null,
          isGroup: true,
        }),
        update: conversationUpdate,
      },
      lead: { deleteMany: leadDeleteMany, upsert: vi.fn() },
      $transaction: vi.fn(async (work: unknown) =>
        typeof work === "function" ? work(prisma) : Promise.all(work as Promise<unknown>[]),
      ),
    };
    const evolution = {
      findChats: vi.fn().mockResolvedValue([{ remoteJid: "12345-67890@g.us" }]),
      findMessages: vi
        .fn()
        .mockResolvedValue([{ key: { id: "group-1" }, messageTimestamp: 1_789_000_000 }]),
    };
    const translator = {
      translate: vi.fn(() => ({
        kind: "inbound",
        event: {
          tenantId: "tenant-1",
          connectionId: "connection-1",
          externalMessageId: "group-1",
          externalChatId: "12345-67890@g.us",
          conversationType: "GROUP",
          fromMe: false,
          sender: { phone: "+5511999999999", normalizedPhone: "+5511999999999" },
          type: "TEXT",
          content: "Mensagem do grupo",
          occurredAt: new Date(1_789_000_000_000),
        },
      })),
    };
    const inbound = {
      process: vi.fn().mockResolvedValue({
        duplicate: false,
        createdConversation: true,
        message: { conversationId: "group-conversation-1" },
        conversationId: "group-conversation-1",
      }),
    };

    const service = new MessagingHistoryImportService(
      prisma as never,
      evolution as never,
      translator as never,
      inbound as never,
    );

    await (service as unknown as HistoryImportRunner).run("import-3");

    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ConversationStatus.FECHADA }),
      }),
    );
    expect(leadDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", conversationId: "group-conversation-1" },
      }),
    );
  });

  it("does not reopen a previously closed conversation when retrying imported duplicates", async () => {
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const leadUpsert = vi.fn();
    const prisma = {
      messagingConnection: { findFirst: vi.fn().mockResolvedValue({ id: "connection-1" }) },
      outboxEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      messagingHistoryImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "import-retry",
          tenantId: "tenant-1",
          kind: MessagingHistoryImportKind.DIRECT,
          startDate: new Date("2026-09-01T03:00:00.000Z"),
          status: MessagingHistoryImportStatus.PENDING,
          connection: {
            id: "connection-1",
            tenantId: "tenant-1",
            externalReference: "instance-1",
            status: MessagingConnectionStatus.CONNECTED,
            archivedAt: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      conversation: { findFirst: vi.fn(), update: conversationUpdate },
      lead: { deleteMany: vi.fn(), upsert: leadUpsert },
      $transaction: vi.fn(),
    };
    const evolution = {
      findChats: vi.fn().mockResolvedValue([{ remoteJid: "5511999999999@s.whatsapp.net" }]),
      findMessages: vi
        .fn()
        .mockResolvedValue([{ key: { id: "duplicate-1" }, messageTimestamp: 1_789_000_000 }]),
    };
    const translator = {
      translate: vi.fn(() => ({
        kind: "inbound",
        event: {
          tenantId: "tenant-1",
          connectionId: "connection-1",
          externalMessageId: "duplicate-1",
          externalChatId: "5511999999999@s.whatsapp.net",
          conversationType: "DIRECT",
          fromMe: false,
          sender: { phone: "+5511999999999", normalizedPhone: "+5511999999999" },
          type: "TEXT",
          content: "Mensagem antiga",
          occurredAt: new Date(1_789_000_000_000),
        },
      })),
    };
    const inbound = {
      process: vi.fn().mockResolvedValue({
        duplicate: true,
        message: { conversationId: "closed-conversation" },
      }),
    };
    const service = new MessagingHistoryImportService(
      prisma as never,
      evolution as never,
      translator as never,
      inbound as never,
    );

    await (service as unknown as HistoryImportRunner).run("import-retry");

    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(leadUpsert).not.toHaveBeenCalled();
  });
});

type ImportLifecycle = { enqueue(id: string): void; run(id: string): Promise<void> };
function lifecycleFixture() {
  const connection = {
    id: "connection-1",
    tenantId: "tenant-1",
    serviceEnabled: true,
    archivedAt: null,
    status: MessagingConnectionStatus.CONNECTED,
    externalReference: "fixture-instance",
  };
  const job = {
    id: "import-1",
    tenantId: "tenant-1",
    kind: MessagingHistoryImportKind.DIRECT,
    startDate: new Date("2026-09-01"),
    status: MessagingHistoryImportStatus.PENDING,
    connection,
  };
  const prisma = {
    messagingHistoryImport: {
      findMany: vi.fn().mockResolvedValue([job]),
      findUnique: vi.fn().mockResolvedValue(job),
      update: vi.fn().mockResolvedValue({}),
    },
    messagingConnection: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(connection),
    },
    outboxEvent: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const evolution = {
    findChats: vi.fn().mockResolvedValue([]),
    findMessages: vi.fn().mockResolvedValue([]),
  };
  const inbound = { process: vi.fn() };
  const translator = { translate: vi.fn() };
  const service = new MessagingHistoryImportService(
    prisma as never,
    evolution as never,
    translator as never,
    inbound as never,
  );
  return {
    connection,
    job,
    prisma,
    evolution,
    inbound,
    translator,
    service,
    runner: service as unknown as ImportLifecycle,
  };
}

describe("history lifecycle after service pause", () => {
  afterEach(() => vi.useRealTimers());
  it("handles schema rejection before the run try block without an unhandled promise", async () => {
    vi.useFakeTimers();
    const { prisma, service, runner } = lifecycleFixture();
    prisma.messagingHistoryImport.findUnique.mockRejectedValueOnce(
      Object.assign(new Error("schema absent"), { code: "P2022" }),
    );
    runner.enqueue("import-1");
    await vi.advanceTimersByTimeAsync(250);
    expect(prisma.messagingHistoryImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MessagingHistoryImportStatus.PENDING }),
      }),
    );
    await service.onModuleDestroy();
  });
  it("resumes pending imports without reconnect only after service and retained backlog are ready", async () => {
    vi.useFakeTimers();
    const { connection, prisma, evolution, service } = lifecycleFixture();
    connection.serviceEnabled = false;
    await service.onModuleInit();
    await vi.advanceTimersByTimeAsync(250);
    expect(evolution.findChats).not.toHaveBeenCalled();
    connection.serviceEnabled = true;
    prisma.outboxEvent.findFirst.mockResolvedValue({ id: "deferred" } as never);
    await vi.advanceTimersByTimeAsync(5250);
    expect(evolution.findChats).not.toHaveBeenCalled();
    prisma.outboxEvent.findFirst.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(5250);
    expect(evolution.findChats).toHaveBeenCalledOnce();
    expect(prisma.messagingHistoryImport.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MessagingHistoryImportStatus.COMPLETED }),
      }),
    );
    await service.onModuleDestroy();
  });
  it("stops timers at module shutdown before a scheduled import can begin", async () => {
    vi.useFakeTimers();
    const { prisma, evolution, service } = lifecycleFixture();
    await service.onModuleInit();
    await service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(20000);
    expect(evolution.findChats).not.toHaveBeenCalled();
    expect(prisma.messagingHistoryImport.findUnique).not.toHaveBeenCalled();
  });
  it("keeps an import pending when deferred events appear before historical ingestion", async () => {
    const { prisma, evolution, translator, inbound, service, runner } = lifecycleFixture();
    evolution.findChats.mockResolvedValue([{ remoteJid: "5511999000000@s.whatsapp.net" }] as never);
    evolution.findMessages.mockResolvedValue([
      { key: { id: "message-a" }, messageTimestamp: 1789999999 },
    ] as never);
    translator.translate.mockReturnValue({
      kind: "inbound",
      event: {
        tenantId: "tenant-1",
        connectionId: "connection-1",
        conversationType: "DIRECT",
        occurredAt: new Date("2026-09-22"),
        externalMessageId: "message-a",
      },
    });
    prisma.outboxEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "retained" } as never);
    await runner.run("import-1");
    expect(inbound.process).not.toHaveBeenCalled();
    expect(prisma.messagingHistoryImport.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MessagingHistoryImportStatus.PENDING,
          finishedAt: null,
        }),
      }),
    );
    await service.onModuleDestroy();
  });
});

it("persists first-time history configuration while paused for later scheduler resumption", async () => {
  vi.useFakeTimers();
  const { connection, job, prisma, evolution, service } = lifecycleFixture();
  connection.serviceEnabled = false;
  const upsert = vi.fn().mockResolvedValue(job);
  Object.assign(prisma.messagingHistoryImport, { upsert });
  prisma.messagingHistoryImport.findUnique.mockResolvedValueOnce(null as never);
  await service.enqueueForConnection({
    ...connection,
    importHistoryEnabled: true,
    importHistoryStartDate: new Date("2026-09-01"),
    importGroupsEnabled: false,
    importGroupsStartDate: null,
  });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ status: MessagingHistoryImportStatus.PENDING }),
    }),
  );
  await vi.advanceTimersByTimeAsync(250);
  expect(evolution.findChats).not.toHaveBeenCalled();
  await service.onModuleDestroy();
  vi.useRealTimers();
});
