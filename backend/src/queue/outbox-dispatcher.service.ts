import { Inject, Injectable, Logger } from "@nestjs/common";
import { MessageStatus, OutboxEventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import {
  MessagingOutboundJob,
  MessagingOutboundQueue,
  OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
} from "./messaging-outbound.queue";

const PENDING_OUTBOX_STATUSES = [OutboxEventStatus.PENDING, OutboxEventStatus.FAILED] as const;

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MessagingOutboundQueue)
    private readonly queue: MessagingOutboundQueue,
  ) {}

  async dispatchPending(limit = 50) {
    await this.releaseStaleProcessingEvents();
    const recovered = await this.recoverQueuedMessages(limit);
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
        status: { in: [...PENDING_OUTBOX_STATUSES] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    let dispatched = 0;
    for (const event of events) {
      if (await this.dispatchEvent(event.id)) dispatched += 1;
    }
    return { scanned: events.length, dispatched, recovered };
  }

  async recoverQueuedMessages(limit = 50) {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
        status: OutboxEventStatus.PROCESSED,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    let recovered = 0;
    for (const event of events) {
      const payload = this.parsePayload(event.payload);
      const message = await this.prisma.message.findFirst({
        where: { id: payload.messageId, tenantId: payload.tenantId, status: MessageStatus.QUEUED },
        select: { id: true },
      });
      if (!message) continue;
      await this.queue.enqueue(payload);
      recovered += 1;
    }
    return recovered;
  }

  async releaseStaleProcessingEvents(staleAfterMs = 30_000) {
    const staleBefore = new Date(Date.now() - staleAfterMs);
    return this.prisma.outboxEvent.updateMany({
      where: {
        type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
        status: OutboxEventStatus.PROCESSING,
        processingAt: { lt: staleBefore },
      },
      data: {
        status: OutboxEventStatus.FAILED,
        lastError: "Outbox dispatch interrupted before enqueue confirmation.",
      },
    });
  }

  async dispatchMessage(messageId: string) {
    const event = await this.prisma.outboxEvent.findFirst({
      where: { type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED, aggregateId: messageId },
      select: { id: true },
    });
    if (!event) return false;
    return this.dispatchEvent(event.id);
  }

  private async dispatchEvent(id: string) {
    const claimed = await this.claim(id);
    if (!claimed) return false;

    try {
      const payload = this.parsePayload(claimed.payload);
      await this.queue.enqueue(payload);
      await this.prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
        },
      });
      this.logger.log({
        event: "outbox.messaging_outbound.enqueued",
        outboxEventId: claimed.id,
        tenantId: claimed.tenantId,
        messageId: payload.messageId,
      });
      return true;
    } catch (error) {
      await this.prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: {
          status: OutboxEventStatus.FAILED,
          lastError: sanitizeError(error),
        },
      });
      this.logger.warn({
        event: "outbox.messaging_outbound.enqueue_failed",
        outboxEventId: claimed.id,
        tenantId: claimed.tenantId,
        error: sanitizeError(error),
      });
      return false;
    }
  }

  private async claim(id: string) {
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: { id, status: { in: [...PENDING_OUTBOX_STATUSES] } },
      data: {
        status: OutboxEventStatus.PROCESSING,
        attempts: { increment: 1 },
        processingAt: new Date(),
      },
    });
    if (claimed.count !== 1) return null;
    try {
      return await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    } catch {
      return null;
    }
  }

  private parsePayload(payload: Prisma.JsonValue): MessagingOutboundJob {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid outbound outbox payload.");
    }
    const tenantId = (payload as { tenantId?: unknown }).tenantId;
    const messageId = (payload as { messageId?: unknown }).messageId;
    if (typeof tenantId !== "string" || typeof messageId !== "string") {
      throw new Error("Invalid outbound outbox payload.");
    }
    return { tenantId, messageId };
  }
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Outbox dispatch failed.";
}
