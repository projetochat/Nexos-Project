import "reflect-metadata";
import { UnsupportedMediaTypeException } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  normalizeCampaignAttachment,
  campaignAttachmentMessageType,
  readCampaignAttachmentMetadata,
  readCampaignAttachment,
  writeCampaignAttachment,
} from "./campaign-attachment";
import { CampaignsService, CAMPAIGN_RECIPIENT_CLAIMED } from "./campaigns.service";
import { CreateCampaignDto } from "./dto/campaign.dto";

const attachment = {
  fileName: "test.pdf",
  mimeType: "application/pdf",
  size: 9,
  dataUrl: `data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`,
};
function fixture(enabled = true) {
  const db = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ payload: attachment, snapshot: { version: 1, attachment } }]),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    campaignRecipient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation" }), update: vi.fn() },
    message: {
      create: vi.fn().mockResolvedValue({ id: "message" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    outboxEvent: { create: vi.fn() },
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  const storage = {
    storeDownloaded: vi.fn().mockResolvedValue({
      objectKey: "tenants/tenant/messages/campaign-c/file.pdf",
      mimeType: "application/pdf",
      fileName: "test.pdf",
      sizeBytes: 9,
      checksum: "checksum",
    }),
    deleteObject: vi.fn(),
  };
  const service = new CampaignsService(
    db as never,
    { get: () => (enabled ? "true" : undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    storage as never,
  );
  const recipient = {
    id: "recipient",
    contactId: "contact",
    renderedMessage: "",
    contact: { name: "Contact" },
    campaign: {
      id: "campaign",
      version: 1,
      tenantId: "tenant",
      messageType: enabled ? "DOCUMENT" : "TEXT",
      messageText: enabled ? "" : "Text",
      createdByMembershipId: "member",
      connectionId: "connection",
    },
  };
  const run = () =>
    (
      service as unknown as { createCampaignMessage: (r: unknown, n: number) => Promise<string> }
    ).createCampaignMessage(recipient, 1);
  return { db, storage, service, recipient, run };
}
describe("campaign attachments", () => {
  it("validates real byte length and canonical base64, rejects URLs, unsupported video MIME and spoofed size", () => {
    expect(normalizeCampaignAttachment(attachment)).toEqual(attachment);
    for (const changed of [
      { size: 99 },
      { dataUrl: "https://external.invalid/file" },
      { mimeType: "video/unsupported", dataUrl: "data:video/unsupported;base64,JVBERi10ZXN0" },
      { dataUrl: attachment.dataUrl + "=" },
    ])
      expect(() => normalizeCampaignAttachment({ ...attachment, ...changed })).toThrow();
  });
  it("treats an uploaded audio file as AUDIO rather than a voice/PTT message", () => {
    const audio = {
      ...attachment,
      fileName: "audio.mp3",
      mimeType: "audio/mpeg",
      dataUrl: attachment.dataUrl.replace("application/pdf", "audio/mpeg"),
    };
    expect(normalizeCampaignAttachment(audio)).toEqual(audio);
    expect(campaignAttachmentMessageType(audio.mimeType)).toBe("AUDIO");
  });
  it("accepts a video file using the existing video policy and message type", () => {
    const video = {
      ...attachment,
      fileName: "video.mp4",
      mimeType: "video/mp4",
      dataUrl: attachment.dataUrl.replace("application/pdf", "video/mp4"),
    };
    expect(normalizeCampaignAttachment(video)).toEqual(video);
    expect(campaignAttachmentMessageType(video.mimeType)).toBe("VIDEO");
  });
  it("DTO rejects client-controlled storage keys rather than accepting references", async () => {
    const dto = plainToInstance(CreateCampaignDto, {
      name: "Test",
      messageText: "",
      connectionId: "12345678-1234-4234-8234-123456789abc",
      audience: { type: "ALL" },
      attachment: { ...attachment, storageKey: "tenant-foreign/object" },
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(
      0,
    );
  });
  it("parameterizes tenant/campaign scope for every attachment read/write", async () => {
    const f = fixture();
    await readCampaignAttachment(f.db as never, "tenant", "campaign");
    await writeCampaignAttachment(f.db as never, "tenant", "campaign", attachment);
    expect(f.db.$queryRaw.mock.calls[0][0].values).toEqual(["tenant", "campaign"]);
    expect(f.db.$executeRaw.mock.calls[0][0].values.slice(0, 2)).toEqual(["campaign", "tenant"]);
  });
  it("reads only metadata for list responses without transferring the base64 payload", async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([
      { fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size },
    ]);
    expect(await readCampaignAttachmentMetadata(f.db as never, "tenant", "campaign")).toEqual({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
    const sql = f.db.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(["tenant", "campaign"]);
    expect(sql.strings.join("")).not.toContain('SELECT "payload" FROM');
  });
  it("keeps attachment-only recipients eligible while rejecting empty text-only templates", async () => {
    const db = {
      contact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "contact",
            name: "Name",
            normalizedPhone: "5511987654321",
            active: true,
            messagingPreferences: [],
            tags: [],
            customer: null,
          },
        ]),
      },
    };
    const service = new CampaignsService(
      db as never,
      { get: () => undefined } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internal = service as unknown as {
      resolveAudience: (
        audience: unknown,
        text: string,
        tenant: string,
        allowEmpty?: boolean,
      ) => Promise<{ eligibleCount: number; skipped: unknown[] }>;
    };
    expect(
      (await internal.resolveAudience({ type: "ALL" }, "", "tenant", true)).eligibleCount,
    ).toBe(1);
    expect(
      (await internal.resolveAudience({ type: "ALL" }, "", "tenant", false)).eligibleCount,
    ).toBe(0);
  });
  it("default-off supports legacy text without touching the new table or media storage", async () => {
    const f = fixture(false);
    expect(f.service.capabilities().attachmentsEnabled).toBe(false);
    await f.run();
    expect(f.db.$queryRaw).not.toHaveBeenCalled();
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
    expect(f.storage.storeDownloaded).not.toHaveBeenCalled();
    expect(f.db.message.create.mock.calls[0][0].data.type).toBe("TEXT");
  });
  it("materializes media and atomically retains recipient claim, message and outbox", async () => {
    const f = fixture();
    await expect(f.run()).resolves.toBe("message");
    expect(f.storage.storeDownloaded.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant",
      conversationId: "campaign-campaign",
      body: Buffer.from("%PDF-test"),
    });
    expect(f.db.campaignRecipient.updateMany.mock.calls[0][0].where.lastErrorCode).toBe(
      CAMPAIGN_RECIPIENT_CLAIMED,
    );
    expect(f.db.message.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant",
      type: "DOCUMENT",
      mediaState: "READY",
      mediaStorageKey: "tenants/tenant/messages/campaign-c/file.pdf",
      clientMessageId: "campaign:recipient",
    });
    expect(f.db.outboxEvent.create).toHaveBeenCalledOnce();
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });
  it("does not create a message or outbox if storage fails", async () => {
    const f = fixture();
    f.storage.storeDownloaded.mockRejectedValue(new Error("storage unavailable"));
    await expect(f.run()).rejects.toMatchObject({
      code: "CAMPAIGN_MEDIA_STORAGE_FAILED_BEFORE_MESSAGE",
    });
    expect(f.db.message.create).not.toHaveBeenCalled();
    expect(f.db.outboxEvent.create).not.toHaveBeenCalled();
  });
  it("does not mark permanent media-policy failures as transient storage failures", async () => {
    const f = fixture();
    const error = new UnsupportedMediaTypeException("Invalid media signature");
    f.storage.storeDownloaded.mockRejectedValue(error);
    await expect(f.run()).rejects.toBe(error);
    expect(f.db.$transaction).not.toHaveBeenCalled();
    expect(f.db.outboxEvent.create).not.toHaveBeenCalled();
  });
  it("cleans its bytes only on proven callback rollback after an unreferenced check", async () => {
    const f = fixture();
    f.db.outboxEvent.create.mockRejectedValue(new Error("rollback"));
    await expect(f.run()).rejects.toThrow("rollback");
    expect(f.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(
      "tenants/tenant/messages/campaign-c/file.pdf",
    );
  });
  it("retains bytes on ambiguous commit even if a fresh lookup would be empty", async () => {
    const f = fixture();
    f.db.$transaction.mockImplementation(async (callback: (tx: typeof f.db) => unknown) => {
      await callback(f.db);
      throw new Error("commit outcome unknown");
    });
    await expect(f.run()).rejects.toThrow("commit outcome unknown");
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
    expect(f.db.message.findFirst).not.toHaveBeenCalled();
  });
  it("retains bytes when reference verification fails or another committed message references them", async () => {
    for (const reference of ["exists", "unknown"]) {
      const f = fixture();
      f.db.outboxEvent.create.mockRejectedValue(new Error("rollback"));
      if (reference === "exists") f.db.message.findFirst.mockResolvedValue({ id: "existing" });
      else f.db.message.findFirst.mockRejectedValue(new Error("database unavailable"));
      await expect(f.run()).rejects.toThrow();
      expect(f.storage.deleteObject).not.toHaveBeenCalled();
    }
  });
});

describe("scheduled attachment snapshot consistency", () => {
  function scheduledFixture(workerStarted = false) {
    const existing = {
      id: "campaign",
      tenantId: "tenant",
      status: "SCHEDULED",
      version: 1,
      messageType: "DOCUMENT",
      messageText: "Old",
      connectionId: "connection",
      audienceType: "ALL",
      audienceTagIds: [],
      audienceContactIds: [],
      audienceCustomerIds: [],
      timezone: "UTC",
      scheduledAt: new Date("2030-01-01Z"),
    };
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ payload: attachment }]),
      $executeRaw: vi.fn(),
      $transaction: vi.fn(),
      campaign: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn() },
      campaignRecipient: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      outboxEvent: { upsert: vi.fn() },
    };
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
    db.campaign.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (workerStarted) throw Object.assign(new Error("worker won"), { code: "P2025" });
      return { ...existing, ...data, version: 2 };
    });
    const entitlement = { assertWithinLimit: vi.fn() };
    const service = new CampaignsService(
      db as never,
      { get: () => "true" } as never,
      {} as never,
      {} as never,
      entitlement as never,
    );
    const internals = service as unknown as {
      resolveAudience: ReturnType<typeof vi.fn>;
      assertConnection: ReturnType<typeof vi.fn>;
      publishCampaign: ReturnType<typeof vi.fn>;
    };
    internals.resolveAudience = vi.fn().mockResolvedValue({
      recipients: [
        {
          contact: { id: "contact", name: "Contact", normalizedPhone: "5511987654321" },
          renderedMessage: "New",
        },
      ],
      skipped: [],
      eligibleCount: 1,
      totalCount: 1,
      invalidPhoneCount: 0,
      optedOutCount: 0,
      duplicateCount: 0,
      blockedCount: 0,
    });
    internals.assertConnection = vi.fn();
    internals.publishCampaign = vi.fn();
    return { db, service };
  }
  it("rebuilds scheduled recipients and freezes the same new template version in a single transaction", async () => {
    const f = scheduledFixture();
    await f.service.update("campaign", { messageText: "New", attachment }, {
      tenantId: "tenant",
      membershipId: "member",
    } as never);
    expect(f.db.$transaction).toHaveBeenCalledOnce();
    expect(f.db.campaign.update.mock.calls[0][0].where).toMatchObject({
      id: "campaign",
      version: 1,
      status: "SCHEDULED",
    });
    expect(f.db.campaign.update.mock.calls[1][0].where).toMatchObject({
      id: "campaign",
      version: 2,
      status: "SCHEDULED",
    });
    expect(f.db.campaignRecipient.createMany.mock.calls[0][0].data[0].renderedMessage).toBe("New");
    const frozen = f.db.$executeRaw.mock.calls.find(([sql]) =>
      sql.strings.join("").includes('"snapshot"'),
    )![0];
    expect(
      frozen.values.some(
        (value: unknown) =>
          typeof value === "string" &&
          value.includes('"version":2') &&
          value.includes('"attachment"'),
      ),
    ).toBe(true);
  });
  it("fails closed if a worker changed SCHEDULED before the edit acquired the campaign lock", async () => {
    const f = scheduledFixture(true);
    await expect(
      f.service.update("campaign", { messageText: "New", attachment }, {
        tenantId: "tenant",
        membershipId: "member",
      } as never),
    ).rejects.toThrow("A campanha foi alterada durante a edição");
    expect(f.db.campaignRecipient.deleteMany).not.toHaveBeenCalled();
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
  });
  it("refuses to reconstruct any snapshot which contains an already claimed or sent recipient", async () => {
    const f = scheduledFixture();
    f.db.campaignRecipient.count.mockResolvedValue(1);
    await expect(
      f.service.update("campaign", { messageText: "New", attachment }, {
        tenantId: "tenant",
        membershipId: "member",
      } as never),
    ).rejects.toThrow("A campanha já possui destinatários");
    expect(f.db.campaignRecipient.deleteMany).not.toHaveBeenCalled();
  });
});
