import { describe, expect, it, vi } from "vitest";
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

  it("turns an imported direct conversation ending in a contact message into a lead", async () => {
    const leadUpsert = vi.fn().mockResolvedValue({ id: "lead-1" });
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
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

    expect(leadUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          conversationId: "conversation-1",
          firstMessagePreview: "Olá",
        }),
      }),
    );
    expect(conversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ConversationStatus.ABERTA, protocol: null }),
      }),
    );
  });

  it("always stores imported group conversations in history without creating leads", async () => {
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const leadDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
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
});
