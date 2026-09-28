import { describe, expect, it, vi } from "vitest";
import { MessagingOutboundService } from "./messaging-outbound.service";

const occurrenceAt = new Date("2026-09-27T14:00:00.000Z");
const connection = {
  id: "connection-a",
  tenantId: "tenant-a",
  name: "Atendimento",
  archivedAt: null,
  serviceEnabled: true,
};
const conversation = {
  id: "conversation-a",
  tenantId: "tenant-a",
  connectionId: "connection-a",
  externalChatId: "5511999999999@s.whatsapp.net",
  archivedAt: null,
  status: "EM_ANDAMENTO",
  conversationType: "DIRECT",
  assignedMembershipId: "membership-a",
  contact: {
    name: "Maria",
    phone: "+5511999999999",
    email: "maria@example.com",
    departmentName: "Comercial",
    customer: { name: "Cliente XPTO" },
    customFieldValues: [{ value: "Premium", field: { label: "Plano" } }],
  },
  connection,
  department: { name: "Vendas" },
};

function message(data: Record<string, unknown>) {
  return {
    id: "message-a",
    tenantId: "tenant-a",
    conversationId: "conversation-a",
    connectionId: "connection-a",
    direction: "OUTBOUND",
    type: "TEXT",
    status: "QUEUED",
    authorMembershipId: "membership-a",
    content: "",
    createdAt: occurrenceAt,
    updatedAt: occurrenceAt,
    reactions: [],
    quotedMessage: null,
    authorMembership: null,
    ...data,
  };
}

function setup(
  options: {
    existing?: ReturnType<typeof message> | null;
    mediaStorage?: object;
    senderDisplayName?: object;
  } = {},
) {
  const tx = {
    message: {
      findFirst: vi.fn().mockResolvedValue(options.existing ?? null),
      create: vi.fn().mockImplementation(async ({ data }) => message(data)),
    },
    messagingConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "membership-a",
        role: {
          key: "agent",
          metadata: { connectionIds: ["connection-a"] },
          permissions: [
            { permissionId: "chat.agent_name.show" },
            { permissionId: "chat.audio.send" },
          ],
        },
      }),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    schedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    conversation: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    message: { findFirst: vi.fn().mockResolvedValue(options.existing ?? null) },
    conversation: { findFirst: vi.fn().mockResolvedValue(conversation) },
    schedule: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenantMembership: tx.tenantMembership,
    $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
  };
  const dispatcher = { dispatchMessage: vi.fn().mockResolvedValue(true) };
  const realtime = {
    publishMessageCreated: vi.fn(),
    publishConversationUpdated: vi.fn(),
  };
  const service = new MessagingOutboundService(
    prisma as never,
    {} as never,
    dispatcher as never,
    options.mediaStorage as never,
    undefined,
    realtime as never,
    options.senderDisplayName as never,
  );
  return { service, prisma, tx, dispatcher, realtime };
}

describe("MessagingOutboundService scheduled messages", () => {
  it("renders current conversation variables and atomically creates Message, Outbox and schedule link", async () => {
    const { service, tx, dispatcher } = setup();

    await expect(
      service.queueScheduledMessage({
        tenantId: "tenant-a",
        scheduleId: "schedule-a",
        claimedVersion: 3,
        occurrenceAt,
        conversationId: "conversation-a",
        createdByMembershipId: "membership-a",
        content: "Olá, {{nome}} da {{cliente}} — plano {{plano}} / {{departamento}}",
      }),
    ).resolves.toMatchObject({ created: true });

    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientMessageId: "schedule:schedule-a:2026-09-27T14:00:00.000Z",
          content: "Olá, Maria da Cliente XPTO — plano Premium / Vendas",
          authorMembershipId: "membership-a",
          status: "QUEUED",
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aggregateId: "message-a" }) }),
    );
    expect(tx.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "schedule-a",
          executionStatus: "CLAIMED",
          version: 3,
        }),
        data: expect.objectContaining({ executionStatus: "QUEUED", messageId: "message-a" }),
      }),
    );
    expect(dispatcher.dispatchMessage).toHaveBeenCalledWith("message-a");
  });

  it("prefixes the active attendant name using the same display-name rule as normal chat", async () => {
    const senderDisplayName = {
      resolveForMembership: vi.fn().mockResolvedValue("Ana Atendimento"),
    };
    const { service, tx } = setup({ senderDisplayName });

    await service.queueScheduledMessage({
      tenantId: "tenant-a",
      scheduleId: "schedule-a",
      claimedVersion: 3,
      occurrenceAt,
      conversationId: "conversation-a",
      createdByMembershipId: "membership-a",
      content: "Olá, {{nome}}",
    });

    expect(senderDisplayName.resolveForMembership).toHaveBeenCalledWith(tx, {
      tenantId: "tenant-a",
      membershipId: "membership-a",
      roleKey: "agent",
    });
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "*Ana Atendimento:*\n\nOlá, Maria" }),
      }),
    );
  });

  it("reuses the deterministic existing Message after recovery instead of creating another", async () => {
    const existing = message({
      clientMessageId: "schedule:schedule-a:2026-09-27T14:00:00.000Z",
    });
    const { service, prisma } = setup({ existing });

    await expect(
      service.queueScheduledMessage({
        tenantId: "tenant-a",
        scheduleId: "schedule-a",
        claimedVersion: 8,
        occurrenceAt,
        conversationId: "conversation-a",
        createdByMembershipId: "membership-a",
        content: "Não deve duplicar",
      }),
    ).resolves.toMatchObject({ created: false });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 8, executionStatus: "CLAIMED" }),
        data: expect.objectContaining({ messageId: "message-a", executionStatus: "QUEUED" }),
      }),
    );
  });

  it("stores one validated attachment and materializes it as outbound media", async () => {
    const mediaStorage = {
      storeDownloaded: vi.fn().mockResolvedValue({
        objectKey: "tenants/tenant-a/messages/file",
        checksum: "checksum-a",
        mimeType: "text/plain",
        fileName: "lembrete.txt",
        sizeBytes: 5,
      }),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const { service, tx } = setup({ mediaStorage });

    await service.queueScheduledMessage({
      tenantId: "tenant-a",
      scheduleId: "schedule-a",
      claimedVersion: 3,
      occurrenceAt,
      conversationId: "conversation-a",
      createdByMembershipId: "membership-a",
      content: "Arquivo para {{nome}}",
      attachment: {
        fileName: "lembrete.txt",
        mimeType: "text/plain",
        size: 5,
        dataUrl: "data:text/plain;base64,VGVzdGU=",
      },
    });

    expect(mediaStorage.storeDownloaded).toHaveBeenCalledOnce();
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DOCUMENT",
          content: "Arquivo para Maria",
          mediaStorageKey: "tenants/tenant-a/messages/file",
          mediaFileName: "lembrete.txt",
          mediaSize: 5,
        }),
      }),
    );
  });

  it("keeps scheduled audio enabled while individual permissions are paused", async () => {
    const mediaStorage = {
      storeDownloaded: vi.fn().mockResolvedValue({
        objectKey: "tenants/tenant-a/messages/audio",
        checksum: "checksum-audio",
        mimeType: "audio/webm",
        fileName: "audio.webm",
        sizeBytes: 4,
      }),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const { service, prisma } = setup({ mediaStorage });
    prisma.tenantMembership.findFirst.mockResolvedValue({
      id: "membership-a",
      role: {
        key: "agent",
        metadata: { connectionIds: ["connection-a"] },
        permissions: [],
      },
    });

    await expect(
      service.queueScheduledMessage({
        tenantId: "tenant-a",
        scheduleId: "schedule-audio",
        claimedVersion: 2,
        occurrenceAt,
        conversationId: "conversation-a",
        createdByMembershipId: "membership-a",
        content: "",
        attachment: {
          fileName: "audio.webm",
          mimeType: "audio/webm",
          size: 4,
          dataUrl: "data:audio/webm;base64,VGVzdA==",
        },
      }),
    ).resolves.toMatchObject({ created: true });
    expect(mediaStorage.storeDownloaded).toHaveBeenCalledOnce();
  });

  it("rejects delivery when the stored creator is no longer active", async () => {
    const { service, prisma, tx } = setup();
    prisma.tenantMembership.findFirst.mockResolvedValue(null);

    await expect(
      service.queueScheduledMessage({
        tenantId: "tenant-a",
        scheduleId: "schedule-a",
        claimedVersion: 3,
        occurrenceAt,
        conversationId: "conversation-a",
        createdByMembershipId: "inactive-membership",
        content: "Mensagem agendada",
      }),
    ).rejects.toThrow("não possui mais um vínculo ativo");

    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith({
      where: {
        id: "inactive-membership",
        tenantId: "tenant-a",
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        role: {
          select: {
            key: true,
            metadata: true,
            permissions: { select: { permissionId: true } },
          },
        },
      },
    });
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("allows a legacy backfilled schedule without creator using the service identity", async () => {
    const senderDisplayName = { resolveForMembership: vi.fn() };
    const { service, prisma, tx } = setup({ senderDisplayName });
    await service.queueScheduledMessage({
      tenantId: "tenant-a",
      scheduleId: "schedule-legacy",
      claimedVersion: 3,
      occurrenceAt,
      conversationId: "conversation-a",
      createdByMembershipId: null,
      content: "Mensagem legada",
    });
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
    expect(senderDisplayName.resolveForMembership).not.toHaveBeenCalled();
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorMembershipId: null }) }),
    );
  });

  it("rejects delivery when the creator lost access to the conversation connection", async () => {
    const { service, prisma, tx } = setup();
    prisma.tenantMembership.findFirst.mockResolvedValue({
      id: "membership-a",
      role: {
        key: "agent",
        metadata: { connectionIds: ["connection-other"] },
        permissions: [],
      },
    });
    await expect(
      service.queueScheduledMessage({
        tenantId: "tenant-a",
        scheduleId: "schedule-a",
        claimedVersion: 3,
        occurrenceAt,
        conversationId: "conversation-a",
        createdByMembershipId: "membership-a",
        content: "Mensagem sem acesso",
      }),
    ).rejects.toThrow("não possui mais acesso");
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
