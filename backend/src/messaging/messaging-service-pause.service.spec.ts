import { describe, expect, it, vi } from "vitest";
import { MessageType, MessageMediaState, OutboxEventStatus } from "../generated/prisma";
import {
  MessagingServicePauseService,
  restoreDeferredEvent,
  serializeDeferredEvent,
} from "./messaging-service-pause.service";
import type { EvolutionWebhookTranslation } from "./evolution/evolution-webhook.translator";

const connection = { id: "test-connection", tenantId: "test-tenant" };
const inboundEvent = () => ({
  kind: "inbound" as const,
  event: {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    externalMessageId: "message-a",
    conversationType: "DIRECT" as const,
    fromMe: false,
    externalChatId: "5511999990000@s.whatsapp.net",
    sender: { phone: "5511999990000", normalizedPhone: "+5511999990000" },
    type: MessageType.DOCUMENT,
    content: "[contato] Teste",
    occurredAt: new Date("2026-09-22T13:00:00Z"),
    media: {
      inlineBody: Buffer.from("BEGIN:VCARD\r\nFN:Teste\r\nEND:VCARD"),
      mimetype: "text/vcard",
    },
  },
});
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true, serviceEnabled: true }]),
    messagingConnection: {
      findFirst: vi.fn().mockResolvedValue({ ...connection, serviceEnabled: true }),
    },
    outboxEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation(async (input) => ({
        id: "retained",
        payload: input.create.payload,
        status: OutboxEventStatus.PENDING,
      })),
      update: vi.fn(),
    },
  };
  const prisma = {
    messagingConnection: {
      findMany: vi.fn().mockResolvedValue([connection]),
      findFirst: vi.fn().mockResolvedValue({ externalReference: "fixture-instance" }),
    },
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const inbound = {
    process: vi.fn().mockResolvedValue({
      message: { mediaState: MessageMediaState.READY, mediaStorageKey: "fixture-media" },
    }),
    processEdit: vi.fn(),
    processDeletion: vi.fn(),
  };
  const reactions = { process: vi.fn() };
  const status = { process: vi.fn() };
  const evolution = {
    getBase64FromMediaMessage: vi.fn().mockResolvedValue({
      body: Buffer.from("fixture bytes"),
      mimeType: "image/png",
      fileName: "fixture.png",
    }),
  };
  const service = new MessagingServicePauseService(
    prisma as never,
    inbound as never,
    reactions as never,
    status as never,
    evolution as never,
  );
  return { tx, prisma, inbound, reactions, status, evolution, service };
}

describe("service pause retention and replay (isolated mocks)", () => {
  it("round-trips timestamps and inline contact bytes without changing the stored JSON", () => {
    const original = inboundEvent();
    const stored = json(original);
    const snapshot = json(stored);
    const restored = restoreDeferredEvent(stored);
    expect(restored.event.occurredAt).toEqual(original.event.occurredAt);
    if (restored.kind !== "inbound") throw new Error("Expected inbound");
    expect(Buffer.isBuffer(restored.event.media?.inlineBody)).toBe(true);
    expect(restored.event.media?.inlineBody).toEqual(original.event.media.inlineBody);
    expect(stored).toEqual(snapshot);
  });

  it("rejects invalid replay dates", () => {
    const event = json(inboundEvent());
    event.event.occurredAt = "not-a-date";
    expect(() => restoreDeferredEvent(event)).toThrow("Invalid deferred event date");
  });

  it("persists repeated identical delivery under the same scoped idempotency key", async () => {
    const { tx, service } = setup();
    tx.messagingConnection.findFirst.mockResolvedValue({ ...connection, serviceEnabled: false });
    const event = inboundEvent();
    expect(await service.deferIfPaused(connection, event)).toBe(true);
    expect(await service.deferIfPaused(connection, event)).toBe(true);
    expect(tx.outboxEvent.upsert.mock.calls[0][0]).toEqual(tx.outboxEvent.upsert.mock.calls[1][0]);
    expect(tx.outboxEvent.upsert.mock.calls[0][0].where.tenantId_type_aggregateId.tenantId).toBe(
      connection.tenantId,
    );
  });

  it("keeps new events behind a retained backlog after reactivation", async () => {
    const { tx, service } = setup();
    tx.outboxEvent.findFirst.mockResolvedValue({ id: "pending" } as never);
    expect(await service.deferIfPaused(connection, inboundEvent())).toBe(true);
    expect(tx.outboxEvent.upsert).toHaveBeenCalledOnce();
  });

  it("does not retain connection control events or normal traffic with no backlog", async () => {
    const { tx, service } = setup();
    expect(
      await service.deferIfPaused(connection, { kind: "ignored", reason: "unsupported" }),
    ).toBe(false);
    expect(await service.deferIfPaused(connection, inboundEvent())).toBe(false);
    expect(tx.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it("replays original then deletion in database arrival order and suppresses automatic replies", async () => {
    const { tx, service, inbound } = setup();
    const deletion: EvolutionWebhookTranslation = {
      kind: "delete",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        providerMessageId: "message-a",
        occurredAt: new Date("2026-09-22T13:01:00Z"),
      },
    };
    tx.outboxEvent.findMany.mockResolvedValue([
      { id: "1", payload: json(inboundEvent()) },
      { id: "2", payload: json(deletion) },
    ] as never);
    await service.drain();
    expect(tx.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ attempts: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(inbound.process).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: new Date("2026-09-22T13:00:00Z") }),
      { suppressAutomaticReply: true, requireMediaReady: true },
    );
    expect(inbound.process.mock.invocationCallOrder[0]).toBeLessThan(
      inbound.processDeletion.mock.invocationCallOrder[0],
    );
    expect(tx.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "2" },
        data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED, payload: {} }),
      }),
    );
  });

  it("does not replay when another process holds the connection lock", async () => {
    const { tx, service, inbound } = setup();
    tx.$queryRaw.mockResolvedValue([{ acquired: false }]);
    await service.drain();
    expect(tx.outboxEvent.findMany).not.toHaveBeenCalled();
    expect(inbound.process).not.toHaveBeenCalled();
  });

  it("stops before consuming a row when the instance was paused again", async () => {
    const { tx, service, inbound } = setup();
    tx.outboxEvent.findMany.mockResolvedValue([
      { id: "1", payload: json(inboundEvent()) },
    ] as never);
    tx.messagingConnection.findFirst.mockResolvedValue(null as never);
    await service.drain();
    expect(inbound.process).not.toHaveBeenCalled();
    expect(tx.outboxEvent.update).not.toHaveBeenCalled();
  });

  it("continues other instances after an invalid retained event", async () => {
    const { tx, prisma, service, inbound } = setup();
    const other = { tenantId: "other-tenant", id: "other-connection" };
    prisma.messagingConnection.findMany.mockResolvedValue([connection, other]);
    const event = inboundEvent();
    event.event.tenantId = other.tenantId;
    event.event.connectionId = other.id;
    tx.outboxEvent.findMany
      .mockResolvedValueOnce([{ id: "bad", payload: {} }] as never)
      .mockResolvedValueOnce([{ id: "good", payload: json(event) }] as never);
    await service.drain();
    expect(inbound.process).toHaveBeenCalledOnce();
    expect(tx.outboxEvent.update).toHaveBeenCalledOnce();
    expect(tx.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "good" } }),
    );
  });

  it("refuses events whose tenant or connection differs from the retained scope", async () => {
    const { tx, service, inbound } = setup();
    const event = inboundEvent();
    event.event.tenantId = "other-tenant";
    tx.outboxEvent.findMany.mockResolvedValue([{ id: "bad", payload: json(event) }] as never);
    await service.drain();
    expect(inbound.process).not.toHaveBeenCalled();
    expect(tx.outboxEvent.update).not.toHaveBeenCalled();
  });
});

describe("retained target and media recovery", () => {
  it("retains an early deletion, imports the original, then applies the deletion on retry", async () => {
    const { tx, service, inbound } = setup();
    const original = inboundEvent();
    const deletion = {
      kind: "delete",
      event: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        providerMessageId: "message-a",
        occurredAt: new Date(),
      },
    };
    inbound.processDeletion
      .mockResolvedValueOnce({ updated: false, reason: "MESSAGE_NOT_FOUND" })
      .mockResolvedValueOnce({ updated: true });
    tx.outboxEvent.findMany
      .mockResolvedValueOnce([
        { id: "delete", payload: json(deletion) },
        { id: "original", payload: json(original) },
      ] as never)
      .mockResolvedValueOnce([{ id: "delete", payload: json(deletion) }] as never);
    await service.drain();
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "delete" },
      data: { lastError: "TARGET_NOT_FOUND", attempts: { increment: 1 } },
    });
    expect(tx.outboxEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delete" },
        data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED }),
      }),
    );
    expect(inbound.process).toHaveBeenCalledOnce();
    await service.drain();
    expect(tx.outboxEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "delete" },
        data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED, payload: {} }),
      }),
    );
  });

  it.each([
    ["edit", "MESSAGE_NOT_FOUND"],
    ["reaction", "message_not_found"],
    ["status", "not_found"],
  ])("keeps a missing target for %s", async (kind, reason) => {
    const { tx, service, inbound, reactions, status } = setup();
    const processor =
      kind === "edit"
        ? inbound.processEdit
        : kind === "reaction"
          ? reactions.process
          : status.process;
    processor.mockResolvedValue({ updated: false, reason });
    tx.outboxEvent.findMany.mockResolvedValue([
      {
        id: "missing",
        payload: json({
          kind,
          event: {
            tenantId: connection.tenantId,
            connectionId: connection.id,
            occurredAt: new Date(),
            providerMessageId: "missing",
          },
        }),
      },
    ] as never);
    await service.drain();
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "missing" },
      data: { lastError: "TARGET_NOT_FOUND", attempts: { increment: 1 } },
    });
  });

  it("captures remote media while paused outside the retention transaction as compact base64", async () => {
    const { tx, prisma, service, evolution } = setup();
    tx.messagingConnection.findFirst.mockResolvedValue({ ...connection, serviceEnabled: false });
    const event = inboundEvent();
    event.event.media = {
      rawMessage: { key: { id: "message-a" } },
      mimetype: "image/png",
    } as never;
    let transactionActive = false;
    prisma.$transaction.mockImplementation(async (callback) => {
      transactionActive = true;
      try {
        return await callback(tx);
      } finally {
        transactionActive = false;
      }
    });
    evolution.getBase64FromMediaMessage.mockImplementation(async () => {
      expect(transactionActive).toBe(false);
      return { body: Buffer.from("fixture bytes"), mimeType: "image/png", fileName: "fixture.png" };
    });
    expect(await service.deferIfPaused(connection, event)).toBe(true);
    const update = prisma.outboxEvent.updateMany.mock.calls[0][0];
    expect(update.data.payload.event.media.inlineBody).toEqual({
      encoding: "base64",
      data: Buffer.from("fixture bytes").toString("base64"),
    });
    expect(update.where.status).toBe(OutboxEventStatus.PENDING);
  });

  it("keeps a failed capture envelope and retries even while the connection remains paused", async () => {
    const { tx, prisma, service, evolution, inbound } = setup();
    tx.messagingConnection.findFirst.mockResolvedValue({ ...connection, serviceEnabled: false });
    const event = inboundEvent();
    event.event.media = {
      rawMessage: { key: { id: "message-a" } },
      mimetype: "image/png",
    } as never;
    evolution.getBase64FromMediaMessage
      .mockRejectedValueOnce(new Error("expired reference"))
      .mockResolvedValueOnce({
        body: Buffer.from("restored"),
        mimeType: "image/png",
        fileName: "fixture.png",
      });
    expect(await service.deferIfPaused(connection, event)).toBe(true);
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { lastError: "MEDIA_CAPTURE_PENDING", attempts: { increment: 1 } },
      }),
    );
    prisma.messagingConnection.findMany.mockResolvedValue([
      { ...connection, serviceEnabled: false },
    ] as never);
    prisma.outboxEvent.findMany.mockResolvedValue([
      { id: "retained", payload: json(event) },
    ] as never);
    await service.drain();
    expect(inbound.process).not.toHaveBeenCalled();
    expect(evolution.getBase64FromMediaMessage).toHaveBeenCalledTimes(2);
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payload: expect.any(Object), lastError: null }),
      }),
    );
  });

  it("retains payload when inbound returns failed media instead of declaring replay complete", async () => {
    const { tx, inbound, service } = setup();
    tx.outboxEvent.findMany.mockResolvedValue([
      { id: "media", payload: json(inboundEvent()) },
    ] as never);
    inbound.process.mockResolvedValue({
      message: { mediaState: MessageMediaState.FAILED, mediaStorageKey: null },
    } as never);
    await service.drain();
    expect(tx.outboxEvent.update).toHaveBeenLastCalledWith({
      where: { id: "media" },
      data: { lastError: "MEDIA_INGESTION_PENDING", attempts: { increment: 1 } },
    });
  });

  it("round trips compact bytes and accepts legacy buffer payloads", () => {
    const event = inboundEvent();
    const restored = restoreDeferredEvent(serializeDeferredEvent(event) as never);
    if (restored.kind !== "inbound") throw Error("inbound expected");
    expect(restored.event.media?.inlineBody).toEqual(event.event.media.inlineBody);
    expect(restoreDeferredEvent(json(event))).toEqual(restored);
  });
});

describe("paused capture pagination and readiness", () => {
  it("advances capture beyond the first fifty retained events while paused", async () => {
    const { prisma, service, inbound } = setup();
    prisma.messagingConnection.findMany.mockResolvedValue([
      { ...connection, serviceEnabled: false },
    ] as never);
    prisma.outboxEvent.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, index) => ({
          id: String(index),
          payload: json(inboundEvent()),
        })) as never,
      )
      .mockResolvedValueOnce([]);
    await service.drain();
    await service.drain();
    expect(prisma.outboxEvent.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { id: "49" }, skip: 1 }),
    );
    expect(inbound.process).not.toHaveBeenCalled();
  });

  it("does not ingest an external media envelope until capture is available", async () => {
    const { tx, service, inbound } = setup();
    const event = inboundEvent();
    event.event.media = {
      rawMessage: { key: { id: "message-a" } },
      mimetype: "image/png",
    } as never;
    tx.outboxEvent.findMany.mockResolvedValue([{ id: "waiting", payload: json(event) }] as never);
    await service.drain();
    expect(inbound.process).not.toHaveBeenCalled();
    expect(tx.outboxEvent.update).toHaveBeenLastCalledWith({
      where: { id: "waiting" },
      data: { lastError: "MEDIA_CAPTURE_PENDING", attempts: { increment: 1 } },
    });
  });
});

it("keeps failed ingestion and allows later rows to continue", async () => {
  const { tx, inbound, service } = setup();
  tx.outboxEvent.findMany.mockResolvedValue([
    { id: "failed", payload: json(inboundEvent()) },
    { id: "ready", payload: json(inboundEvent()) },
  ] as never);
  inbound.process.mockRejectedValueOnce(new Error("storage unavailable"));
  await service.drain();
  expect(tx.outboxEvent.update).toHaveBeenCalledWith({
    where: { id: "failed" },
    data: { lastError: "INGESTION_PENDING", attempts: { increment: 1 } },
  });
  expect(tx.outboxEvent.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: { id: "ready" },
      data: expect.objectContaining({ status: OutboxEventStatus.PROCESSED }),
    }),
  );
});

it("does not apply a newer edit ahead of an older pending edit for the same target", async () => {
  const { tx, inbound, service } = setup();
  const newer = {
    kind: "edit",
    event: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      occurredAt: new Date(),
      providerMessageId: "message-a",
      content: "newer",
    },
  };
  tx.outboxEvent.findMany.mockResolvedValue([
    { id: "newer", createdAt: new Date("2026-09-22T13:01:00Z"), payload: json(newer) },
  ] as never);
  tx.outboxEvent.findFirst.mockResolvedValue({ id: "older" } as never);
  await service.drain();
  expect(inbound.processEdit).not.toHaveBeenCalled();
  expect(tx.outboxEvent.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        payload: { path: ["event", "providerMessageId"], equals: "message-a" },
      }),
    }),
  );
  expect(tx.outboxEvent.update).toHaveBeenLastCalledWith({
    where: { id: "newer" },
    data: { lastError: "TARGET_PREDECESSOR_PENDING", attempts: { increment: 1 } },
  });
});

it("acquires a shared service-state lock before replay mutations and rejects a concurrent pause", async () => {
  const { tx, service, inbound } = setup();
  tx.$queryRaw
    .mockResolvedValueOnce([{ acquired: true, serviceEnabled: true }])
    .mockResolvedValueOnce([{ acquired: true, serviceEnabled: false }]);
  tx.outboxEvent.findMany.mockResolvedValue([
    {
      id: "edit",
      payload: json({
        kind: "edit",
        event: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          providerMessageId: "message-a",
          occurredAt: new Date(),
          content: "edited",
        },
      }),
    },
  ] as never);
  await service.drain();
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  expect(tx.$queryRaw.mock.calls[1][0].join("")).toContain("FOR SHARE");
  expect(inbound.processEdit).not.toHaveBeenCalled();
  expect(tx.outboxEvent.update).not.toHaveBeenCalled();
});

it("requests latest-preview protection for replayed edits", async () => {
  const { tx, service, inbound } = setup();
  const event = {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    providerMessageId: "message-a",
    occurredAt: new Date(),
    content: "edited",
  };
  tx.outboxEvent.findMany.mockResolvedValue([
    { id: "edit", payload: json({ kind: "edit", event }) },
  ] as never);
  await service.drain();
  expect(inbound.processEdit).toHaveBeenCalledWith(event, { preserveLatestPreview: true });
});

it("uses the configured backend media policy rather than a fixed ten MB capture cap", async () => {
  const { tx, prisma, service, evolution } = setup();
  tx.messagingConnection.findFirst.mockResolvedValue({ ...connection, serviceEnabled: false });
  const event: Extract<EvolutionWebhookTranslation, { kind: "inbound" }> = inboundEvent();
  event.event.type = MessageType.VIDEO;
  event.event.media = { rawMessage: { key: { id: "video" } }, mimetype: "video/mp4" } as never;
  const body = Buffer.alloc(11 * 1024 * 1024, 1);
  evolution.getBase64FromMediaMessage.mockResolvedValue({
    body,
    mimeType: "video/mp4",
    fileName: "fixture.mp4",
  });
  await service.deferIfPaused(connection, event);
  expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ payload: expect.any(Object), lastError: null }),
    }),
  );
  const payload = prisma.outboxEvent.updateMany.mock.calls[0][0].data.payload;
  expect(Buffer.from(payload.event.media.inlineBody.data, "base64").length).toBe(body.length);
});
