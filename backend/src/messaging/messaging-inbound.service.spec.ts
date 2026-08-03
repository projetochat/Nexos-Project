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
        status: MessageStatus.DELIVERED,
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
        status: ConversationStatus.ABERTA,
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
  };
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-a",
    tenantId: "tenant-a",
    contactId: "contact-a",
    connectionId: "connection-a",
    status: ConversationStatus.ABERTA,
    unreadCount: 0,
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
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}
