import { Inject, Injectable, Logger } from "@nestjs/common";
import { MessageDirection, MessageStatus, OutboxEventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import {
  MessagingOutboundJob,
  MessagingOutboundQueue,
  OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
  OUTBOUND_DISPATCH_CLAIMED,
  OUTBOUND_PROVIDER_OUTCOME_UNKNOWN,
} from "./messaging-outbound.queue";

const MAX_OUTBOX_DISPATCH_ATTEMPTS = 25;

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
    const staleMessages = await this.recoverStaleSendingMessages();
    const recovered = await this.recoverQueuedMessages(limit);
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        type: OUTBOX_MESSAGING_OUTBOUND_REQUESTED,
        OR: [
          { status: OutboxEventStatus.PENDING },
          {
            status: OutboxEventStatus.FAILED,
            attempts: { lt: MAX_OUTBOX_DISPATCH_ATTEMPTS },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    let dispatched = 0;
    for (const event of events) {
      if (await this.dispatchEvent(event.id)) dispatched += 1;
    }
    return { scanned: events.length, dispatched, recovered, staleMessages };
  }

  async recoverQueuedMessages(limit = 50) {
    // Join before LIMIT. Limiting all QUEUED messages first lets an old orphan without a
    // PROCESSED event permanently occupy the page and starve valid later messages.
    const messages = await this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT message.id, message."tenantId"
      FROM "messages" AS message
      WHERE message.status = ${MessageStatus.QUEUED}::"MessageStatus"
        AND message.direction = ${MessageDirection.OUTBOUND}::"MessageDirection"
        AND EXISTS (
          SELECT 1
          FROM "outbox_events" AS event
          WHERE event."tenantId" = message."tenantId"
            AND event."aggregateId" = message.id
            AND event.type = ${OUTBOX_MESSAGING_OUTBOUND_REQUESTED}
            AND event.status = ${OutboxEventStatus.PROCESSED}::"OutboxEventStatus"
        )
      ORDER BY message."createdAt" ASC, message.id ASC
      LIMIT ${limit}
    `;
    for (const message of messages) {
      await this.queue.enqueue({ tenantId: message.tenantId, messageId: message.id });
    }
    return messages.length;
  }

  async recoverStaleSendingMessages(staleAfterMs = 60_000) {
    const staleBefore = new Date(Date.now() - staleAfterMs);
    const safelyRequeued = await this.prisma.message.updateMany({
      where: {
        status: MessageStatus.SENDING,
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: staleBefore } }],
        providerErrorCode: OUTBOUND_DISPATCH_CLAIMED,
      },
      data: {
        status: MessageStatus.QUEUED,
        providerErrorCode: null,
        providerErrorMessage: null,
      },
    });
    const blockedAsAmbiguous = await this.prisma.message.updateMany({
      where: {
        status: MessageStatus.SENDING,
        AND: [
          { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: staleBefore } }] },
          {
            OR: [
              { providerErrorCode: null },
              { providerErrorCode: { not: OUTBOUND_DISPATCH_CLAIMED } },
            ],
          },
        ],
      },
      data: {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        providerErrorCode: OUTBOUND_PROVIDER_OUTCOME_UNKNOWN,
        providerErrorMessage: "Provider request outcome is unknown; automatic resend is blocked.",
      },
    });
    if (safelyRequeued.count || blockedAsAmbiguous.count) {
      this.logger.warn({
        event: "messaging.outbound.stale_reconciled",
        safelyRequeued: safelyRequeued.count,
        blockedAsAmbiguous: blockedAsAmbiguous.count,
      });
    }
    return {
      safelyRequeued: safelyRequeued.count,
      blockedAsAmbiguous: blockedAsAmbiguous.count,
    };
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
      const exhausted = claimed.attempts >= MAX_OUTBOX_DISPATCH_ATTEMPTS;
      await this.prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: {
          status: OutboxEventStatus.FAILED,
          lastError: sanitizeError(error),
        },
      });
      this.logger.warn({
        event: exhausted
          ? "outbox.messaging_outbound.retry_exhausted"
          : "outbox.messaging_outbound.enqueue_failed",
        outboxEventId: claimed.id,
        tenantId: claimed.tenantId,
        attempts: claimed.attempts,
        retryExhausted: exhausted,
        error: sanitizeError(error),
      });
      return false;
    }
  }

  private async claim(id: string) {
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        OR: [
          { status: OutboxEventStatus.PENDING },
          {
            status: OutboxEventStatus.FAILED,
            attempts: { lt: MAX_OUTBOX_DISPATCH_ATTEMPTS },
          },
        ],
      },
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
