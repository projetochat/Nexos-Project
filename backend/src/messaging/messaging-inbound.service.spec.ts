import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "../generated/prisma";
import { MessagingInboundService } from "./messaging-inbound.service";

beforeEach(() =>
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network disabled in inbound tests"))),
);
afterEach(() => vi.unstubAllGlobals());

describe("MessagingInboundService", () => {
  it("rejects required retained media failures before the transaction can commit a message", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    const committed = vi.fn();
    prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(prisma);
      committed();
      return result;
    });
    const storeDownloaded = vi.fn().mockRejectedValue(new Error("isolated storage failure"));
    await expect(
      new MessagingInboundService(prisma as never, { storeDownloaded } as never).process(
        retainedContact(),
        { requireMediaReady: true, suppressAutomaticReply: true },
      ),
    ).rejects.toThrow("isolated storage failure");
    expect(committed).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([null, "stored/failed.vcf"])(
    "repairs missing or failed stored media %s before acknowledging retained delivery",
    async (mediaStorageKey) => {
      const prisma = prismaMock();
      prisma.messagingConnection.findFirst.mockResolvedValue(connection());
      const existing = {
        id: "message-existing",
        conversationId: "conversation-a",
        mediaStorageKey,
        mediaState: "FAILED",
      };
      prisma.message.findFirst.mockResolvedValue(existing);
      const stored = {
        objectKey: "isolated/contact.vcf",
        mimeType: "text/vcard",
        fileName: "contato.vcf",
        sizeBytes: 32,
        checksum: "test-checksum",
      };
      prisma.message.update.mockResolvedValue({ ...existing, mediaStorageKey: stored.objectKey });
      const storeDownloaded = vi.fn().mockResolvedValue(stored);
      const realtime = { publishConversationUpdated: vi.fn() };
      const result = await new MessagingInboundService(
        prisma as never,
        { storeDownloaded } as never,
        realtime as never,
      ).process(retainedContact(), { requireMediaReady: true });
      expect(realtime.publishConversationUpdated).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        reason: "message.media_ready",
      });
      expect(result.duplicate).toBe(true);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "message-existing" },
        data: {
          mediaStorageKey: stored.objectKey,
          mediaMimeType: stored.mimeType,
          mediaFileName: stored.fileName,
          mediaSize: stored.sizeBytes,
          mediaChecksum: stored.checksum,
          mediaState: "READY",
        },
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
      expect(storeDownloaded).toHaveBeenCalledWith(
        expect.objectContaining({ body: retainedContact().media.inlineBody }),
      );
    },
  );

  it("leaves failed duplicate-media repair pending and does not overwrite the existing message", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue({
      id: "message-existing",
      conversationId: "conversation-a",
      mediaStorageKey: null,
    });
    await expect(
      new MessagingInboundService(prisma as never).process(retainedContact(), {
        requireMediaReady: true,
      }),
    ).rejects.toThrow("Mídia retida ainda não disponível");
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("does not download an already stored duplicate again", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue({
      id: "message-existing",
      conversationId: "conversation-a",
      mediaStorageKey: "stored/card.vcf",
      mediaState: "READY",
    });
    const storeDownloaded = vi.fn();
    expect(
      (
        await new MessagingInboundService(prisma as never, { storeDownloaded } as never).process(
          retainedContact(),
          { requireMediaReady: true },
        )
      ).duplicate,
    ).toBe(true);
    expect(storeDownloaded).not.toHaveBeenCalled();
  });

  it("queues the configured welcome message when a direct conversation starts", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      welcomeEnabled: true,
      welcomeNewMessage: "Olá {{nome}}, bem-vindo!",
      welcomeExistingMessage: "Olá novamente {{nome}}!",
    });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(conversation({ id: "conversation-new" }));
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-new",
      status: MessageStatus.CREATED,
      createdAt: new Date(),
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ id: "conversation-new", unreadCount: 1 }),
    );
    const outbound = { queueAutomatedText: vi.fn().mockResolvedValue({ created: true }) };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      outbound as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-welcome",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321", displayName: "Douglas" },
      type: MessageType.TEXT,
      content: "Oi",
      occurredAt: new Date("2026-09-17T19:44:00"),
    });

    expect(outbound.queueAutomatedText).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "welcome",
        conversationId: "conversation-new",
        content: "Olá novamente Cliente!",
      }),
    );
  });

  it("queues configured welcome media with the resolved text as its caption", async () => {
    const prisma = prismaMock();
    const attachment = {
      fileName: "boas-vindas.png",
      mimeType: "image/png",
      size: 4,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    };
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      welcomeEnabled: true,
      welcomeNewMessage: "Olá {{nome}}!",
      welcomeExistingMessage: "Olá novamente {{nome}}!",
      welcomeExistingAttachment: attachment,
    });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(conversation({ id: "conversation-media" }));
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-media",
      status: MessageStatus.CREATED,
      createdAt: new Date(),
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ id: "conversation-media", unreadCount: 1 }),
    );
    const outbound = {
      queueAutomatedText: vi.fn(),
      queueAutomatedMedia: vi.fn().mockResolvedValue({ created: true }),
    };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      outbound as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-welcome-media",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
      type: MessageType.TEXT,
      content: "Oi",
      occurredAt: new Date("2026-09-18T19:44:00"),
    });

    expect(outbound.queueAutomatedMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "welcome",
        conversationId: "conversation-media",
        content: "Olá novamente Cliente!",
        attachment,
      }),
    );
    expect(outbound.queueAutomatedText).not.toHaveBeenCalled();
  });

  it("queues configured absence media outside service hours", async () => {
    const prisma = prismaMock();
    const attachment = {
      fileName: "ausencia.ogg",
      mimeType: "audio/ogg",
      size: 8,
      dataUrl: "data:audio/ogg;base64,T2dnUw==",
    };
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      welcomeEnabled: true,
      welcomeExistingMessage: "Olá {{nome}}!",
      absenceEnabled: true,
      absenceMessage: "Estamos ausentes, {{nome}}.",
      absenceAttachment: attachment,
      timezone: "America/Sao_Paulo",
      serviceHours: [{ day: "Quinta", active: true, start: "08:00", end: "18:00" }],
    });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(conversation({ id: "conversation-absence" }));
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-absence",
      status: MessageStatus.CREATED,
      createdAt: new Date(),
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ id: "conversation-absence", unreadCount: 1 }),
    );
    const outbound = {
      queueAutomatedText: vi.fn(),
      queueAutomatedMedia: vi.fn().mockResolvedValue({ created: true }),
    };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      outbound as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-absence-media",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
      type: MessageType.TEXT,
      content: "Oi",
      occurredAt: new Date("2026-09-17T22:00:00.000Z"),
    });

    expect(outbound.queueAutomatedMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "absence",
        conversationId: "conversation-absence",
        content: "Estamos ausentes, Cliente.",
        attachment,
      }),
    );
    expect(outbound.queueAutomatedText).not.toHaveBeenCalled();
  });

  it("does not create leads, unread messages or automatic replies while importing history", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      welcomeEnabled: true,
      welcomeNewMessage: "Olá {{nome}}",
      welcomeExistingMessage: "Olá {{nome}}",
    });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(
      conversation({
        id: "conversation-imported",
        status: ConversationStatus.FECHADA,
        closedAt: new Date("2026-09-01T12:00:00.000Z"),
      }),
    );
    prisma.message.create.mockResolvedValue({
      id: "message-imported",
      conversationId: "conversation-imported",
      status: MessageStatus.CREATED,
      createdAt: new Date(),
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ id: "conversation-imported", unreadCount: 0 }),
    );
    const outbound = { queueAutomatedText: vi.fn() };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      outbound as never,
    ).process(
      {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        externalMessageId: "imported-1",
        externalChatId: "5511987654321@s.whatsapp.net",
        conversationType: "DIRECT",
        fromMe: false,
        sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
        type: MessageType.TEXT,
        content: "Mensagem antiga",
        occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      { historical: true },
    );

    expect(prisma.lead.upsert).not.toHaveBeenCalled();
    expect(outbound.queueAutomatedText).not.toHaveBeenCalled();
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: ConversationStatus.FECHADA,
        closedAt: new Date("2026-09-01T12:00:00.000Z"),
      }),
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unreadCount: 0,
          status: ConversationStatus.FECHADA,
        }),
      }),
    );
  });

  it("keeps a closed conversation closed when importing more of its history", async () => {
    const prisma = prismaMock();
    const closedAt = new Date("2026-09-10T15:00:00.000Z");
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(
      conversation({
        status: ConversationStatus.FECHADA,
        protocol: "000138",
        closedAt,
        lastMessageAt: closedAt,
        lastMessagePreview: "Conversa encerrada - protocolo 000138.",
      }),
    );
    prisma.message.create.mockResolvedValue({
      id: "older-message",
      conversationId: "conversation-a",
      status: MessageStatus.CREATED,
      createdAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ status: ConversationStatus.FECHADA, protocol: "000138", closedAt }),
    );

    await new MessagingInboundService(prisma as never).process(
      {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        externalMessageId: "older-message",
        externalChatId: "5511987654321@s.whatsapp.net",
        conversationType: "DIRECT",
        fromMe: false,
        sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
        type: MessageType.TEXT,
        content: "Mensagem antiga",
        occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      { historical: true },
    );

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ConversationStatus.FECHADA,
          protocol: "000138",
          closedAt,
          lastMessageAt: closedAt,
          lastMessagePreview: "Conversa encerrada - protocolo 000138.",
        }),
      }),
    );
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it("preserves newer preview and timestamp while counting a retained older message as unread", async () => {
    const prisma = prismaMock();
    const latestAt = new Date("2026-09-22T14:00:00.000Z");
    const latest = conversation({
      unreadCount: 2,
      lastMessageAt: latestAt,
      lastMessagePreview: "Mensagem mais recente",
    });
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(latest);
    prisma.message.create.mockResolvedValue({
      id: "retained-old",
      conversationId: "conversation-a",
      status: MessageStatus.CREATED,
    });
    prisma.conversation.update.mockResolvedValue({ ...latest, unreadCount: 3 });
    const automaticReply = { queueText: vi.fn() };
    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      automaticReply as never,
    ).process(
      {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        externalMessageId: "retained-old",
        externalChatId: "5511987654321@s.whatsapp.net",
        conversationType: "DIRECT",
        fromMe: false,
        sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
        type: MessageType.TEXT,
        content: "Mensagem retida antiga",
        occurredAt: new Date("2026-09-22T12:00:00.000Z"),
      },
      { suppressAutomaticReply: true },
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastMessageAt: latestAt,
          lastMessagePreview: "Mensagem mais recente",
          unreadCount: { increment: 1 },
        }),
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Mensagem retida antiga" }),
      }),
    );
    expect(automaticReply.queueText).not.toHaveBeenCalled();
  });

  it("does not replace the latest preview while replaying an edit to an older message", async () => {
    const prisma = prismaMock();
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: "older", conversationId: "conversation-a", content: "Antes" })
      .mockResolvedValueOnce({ id: "latest" });
    await new MessagingInboundService(prisma as never).processEdit(
      {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        providerMessageId: "provider-older",
        content: "Texto editado",
        occurredAt: new Date("2026-09-22T12:00:00.000Z"),
      },
      { preserveLatestPreview: true },
    );
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: "Texto editado" }) }),
    );
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("refreshes the last message preview without moving its date for a retained edit", async () => {
    const prisma = prismaMock();
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: "latest", conversationId: "conversation-a", content: "Antes" })
      .mockResolvedValueOnce({ id: "latest" });
    await new MessagingInboundService(prisma as never).processEdit(
      {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        providerMessageId: "provider-latest",
        content: "Texto editado",
        occurredAt: new Date("2026-09-22T12:00:00.000Z"),
      },
      { preserveLatestPreview: true },
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastMessagePreview: "Texto editado" } }),
    );
  });

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
      status: MessageStatus.CREATED,
      createdAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));

    const result = await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-1",
      externalChatId: "551187654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: {
        phone: "551187654321@s.whatsapp.net",
        normalizedPhone: "+551187654321",
        displayName: "Cliente",
      },
      type: MessageType.TEXT,
      content: "Resposta real",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
      metadata: {
        remoteJid: "551187654321@s.whatsapp.net",
        normalizedPhoneCandidates: ["+5511987654321", "+551187654321"],
      },
    });

    expect(result.duplicate).toBe(false);
    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-a",
        normalizedPhone: { in: ["+5511987654321", "+551187654321"] },
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
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
      type: MessageType.TEXT,
      content: "Replay",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(result.duplicate).toBe(true);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("puts an existing contact in the queue when the previous conversation is closed", async () => {
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
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
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
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: MessageDirection.SYSTEM,
        type: MessageType.SYSTEM,
        content: "Nova conversa (passiva)",
      }),
    });
  });

  it("uses the connection default department only when creating a new inbound conversation", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue({
      ...connection(),
      defaultDepartmentId: "department-sales",
    });
    prisma.department.findFirst.mockResolvedValue({ id: "department-sales" });
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(
      conversation({ id: "conversation-default", departmentId: "department-sales" }),
    );
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-default",
    });
    prisma.conversation.update.mockResolvedValue(
      conversation({ id: "conversation-default", departmentId: "department-sales" }),
    );

    await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-default-department",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
      type: MessageType.TEXT,
      content: "Nova conversa na fila correta",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: "department-sales", tenantId: "tenant-a", active: true },
      select: { id: true },
    });
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ departmentId: "department-sales" }),
    });
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ departmentId: "department-a" }),
      }),
    );
  });

  it("creates a lead when the inbound sender is a new contact", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.upsert.mockResolvedValue(contact());
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
      externalMessageId: "inbound-new-contact",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
      type: MessageType.TEXT,
      content: "Primeiro contato",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
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
        status: LeadStatus.NEW,
      }),
    });
    expect(prisma.notification.createMany).toHaveBeenCalledOnce();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: MessageDirection.SYSTEM,
        type: MessageType.SYSTEM,
        content: "Nova lead (passiva)",
      }),
    });
  });

  it("reuses the unique contact when inbound creation races with another message", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.upsert.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-a",
      status: MessageStatus.CREATED,
      createdAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));

    await new MessagingInboundService(prisma as never).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-race",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: {
        phone: "5511987654321@s.whatsapp.net",
        normalizedPhone: "+5511987654321",
        displayName: "Cliente",
      },
      type: MessageType.TEXT,
      content: "Mensagem concorrente",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.contact.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_normalizedPhone: {
          tenantId: "tenant-a",
          normalizedPhone: "+5511987654321",
        },
      },
      update: expect.objectContaining({
        archivedAt: null,
        phone: "5511987654321@s.whatsapp.net",
      }),
      create: expect.objectContaining({
        tenantId: "tenant-a",
        normalizedPhone: "+5511987654321",
      }),
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conversation-a",
        externalMessageId: "inbound-race",
      }),
    });
  });

  it("does not block inbound messages while looking up WhatsApp profile pictures", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-a",
      status: MessageStatus.CREATED,
      createdAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));
    const realtime = {
      publishMessageCreated: vi.fn(),
      publishConversationUpdated: vi.fn(),
      publishContactUpdated: vi.fn(),
      publishUnreadUpdated: vi.fn(),
    };
    const evolution = { fetchProfilePictureUrl: vi.fn() };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      realtime as never,
      evolution as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-photo",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: {
        phone: "5511987654321@s.whatsapp.net",
        normalizedPhone: "+5511987654321",
        displayName: "Douglas Rezende",
      },
      type: MessageType.TEXT,
      content: "Oi",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
      metadata: { remoteJid: "5511987654321@s.whatsapp.net" },
    });

    expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();
    expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    expect(realtime.publishContactUpdated).not.toHaveBeenCalled();
  });

  it("uses the profile picture URL from the Evolution webhook when present", async () => {
    const prisma = prismaMock();
    prisma.messagingConnection.findFirst.mockResolvedValue(connection());
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.contact.findFirst.mockResolvedValue(contact());
    prisma.contact.update.mockResolvedValue(contact());
    prisma.contact.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversation.findFirst.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue({
      id: "message-inbound",
      conversationId: "conversation-a",
      status: MessageStatus.CREATED,
      createdAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue(conversation({ unreadCount: 1 }));
    const evolution = { fetchProfilePictureUrl: vi.fn() };

    await new MessagingInboundService(
      prisma as never,
      undefined,
      undefined,
      evolution as never,
    ).process({
      tenantId: "tenant-a",
      connectionId: "connection-a",
      externalMessageId: "inbound-photo-webhook",
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: {
        phone: "5511987654321@s.whatsapp.net",
        normalizedPhone: "+5511987654321",
        displayName: "Douglas Rezende",
      },
      type: MessageType.TEXT,
      content: "Oi",
      occurredAt: new Date("2026-08-03T12:00:00.000Z"),
      metadata: {
        remoteJid: "5511987654321@s.whatsapp.net",
        profilePictureUrl: "https://pps.whatsapp.net/v/profile-picture-from-webhook.jpg",
      },
    });

    expect(evolution.fetchProfilePictureUrl).not.toHaveBeenCalled();
    expect(prisma.contact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { avatarUrl: "https://pps.whatsapp.net/v/profile-picture-from-webhook.jpg" },
      }),
    );
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
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
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
      externalChatId: "5511987654321@s.whatsapp.net",
      conversationType: "DIRECT",
      fromMe: false,
      sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
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
    phone: "5511987654321",
    normalizedPhone: "+5511987654321",
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
    $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true }]),
    messagingConnection: { findFirst: vi.fn() },
    message: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(),
      upsert: vi.fn(),
    },
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
    contactCustomFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
  return prisma;
}

function retainedContact() {
  return {
    tenantId: "tenant-a",
    connectionId: "connection-a",
    externalMessageId: "retained-contact",
    externalChatId: "5511987654321@s.whatsapp.net",
    conversationType: "DIRECT" as const,
    fromMe: false,
    sender: { phone: "5511987654321", normalizedPhone: "+5511987654321" },
    type: MessageType.DOCUMENT,
    content: "[contato] Teste",
    occurredAt: new Date("2026-09-22T12:00:00Z"),
    media: {
      inlineBody: Buffer.from("BEGIN:VCARD\r\nFN:Teste\r\nEND:VCARD"),
      mimetype: "text/vcard",
      fileName: "contato.vcf",
    },
  };
}
