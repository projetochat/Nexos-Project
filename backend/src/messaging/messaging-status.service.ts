import { Injectable, Logger } from "@nestjs/common";
import { MessageStatus } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { MessageStatusEvent } from "./messaging.contracts";

const STATUS_RANK: Record<MessageStatus, number> = {
  CREATED: 0,
  SENDING: 1,
  SENT: 2,
  FAILED: 2,
  DELIVERED: 3,
  READ: 4,
};

@Injectable()
export class MessagingStatusService {
  private readonly logger = new Logger(MessagingStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    return { updated: true, message: updated };
  }
}

export function canProgress(current: MessageStatus, next: MessageStatus) {
  if (current === next) return true;
  if (current === MessageStatus.FAILED && next !== MessageStatus.FAILED) return false;
  if (next === MessageStatus.FAILED) return true;
  return STATUS_RANK[next] >= STATUS_RANK[current];
}
