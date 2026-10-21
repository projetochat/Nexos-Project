import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { OutboxEventStatus, Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingMediaStorageService } from "./media/messaging-media-storage.service";

export const MESSAGING_MEDIA_CLEANUP_REQUESTED = "messaging.media.cleanup.requested";
const MAX_ATTEMPTS = 25;
const PROCESSING_LEASE_MS = 5 * 60_000;

@Injectable()
export class MessagingMediaCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MessagingMediaCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingMediaStorageService)
    private readonly storage: MessagingMediaStorageService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), this.intervalMs());
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async process(eventId: string) {
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        type: MESSAGING_MEDIA_CLEANUP_REQUESTED,
        OR: [
          { status: OutboxEventStatus.PENDING },
          { status: OutboxEventStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
        ],
      },
      data: {
        status: OutboxEventStatus.PROCESSING,
        processingAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return false;
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event) return false;

    try {
      for (const objectKey of cleanupObjectKeys(event.payload)) {
        await this.storage.deleteObject(objectKey);
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: new Date(),
          processingAt: null,
          lastError: null,
        },
      });
      return true;
    } catch (error) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxEventStatus.FAILED,
          processingAt: null,
          lastError: cleanupError(error),
        },
      });
      this.logger.warn({
        event: "messaging.media.cleanup.failed",
        outboxEventId: event.id,
        error: cleanupError(error),
      });
      return false;
    }
  }

  async processPending(limit = 25) {
    await this.prisma.outboxEvent.updateMany({
      where: {
        type: MESSAGING_MEDIA_CLEANUP_REQUESTED,
        status: OutboxEventStatus.PROCESSING,
        processingAt: { lt: new Date(Date.now() - PROCESSING_LEASE_MS) },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: {
        status: OutboxEventStatus.FAILED,
        processingAt: null,
        lastError: "Processamento interrompido; limpeza reagendada.",
      },
    });
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        type: MESSAGING_MEDIA_CLEANUP_REQUESTED,
        OR: [
          { status: OutboxEventStatus.PENDING },
          { status: OutboxEventStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    let processed = 0;
    for (const event of events) if (await this.process(event.id)) processed += 1;
    return { scanned: events.length, processed };
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processPending();
    } catch (error) {
      this.logger.warn({
        event: "messaging.media.cleanup.poll_failed",
        error: cleanupError(error),
      });
    } finally {
      this.running = false;
    }
  }

  private intervalMs() {
    const value = Number(process.env.TRIXUS_MESSAGE_MEDIA_CLEANUP_INTERVAL_MS ?? 30_000);
    return Number.isFinite(value) && value >= 1_000 ? value : 30_000;
  }
}

function cleanupObjectKeys(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const objectKeys = (value as { objectKeys?: unknown }).objectKeys;
  if (!Array.isArray(objectKeys)) return [];
  return objectKeys.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function cleanupError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Falha ao excluir mídia.";
}
