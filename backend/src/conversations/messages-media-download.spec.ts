import { describe, expect, it, vi } from "vitest";
import { MessagesService } from "./messages.service";

const current = { tenantId: "tenant-a" } as never;
function setup(error?: Error) {
  const db = {
    message: {
      findFirst: vi.fn().mockResolvedValue({
        mediaStorageKey: "private-key",
        mediaMimeType: "application/pdf",
        mediaFileName: "fixture.pdf",
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const bytes = Buffer.from("synthetic-document");
  const storage = {
    readObject: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(bytes),
  };
  const realtime = { publishConversationUpdated: vi.fn() };
  const service = new MessagesService(
    db as never,
    {} as never,
    storage as never,
    realtime as never,
  );
  vi.spyOn(service, "findVisibleConversation").mockResolvedValue({ protocol: "000001" } as never);
  return { db, storage, realtime, service, bytes };
}

describe("message media download", () => {
  it.each([null, undefined, "", "   "])(
    "blocks media before first start for protocol %j",
    async (protocol) => {
      const f = setup();
      vi.mocked(f.service.findVisibleConversation).mockResolvedValue({ protocol } as never);
      await expect(
        f.service.downloadMedia("conversation", "message", current),
      ).rejects.toMatchObject({
        status: 403,
        response: {
          code: "CONVERSATION_NOT_STARTED",
          message: "Inicie o atendimento para acessar os arquivos.",
        },
      });
      expect(f.db.message.findFirst).not.toHaveBeenCalled();
      expect(f.storage.readObject).not.toHaveBeenCalled();
      expect(f.db.message.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(["ABERTA", "EM_ANDAMENTO", "AGUARDANDO", "FECHADA"])(
    "keeps started %s conversation media accessible",
    async (status) => {
      const f = setup();
      vi.mocked(f.service.findVisibleConversation).mockResolvedValue({
        protocol: " 000001 ",
        status,
      } as never);
      await expect(f.service.downloadMedia("conversation", "message", current)).resolves.toEqual(
        expect.objectContaining({ body: f.bytes }),
      );
    },
  );

  it("returns existing bytes without changing media state", async () => {
    const { service, db, bytes } = setup();
    const result = await service.downloadMedia("conversation", "message", current);
    expect(result.body).toEqual(bytes);
    expect(db.message.updateMany).not.toHaveBeenCalled();
  });

  it("marks only the same missing object as failed and returns a safe 404", async () => {
    const { service, db, realtime } = setup(
      Object.assign(new Error("private path"), { code: "ENOENT" }),
    );
    await expect(service.downloadMedia("conversation", "message", current)).rejects.toMatchObject({
      response: { code: "MEDIA_FILE_MISSING", message: "Arquivo não armazenado." },
    });
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: "message",
        tenantId: "tenant-a",
        conversationId: "conversation",
        mediaStorageKey: "private-key",
      },
      data: { mediaState: "FAILED" },
    });
    expect(realtime.publishConversationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        conversationId: "conversation",
        reason: "message.media_missing",
      }),
    );
  });

  it("does not reinterpret permission or IO failures as a missing file", async () => {
    const error = Object.assign(new Error("permission failure"), { code: "EACCES" });
    const { service, db } = setup(error);
    await expect(service.downloadMedia("conversation", "message", current)).rejects.toBe(error);
    expect(db.message.updateMany).not.toHaveBeenCalled();
  });

  it("does not inspect storage when conversation access is denied", async () => {
    const { service, storage, db } = setup();
    vi.mocked(service.findVisibleConversation).mockRejectedValue(new Error("not visible"));
    await expect(service.downloadMedia("conversation", "message", current)).rejects.toThrow(
      "not visible",
    );
    expect(db.message.findFirst).not.toHaveBeenCalled();
    expect(storage.readObject).not.toHaveBeenCalled();
  });
});
