import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { MessageStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { MessageStatusEvent } from "./messaging.contracts";

const STATUS_RANK: Record<MessageStatus, number> = {
  CREATED: 0,
  QUEUED: 1,
  SENDING: 2,
  SENT: 3,
  FAILED: 3,
  DELIVERED: 4,
  READ: 5,
};

@Injectable()
export class MessagingStatusService {
  private readonly logger = new Logger(MessagingStatusService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimePublisher) private readonly realtime?: RealtimePublisher,
  ) {}

  async process(event: MessageStatusEvent) {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: event.tenantId,
        connectionId: event.connectionId,
        providerMessageId: event.providerMessageId,
      },
    });
    if (!message) return { updated: false, reason: "not_found" as const };

    if (!canProgress(message.status, event.status)) {
      return { updated: false, reason: "regression" as const, message };
    }

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: event.status,
        providerStatus: event.status.toLowerCase(),
        providerErrorCode: event.errorCode ?? null,
        providerErrorMessage: event.errorMessage ?? null,
        readAt: event.status === MessageStatus.READ ? event.occurredAt : message.readAt,
      },
    });

    this.logger.log({
      event: "messaging.status.processed",
      messageId: updated.id,
      connectionId: event.connectionId,
      eventType: event.status,
    });
    this.realtime?.publishMessageStatusUpdated({
      tenantId: event.tenantId,
      conversationId: updated.conversationId,
      messageId: updated.id,
      previousStatus: message.status,
      status: updated.status,
      updatedAt: updated.updatedAt,
      failureCode: updated.providerErrorCode,
    });
    return { updated: true, message: updated };
  }
}

export function canProgress(current: MessageStatus, next: MessageStatus) {
  if (current === next) return true;
  if (current === MessageStatus.FAILED && next !== MessageStatus.FAILED) return false;
  if (next === MessageStatus.FAILED) return true;
  return STATUS_RANK[next] >= STATUS_RANK[current];
}
