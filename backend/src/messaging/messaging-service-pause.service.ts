import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { MessageMediaState, OutboxEventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import type { EvolutionWebhookTranslation } from "./evolution/evolution-webhook.translator";
import { MessagingInboundService } from "./messaging-inbound.service";
import { MessagingReactionService } from "./messaging-reaction.service";
import { MessagingStatusService } from "./messaging-status.service";

import { lockMessagingServiceState } from "./service-availability";
import { maxSizeBytes } from "./media/messaging-media-storage.service";
import { EvolutionClient } from "./evolution/evolution.client";

export const DEFERRED_MESSAGING_EVENT = "messaging.service.deferred";
type DeferredTranslation = Exclude<EvolutionWebhookTranslation, { kind: "connection" | "ignored" }>;

@Injectable()
export class MessagingServicePauseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingServicePauseService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly captureCursors = new Map<string, string>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingInboundService) private readonly inbound: MessagingInboundService,
    @Inject(MessagingReactionService) private readonly reactions: MessagingReactionService,
    @Inject(MessagingStatusService) private readonly status: MessagingStatusService,
    @Optional() @Inject(EvolutionClient) private readonly evolution?: EvolutionClient,
  ) {}

  onModuleInit() {
    if (!this.replayWorkerEnabled()) {
      this.logger.warn({
        event: "messaging.service.replay_disabled",
        reason: "TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED=false",
      });
      return;
    }
    this.timer = setInterval(() => this.scheduleDrain(), 5000);
    this.timer.unref();
    this.scheduleDrain();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  private scheduleDrain() {
    if (!this.replayWorkerEnabled() || this.running) return;
    this.running = this.drain()
      .catch(() => {
        this.logger.warn("Falha ao importar mensagens retidas; nova tentativa no próximo ciclo.");
      })
      .finally(() => {
        this.running = undefined;
      });
  }

  async deferIfPaused(
    connection: { id: string; tenantId: string },
    translated: EvolutionWebhookTranslation,
    force = false,
  ) {
    if (translated.kind === "connection" || translated.kind === "ignored") return false;
    const retained = await this.prisma.$transaction(async (tx) => {
      const current = await tx.messagingConnection.findFirst({
        where: { id: connection.id, tenantId: connection.tenantId },
        select: { serviceEnabled: true },
      });
      if (!current) return false;
      const pending = current.serviceEnabled
        ? await tx.outboxEvent.findFirst({
            where: this.pendingWhere(connection),
            select: { id: true },
          })
        : true;
      if (!force && current.serviceEnabled && !pending) return false;
      const serialized = JSON.stringify(translated);
      const aggregateId = `${connection.id}:${createHash("sha256").update(serialized).digest("hex")}`;
      const row = await tx.outboxEvent.upsert({
        where: {
          tenantId_type_aggregateId: {
            tenantId: connection.tenantId,
            type: DEFERRED_MESSAGING_EVENT,
            aggregateId,
          },
        },
        create: {
          tenantId: connection.tenantId,
          type: DEFERRED_MESSAGING_EVENT,
          aggregateId,
          payload: serializeDeferredEvent(translated),
        },
        update: {},
        select: { id: true, payload: true, status: true },
      });
      return row;
    });
    if (!retained) return false;
    // Acknowledge only after durable retention. Download outside the transaction.
    if (retained.status === OutboxEventStatus.PENDING)
      await this.captureRetainedMedia(connection, retained);
    return true;
  }

  async drain() {
    if (!this.replayWorkerEnabled()) return;
    const connections = await this.prisma.messagingConnection.findMany({
      where: { archivedAt: null },
      select: { id: true, tenantId: true, serviceEnabled: true },
    });
    for (const connection of connections) {
      try {
        // Protect media while paused, before provider references expire.
        const cursor = this.captureCursors.get(connection.id);
        const retained = await this.prisma.outboxEvent.findMany({
          where: this.pendingWhere(connection),
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (retained.length === 1)
          this.captureCursors.set(connection.id, retained[retained.length - 1].id);
        else this.captureCursors.delete(connection.id);
        for (const row of retained) await this.captureRetainedMedia(connection, row);
        if (connection.serviceEnabled === false) continue;
        // A database lock also serializes replay across multiple backend processes.
        await this.prisma.$transaction(
          async (tx) => {
            const locks = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${`service-replay:${connection.tenantId}:${connection.id}`}, 0)) AS acquired`;
            if (!locks[0]?.acquired) return;
            await lockMessagingServiceState(tx, connection.tenantId, connection.id);
            const events = await tx.outboxEvent.findMany({
              where: this.pendingWhere(connection),
              orderBy: [{ attempts: "asc" }, { createdAt: "asc" }, { id: "asc" }],
              take: 1,
            });
            for (const row of events) {
              const current = await tx.messagingConnection.findFirst({
                where: {
                  id: connection.id,
                  tenantId: connection.tenantId,
                  serviceEnabled: true,
                  archivedAt: null,
                },
                select: { id: true },
              });
              if (!current) break;
              const translated = restoreDeferredEvent(row.payload);
              assertDeferredScope(translated, connection);
              if (
                translated.kind === "inbound" &&
                translated.event.media &&
                !translated.event.media.inlineBody
              ) {
                await this.retainForRetry(tx, row.id, "MEDIA_CAPTURE_PENDING");
                continue;
              }
              if (translated.kind !== "inbound") {
                const predecessor = await tx.outboxEvent.findFirst({
                  where: {
                    ...this.pendingWhere(connection),
                    id: { not: row.id },
                    payload: {
                      path: ["event", "providerMessageId"],
                      equals: translated.event.providerMessageId,
                    },
                    OR: [
                      { createdAt: { lt: row.createdAt } },
                      { createdAt: row.createdAt, id: { lt: row.id } },
                    ],
                  },
                  select: { id: true },
                });
                if (predecessor) {
                  await this.retainForRetry(tx, row.id, "TARGET_PREDECESSOR_PENDING");
                  continue;
                }
              }
              let result: unknown;
              if (translated.kind === "inbound") {
                try {
                  result = await this.inbound.process(translated.event, {
                    suppressAutomaticReply: true,
                    requireMediaReady: true,
                  });
                } catch {
                  await this.retainForRetry(tx, row.id, "INGESTION_PENDING");
                  continue;
                }
                const message = (
                  result as { message?: { mediaState?: string; mediaStorageKey?: string | null } }
                )?.message;
                if (
                  translated.event.media &&
                  (message?.mediaState !== MessageMediaState.READY || !message.mediaStorageKey)
                ) {
                  await this.retainForRetry(tx, row.id, "MEDIA_INGESTION_PENDING");
                  continue;
                }
              } else if (translated.kind === "edit")
                result = await this.inbound.processEdit(translated.event, {
                  preserveLatestPreview: true,
                });
              else if (translated.kind === "delete")
                result = await this.inbound.processDeletion(translated.event);
              else if (translated.kind === "reaction")
                result = await this.reactions.process(translated.event);
              else result = await this.status.process(translated.event);
              const reason = (result as { reason?: string } | undefined)?.reason?.toLowerCase();
              if (reason === "message_not_found" || reason === "not_found") {
                // The original message can arrive later. Keep this operation and
                // allow the next rows to introduce its target before the retry.
                await this.retainForRetry(tx, row.id, "TARGET_NOT_FOUND");
                continue;
              }
              await tx.outboxEvent.update({
                where: { id: row.id },
                data: {
                  status: OutboxEventStatus.PROCESSED,
                  processedAt: new Date(),
                  payload: {},
                  lastError: null,
                },
              });
            }
          },
          { timeout: 120000 },
        );
      } catch {
        this.logger.warn({
          event: "messaging.service.replay_failed",
          connectionId: connection.id,
          tenantId: connection.tenantId,
          message: "Mensagens retidas aguardam nova tentativa; outras instâncias continuam.",
        });
      }
    }
  }

  private async retainForRetry(tx: Prisma.TransactionClient, id: string, reason: string) {
    await tx.outboxEvent.update({
      where: { id },
      data: { lastError: reason, attempts: { increment: 1 } },
    });
  }

  private async captureRetainedMedia(
    connection: { id: string; tenantId: string },
    row: { id: string; payload: Prisma.JsonValue },
  ) {
    try {
      const translated = restoreDeferredEvent(row.payload);
      assertDeferredScope(translated, connection);
      if (
        translated.kind !== "inbound" ||
        !translated.event.media ||
        translated.event.media.inlineBody
      )
        return;
      const media = translated.event.media;
      const limit = maxSizeBytes(translated.event.type);
      let body: Buffer;
      if (media.rawMessage && this.evolution) {
        const current = await this.prisma.messagingConnection.findFirst({
          where: { id: connection.id, tenantId: connection.tenantId, archivedAt: null },
          select: { externalReference: true },
        });
        if (!current?.externalReference) throw new Error("Media connection unavailable");
        const downloaded = await this.evolution.getBase64FromMediaMessage({
          instanceName: current.externalReference,
          message: media.rawMessage,
        });
        body = downloaded.body;
        media.mimetype ??= downloaded.mimeType;
        media.fileName ??= downloaded.fileName;
      } else if (media.url?.startsWith("http")) {
        const response = await fetch(media.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Media capture unavailable");
        if (Number(response.headers.get("content-length")) > limit)
          throw new Error("Media capture too large");
        if (!response.body) throw new Error("Empty media response");
        const reader = response.body.getReader();
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) throw new Error("Media capture too large");
            chunks.push(Buffer.from(chunk.value));
          }
          body = Buffer.concat(chunks);
        } finally {
          await reader.cancel();
        }
      } else throw new Error("Media capture source unavailable");
      if (!body.length || body.length > limit) throw new Error("Invalid media capture size");
      media.inlineBody = body;
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: row.id,
          tenantId: connection.tenantId,
          type: DEFERRED_MESSAGING_EVENT,
          status: OutboxEventStatus.PENDING,
        },
        data: { payload: serializeDeferredEvent(translated), lastError: null },
      });
    } catch {
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: row.id,
          tenantId: connection.tenantId,
          type: DEFERRED_MESSAGING_EVENT,
          status: OutboxEventStatus.PENDING,
        },
        data: { lastError: "MEDIA_CAPTURE_PENDING", attempts: { increment: 1 } },
      });
    }
  }

  private pendingWhere(connection: { id: string; tenantId: string }): Prisma.OutboxEventWhereInput {
    return {
      tenantId: connection.tenantId,
      type: DEFERRED_MESSAGING_EVENT,
      aggregateId: { startsWith: `${connection.id}:` },
      status: OutboxEventStatus.PENDING,
    };
  }

  private replayWorkerEnabled() {
    return process.env.TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED !== "false";
  }
}

export function restoreDeferredEvent(payload: Prisma.JsonValue): DeferredTranslation {
  const parsed = JSON.parse(JSON.stringify(payload)) as DeferredTranslation;
  if (
    !["inbound", "edit", "delete", "reaction", "status"].includes(parsed?.kind) ||
    !parsed.event
  ) {
    throw new Error("Invalid deferred message event.");
  }
  parsed.event.occurredAt = new Date(parsed.event.occurredAt);
  if (parsed.kind === "inbound" && parsed.event.media?.inlineBody) {
    const serialized = parsed.event.media.inlineBody as unknown as {
      type?: string;
      encoding?: string;
      data: number[] | string;
    };
    if (serialized.encoding === "base64" && typeof serialized.data === "string") {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(serialized.data))
        throw new Error("Invalid deferred inline media.");
      parsed.event.media.inlineBody = Buffer.from(serialized.data, "base64");
    } else if (serialized.type === "Buffer" && Array.isArray(serialized.data)) {
      parsed.event.media.inlineBody = Buffer.from(serialized.data);
    } else throw new Error("Invalid deferred inline media.");
  }
  if (!Number.isFinite(parsed.event.occurredAt.getTime()))
    throw new Error("Invalid deferred event date.");
  return parsed;
}

function assertDeferredScope(
  translated: DeferredTranslation,
  connection: { id: string; tenantId: string },
) {
  if (
    translated.event.tenantId !== connection.tenantId ||
    translated.event.connectionId !== connection.id
  )
    throw new Error("Deferred event scope mismatch.");
}

export function serializeDeferredEvent(
  translated: EvolutionWebhookTranslation,
): Prisma.InputJsonValue {
  const payload = JSON.parse(JSON.stringify(translated));
  if (translated.kind === "inbound" && translated.event.media?.inlineBody) {
    payload.event.media.inlineBody = {
      encoding: "base64",
      data: translated.event.media.inlineBody.toString("base64"),
    };
  }
  return payload as Prisma.InputJsonValue;
}
