import { describe, expect, it, vi } from "vitest";
import { MessageStatus } from "../generated/prisma";
import { canProgress, MessagingStatusService } from "./messaging-status.service";

describe("message status progression", () => {
  it("allows monotonic delivery progression and idempotent repeats", () => {
    expect(canProgress(MessageStatus.SENDING, MessageStatus.SENT)).toBe(true);
    expect(canProgress(MessageStatus.SENT, MessageStatus.DELIVERED)).toBe(true);
    expect(canProgress(MessageStatus.DELIVERED, MessageStatus.READ)).toBe(true);
    expect(canProgress(MessageStatus.READ, MessageStatus.READ)).toBe(true);
  });

  it("blocks invalid regressions", () => {
    expect(canProgress(MessageStatus.READ, MessageStatus.SENT)).toBe(false);
    expect(canProgress(MessageStatus.DELIVERED, MessageStatus.SENT)).toBe(false);
  });

  it("keeps failed terminal except repeated failure", () => {
    expect(canProgress(MessageStatus.SENT, MessageStatus.FAILED)).toBe(true);
    expect(canProgress(MessageStatus.FAILED, MessageStatus.FAILED)).toBe(true);
    expect(canProgress(MessageStatus.FAILED, MessageStatus.READ)).toBe(false);
  });

  it.each([MessageStatus.DELIVERED, MessageStatus.READ])(
    "updates only the message for a %s receipt and leaves conversation pending state untouched",
    async (status) => {
      const message = {
        id: "message-a",
        tenantId: "tenant-a",
        connectionId: "connection-a",
        conversationId: "conversation-a",
        providerMessageId: "provider-a",
        status: MessageStatus.SENT,
        sentAt: new Date("2026-10-05T12:00:00.000Z"),
        deliveredAt: null,
        readAt: null,
        failedAt: null,
      };
      const prisma = {
        message: {
          findFirst: vi.fn().mockResolvedValue(message),
          update: vi.fn().mockResolvedValue({
            ...message,
            status,
            updatedAt: new Date("2026-10-05T12:01:00.000Z"),
            providerErrorCode: null,
          }),
        },
        conversation: { update: vi.fn() },
      };

      await new MessagingStatusService(prisma as never).process({
        tenantId: "tenant-a",
        connectionId: "connection-a",
        providerMessageId: "provider-a",
        status,
        occurredAt: new Date("2026-10-05T12:01:00.000Z"),
      });

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-a",
          connectionId: "connection-a",
          providerMessageId: "provider-a",
        },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    },
  );
});
