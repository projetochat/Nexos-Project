import { describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "../generated/prisma";
import { MessagingInboundService } from "./messaging-inbound.service";

describe("MessagingInboundService", () => {
  it("reuses an existing contact and open conversation for inbound replies", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-a",
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));

    const result = await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-1",
      sender: {
        phone: "551199999999@s.whatsapp.net",
        normalizedPhone: "+551199999999",
        displayName: "Cliente",
      },
      type: MessageType.TEXT,
      content: "Resposta real",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
      metadata: {
        remoteJid: "551199999999@s.whatsapp.net",
        normalizedPhoneCandidates: ["+551199999999", "+5511999999999"],
      },
    });

    expect(result.duplicate).toBe(false);
    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        normalizedPhone: { in: ["+551199999999", "+5511999999999"] },
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conversation-a",
        direction: MessageDirection.INBOUND,
        status: MessageStatus.CREATED,
        externalMessageId: "inbound-1",
      }),
    });
  });

  it("ignores replayed external ids without incrementing unread or lastMessage", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue({
      id: "message-existing",
      conversationId: "conversation-a",
    });

    const result = await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-1",
      sender: { phone: "5511999999999", normalizedPhone: "+5511999999999" },
      type: MessageType.TEXT,
      content: "Replay",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(result.duplicate).toBe(true);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("creates a new conversation when the only compatible conversation is closed", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(conversation({ id: "conversation-new" }));
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-new",
    });
    prisma.conversation.update.mockResolvedValue(conversation({ id: "conversation-new" }));

    await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-new",
      sender: { phone: "5511999999999", normalizedPhone: "+5511999999999" },
      type: MessageType.TEXT,
      content: "Nova conversa apos fechamento",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        contactId: "contact-a",
        connectionId: "connection-a",
        departmentId: "department-a",
        status: ConversationStatus.ABERTA,
      }),
    });
    expect(prisma.lead.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_conversationId: {
          tenantId: "tenant-a",
          conversationId: "conversation-new",
        },
      },
      update: expect.objectContaining({
        contactId: "contact-a",
        departmentId: "department-a",
      }),
      create: expect.objectContaining({
        tenantId: "tenant-a",
        contactId: "contact-a",
        conversationId: "conversation-new",
        departmentId: "department-a",
        status: "NEW",
      }),
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "tenant-a",
          membershipId: "membership-a",
          departmentId: "department-a",
          kind: "LEAD_CREATED",
          entityType: "lead",
          entityId: "lead-a",
        }),
      ],
    });
  });

  it("downloads inbound media through Evolution before falling back to encrypted provider URLs", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-media",
      conversationId: "conversation-a",
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));
    const mediaStorage = {
      storeDownloaded: vi.fn().mockResolvedValue({
        objectKey: "tenants/t/messages/media.jpg",
        mimeType: "image/jpeg",
        fileName: "media.jpg",
        sizeBytes: 5,
        checksum: "checksum",
      }),
    };
    const evolution = {
      getBase64FromMediaMessage: vi.fn().mockResolvedValue({
        body: Buffer.from("plain"),
        mimeType: "image/jpeg",
        fileName: "media.jpg",
      }),
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await new MessagingInboundService(
      prisma as never,
      mediaStorage as never,
      undefined,
      evolution as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "image-1",
      externalChatId: "5511999999999@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511999999999", normalizedPhone: "+5511999999999" },
      type: MessageType.IMAGE,
      content: "Foto",
      media: {
        url: "https://mmg.whatsapp.net/v/media.enc",
        mimetype: "image/jpeg",
        rawMessage: { key: { id: "image-1" } },
      },
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(evolution.getBase64FromMediaMessage).toHaveBeenCalledWith({
      instanceName: "tenant-a-suporte",
      message: { key: { id: "image-1" } },
    });
    expect(fetchSpy).not.toHaveBeenCalledWith("https://mmg.whatsapp.net/v/media.enc");
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mediaStorageKey: "tenants/t/messages/media.jpg",
        mediaState: "READY",
      }),
    });
  });

  it("accepts downloaded WhatsApp voice audio with opus codec MIME parameters", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-audio",
      conversationId: "conversation-a",
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));
    const mediaStorage = {
      storeDownloaded: vi.fn().mockImplementation(async (input) => ({
        objectKey: "tenants/t/messages/audio.oga",
        mimeType: input.mimeType.split(";")[0],
        fileName: "audio.oga",
        sizeBytes: input.body.byteLength,
        checksum: "checksum",
      })),
    };
    const evolution = {
      getBase64FromMediaMessage: vi.fn().mockResolvedValue({
        body: Buffer.from("OggSvoice"),
        mimeType: "audio/ogg; codecs=opus",
        fileName: "audio.oga",
      }),
    };

    await new MessagingInboundService(
      prisma as never,
      mediaStorage as never,
      undefined,
      evolution as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "voice-1",
      externalChatId: "5511999999999@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511999999999", normalizedPhone: "+5511999999999" },
      type: MessageType.VOICE,
      media: {
        url: "https://mmg.whatsapp.net/v/audio.enc",
        mimetype: "audio/ogg; codecs=opus",
        rawMessage: { key: { id: "voice-1" } },
      },
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: MessageType.VOICE,
        mediaStorageKey: "tenants/t/messages/audio.oga",
        mediaMimeType: "audio/ogg",
        mediaState: "READY",
      }),
    });
  });
});

function connection() {
  return {
    id: "connection-a",
    tenantId: "tenant-a",
    externalReference: "tenant-a-suporte",
    ownerPhoneNormalized: "+5511888888888",
  };
}

function contact() {
  return {
    id: "contact-a",
    tenantId: "tenant-a",
    phone: "5511999999999",
    normalizedPhone: "+5511999999999",
    name: "Cliente",
    instance: "tenant-a-suporte",
    departmentId: "department-a",
  };
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-a",
    tenantId: "tenant-a",
    contactId: "contact-a",
    connectionId: "connection-a",
    departmentId: "department-a",
    status: ConversationStatus.ABERTA,
    unreadCount: 0,
    lastMessageAt: new Date("2026-08-03T11:00:00.000Z"),
    closedAt: null,
    ...overrides,
  };
}

function prismaMock() {
  const prisma = {
    messagingConnection: { findFirst: vi.fn() },
    message: { findFirst: vi.fn(), create: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    department: { findFirst: vi.fn().mockResolvedValue({ id: "department-a" }) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([{ id: "membership-a" }]) },
    lead: { upsert: vi.fn().mockResolvedValue({ id: "lead-a" }) },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "notification-a",
          membershipId: "membership-a",
          departmentId: "department-a",
          kind: "LEAD_CREATED",
        },
      ]),
    },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}
