import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMediaRecoveryService } from "./message-media-recovery.service";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network disabled");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const message = {
    id: "msg",
    tenantId: "tenant",
    conversationId: "conv",
    connectionId: "conn",
    direction: "INBOUND",
    type: "DOCUMENT",
    externalMessageId: "provider-id",
    providerMessageId: "provider-id",
    providerChatId: "chat@s.whatsapp.net",
    mediaState: "FAILED",
    mediaStorageKey: null,
    mediaMimeType: "application/pdf",
    mediaFileName: "file.pdf",
    interactiveData: null,
  };
  const conversation = {
    id: "conv",
    tenantId: "tenant",
    connectionId: "conn",
    externalChatId: "chat@s.whatsapp.net",
  };
  const connection = {
    id: "conn",
    serviceEnabled: true,
    providerType: "EVOLUTION",
    externalReference: "instance",
    ownerPhoneNormalized: "+551100000000",
    ownerExternalId: null,
  };
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: true, id: "msg" }]),
    $executeRaw: vi.fn(),
    conversation: { findFirst: vi.fn().mockResolvedValue(conversation), update: vi.fn() },
    message: { findFirst: vi.fn().mockResolvedValue(message), update: vi.fn(), create: vi.fn() },
    messagingConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  const record = {
    key: { id: "provider-id", remoteJid: "chat@s.whatsapp.net", fromMe: false },
    message: { documentMessage: { mimetype: "application/pdf" } },
  };
  const evolution = {
    findMessages: vi.fn().mockResolvedValue([record]),
    getBase64FromMediaMessage: vi.fn().mockResolvedValue({
      body: Buffer.from("%PDF-synthetic"),
      mimeType: "application/pdf",
      fileName: "file.pdf",
    }),
  };
  const stored = {
    objectKey: "new-object",
    mimeType: "application/pdf",
    fileName: "file.pdf",
    sizeBytes: 14,
    checksum: "checksum",
  };
  const storage = {
    readObject: vi.fn(),
    storeDownloaded: vi.fn().mockResolvedValue(stored),
    deleteObject: vi.fn(),
  };
  const current = {
    tenantId: "tenant",
    membershipId: "member",
    roleKey: "tenant_admin",
    permissions: ["conversations.read", "chat.conversations.view_all_active"],
  };
  const service = new MessageMediaRecoveryService(
    prisma as never,
    evolution as never,
    storage as never,
  );
  return {
    service,
    prisma,
    evolution,
    storage,
    current,
    message,
    conversation,
    connection,
    record,
    stored,
  };
}

describe("MessageMediaRecoveryService", () => {
  it("recovers only the same message media after scoped locks and exact provider lookup", async () => {
    const f = fixture();
    await expect(f.service.recover("conv", "msg", f.current as never)).resolves.toEqual({
      messageId: "msg",
      state: "ready",
      recovered: true,
    });
    expect(f.evolution.findMessages).toHaveBeenCalledWith({
      instanceName: "instance",
      remoteJid: "chat@s.whatsapp.net",
      messageId: "provider-id",
      page: 1,
      pageSize: 10,
    });
    expect(f.evolution.getBase64FromMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: f.record }),
    );
    expect(f.prisma.$executeRaw.mock.calls[0][1]).toBe(
      "inbound-message:tenant:551100000000:provider-id",
    );
    const queries = f.prisma.$queryRaw.mock.calls.map((call) => call[0].join("?"));
    expect(queries[0]).toContain('FROM "messaging_connections"');
    expect(queries[1]).toContain('FROM "conversations"');
    expect(queries[1]).toContain("FOR SHARE");
    expect(queries[2]).toContain('FROM "messages"');
    expect(queries[2]).toContain("FOR UPDATE");
    expect(f.prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.prisma.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(f.prisma.conversation.findFirst.mock.invocationCallOrder[1]).toBeGreaterThan(
      f.prisma.$queryRaw.mock.invocationCallOrder[2],
    );
    expect(f.prisma.conversation.findFirst.mock.invocationCallOrder[1]).toBeLessThan(
      f.evolution.findMessages.mock.invocationCallOrder[0],
    );
    expect(f.prisma.message.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant", id: "msg" } },
      data: {
        mediaStorageKey: "new-object",
        mediaMimeType: "application/pdf",
        mediaFileName: "file.pdf",
        mediaSize: 14,
        mediaChecksum: "checksum",
        mediaState: "READY",
      },
    });
    expect(f.prisma.message.create).not.toHaveBeenCalled();
    expect(f.prisma.conversation.update).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("checks tenant and visibility before reaching the provider", async () => {
    const f = fixture();
    f.prisma.conversation.findFirst.mockResolvedValue(null);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Conversa não encontrada",
    );
    expect(f.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: "tenant", id: "conv", archivedAt: null }),
    });
    expect(f.evolution.findMessages).not.toHaveBeenCalled();
  });

  it.each([
    { direction: "OUTBOUND" },
    { type: "IMAGE" },
    { interactiveData: { deletedForEveryone: true } },
    { connectionId: "other" },
  ])("rejects ineligible messages %j", async (patch) => {
    const f = fixture();
    Object.assign(f.message, patch);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow();
    expect(f.evolution.findMessages).not.toHaveBeenCalled();
    expect(f.storage.storeDownloaded).not.toHaveBeenCalled();
  });

  it("revalidates visibility after acquiring locks", async () => {
    const f = fixture();
    f.prisma.conversation.findFirst.mockResolvedValueOnce(f.conversation).mockResolvedValue(null);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Mensagem não encontrada",
    );
    expect(f.evolution.findMessages).not.toHaveBeenCalled();
  });

  it.each([{ serviceEnabled: false }, { providerType: "META_CLOUD" }, { externalReference: null }])(
    "rejects unavailable instance %j",
    async (patch) => {
      const f = fixture();
      Object.assign(f.connection, patch);
      await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow();
      expect(f.evolution.findMessages).not.toHaveBeenCalled();
    },
  );

  it("is idempotent when existing bytes are available", async () => {
    const f = fixture();
    Object.assign(f.message, { mediaState: "READY", mediaStorageKey: "old-object" });
    f.storage.readObject.mockResolvedValue(Buffer.from("existing"));
    await expect(f.service.recover("conv", "msg", f.current as never)).resolves.toEqual({
      messageId: "msg",
      state: "ready",
      recovered: false,
    });
    expect(f.evolution.findMessages).not.toHaveBeenCalled();
    expect(f.prisma.message.update).not.toHaveBeenCalled();
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("recovers ENOENT but never deletes the old key", async () => {
    const f = fixture();
    Object.assign(f.message, { mediaState: "READY", mediaStorageKey: "old-object" });
    f.storage.readObject.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(f.service.recover("conv", "msg", f.current as never)).resolves.toEqual(
      expect.objectContaining({ recovered: true }),
    );
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("does not mistake storage access errors for missing bytes", async () => {
    const f = fixture();
    Object.assign(f.message, { mediaStorageKey: "old-object" });
    f.storage.readObject.mockRejectedValue(
      Object.assign(new Error("secret path"), { code: "EACCES" }),
    );
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Não foi possível ler",
    );
    expect(f.evolution.findMessages).not.toHaveBeenCalled();
  });

  it.each([
    { id: "wrong" },
    { remoteJid: "other@s.whatsapp.net" },
    { fromMe: true },
    { fromMe: undefined },
  ])("fails closed on provider identity mismatch %j", async (patch) => {
    const f = fixture();
    Object.assign(f.record.key, patch);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Documento original não está disponível",
    );
    expect(f.evolution.getBase64FromMediaMessage).not.toHaveBeenCalled();
  });

  it("rejects ambiguous provider records", async () => {
    const f = fixture();
    f.evolution.findMessages.mockResolvedValue([f.record, f.record]);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Documento original não está disponível",
    );
  });

  it("hides provider errors without updating the message", async () => {
    const f = fixture();
    f.evolution.findMessages.mockRejectedValue(new Error("https://secret/token"));
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
      "Não foi possível recuperar o documento no provedor",
    );
    expect(f.prisma.message.update).not.toHaveBeenCalled();
  });

  it("cleans only the new unreferenced object after rollback", async () => {
    const f = fixture();
    f.prisma.message.update.mockRejectedValue(new Error("rollback"));
    f.prisma.message.findFirst
      .mockResolvedValueOnce(f.message)
      .mockResolvedValueOnce(f.message)
      .mockResolvedValueOnce(null);
    await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow("rollback");
    expect(f.storage.deleteObject).toHaveBeenCalledWith("new-object");
  });

  it.each(["referenced", "empty", "unavailable"])(
    "preserves bytes after an ambiguous commit regardless of fresh lookup: %s",
    async (lookup) => {
      const f = fixture();
      f.prisma.message.findFirst.mockResolvedValueOnce(f.message).mockResolvedValueOnce(f.message);
      if (lookup === "empty") f.prisma.message.findFirst.mockResolvedValue(null);
      if (lookup === "unavailable")
        f.prisma.message.findFirst.mockRejectedValue(new Error("lookup unavailable"));
      f.prisma.$transaction.mockImplementation(async (callback) => {
        await callback(f.prisma);
        throw new Error("commit result unknown");
      });
      await expect(f.service.recover("conv", "msg", f.current as never)).rejects.toThrow(
        "commit result unknown",
      );
      expect(f.prisma.message.findFirst).toHaveBeenCalledTimes(2);
      expect(f.storage.deleteObject).not.toHaveBeenCalled();
    },
  );
});
