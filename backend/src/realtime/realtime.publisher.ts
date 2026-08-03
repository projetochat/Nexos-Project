import { Inject, Injectable } from "@nestjs/common";
import { MessageStatus } from "../generated/prisma";
import { RealtimeService } from "./realtime.service";

@Injectable()
export class RealtimePublisher {
  constructor(@Inject(RealtimeService) private readonly realtime: RealtimeService) {}

  publishMessageCreated(input: {
    tenantId: string;
    conversationId: string;
    contactId?: string | null;
    connectionId?: string | null;
    message: unknown;
  }) {
    this.realtime.publish({ conversationId: input.conversationId }, "message.created", input);
    this.realtime.publish({ tenantId: input.tenantId }, "conversation.updated", {
      conversationId: input.conversationId,
      reason: "message.created",
    });
  }

  publishMessageStatusUpdated(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    previousStatus: MessageStatus | string;
    status: MessageStatus | string;
    updatedAt: Date | string;
    failureCode?: string | null;
  }) {
    this.realtime.publish({ conversationId: input.conversationId }, "message.status.updated", {
      ...input,
      updatedAt: dateString(input.updatedAt),
    });
  }

  publishConversationCreated(input: {
    tenantId: string;
    conversationId: string;
    conversation: unknown;
  }) {
    this.realtime.publish({ tenantId: input.tenantId }, "conversation.created", input);
  }

  publishConversationUpdated(input: {
    tenantId: string;
    conversationId: string;
    conversation?: unknown;
    reason: string;
  }) {
    this.realtime.publish({ tenantId: input.tenantId }, "conversation.updated", input);
    this.realtime.publish({ conversationId: input.conversationId }, "conversation.updated", input);
  }

  publishAssignmentUpdated(input: {
    tenantId: string;
    conversationId: string;
    previousMembershipId: string | null;
    membershipId: string | null;
    departmentId: string | null;
    updatedAt: Date | string;
  }) {
    this.realtime.publish({ tenantId: input.tenantId }, "conversation.assignment.updated", {
      ...input,
      updatedAt: dateString(input.updatedAt),
    });
  }

  publishUnreadUpdated(input: { tenantId: string; conversationId: string; unreadCount: number }) {
    this.realtime.publish(
      { conversationId: input.conversationId },
      "conversation.unread.updated",
      input,
    );
    this.realtime.publish({ tenantId: input.tenantId }, "conversation.unread.updated", input);
  }

  publishConnectionStatusUpdated(input: {
    tenantId: string;
    connectionId: string;
    status: string;
    updatedAt?: Date | string;
  }) {
    this.realtime.publish({ tenantId: input.tenantId }, "connection.status.updated", {
      ...input,
      updatedAt: input.updatedAt ? dateString(input.updatedAt) : new Date().toISOString(),
    });
  }
}

function dateString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
