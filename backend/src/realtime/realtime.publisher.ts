import { Inject, Injectable } from "@nestjs/common";
import { MessageStatus } from "../generated/prisma";
import type { RealtimeServerEvent } from "./realtime-events";
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

  publishContactUpdated(input: { tenantId: string; contactId: string; contact: unknown }) {
    this.realtime.publish({ tenantId: input.tenantId }, "contact.updated", input);
  }

  publishContactTagsUpdated(input: { tenantId: string; contactId: string; tags: unknown[] }) {
    this.realtime.publish({ tenantId: input.tenantId }, "contact.tags.updated", input);
  }

  publishLeadCreated(input: { tenantId: string; leadId: string; conversationId: string }) {
    this.realtime.publish({ tenantId: input.tenantId }, "lead.created", input);
  }

  publishLeadUpdated(input: { tenantId: string; leadId: string; conversationId: string }) {
    this.realtime.publish({ tenantId: input.tenantId }, "lead.updated", input);
  }

  publishNotificationCreated(input: {
    tenantId: string;
    notificationId: string;
    membershipId?: string | null;
    departmentId?: string | null;
    kind: string;
  }) {
    this.realtime.publish({ tenantId: input.tenantId }, "notification.created", input);
    if (input.membershipId) {
      this.realtime.publish({ membershipId: input.membershipId }, "notification.created", input);
    }
  }

  publishTicketCreated(input: { tenantId: string; ticketId: string; ticket: unknown }) {
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.created", input);
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.created", input);
  }

  publishTicketUpdated(input: { tenantId: string; ticketId: string; reason: string }) {
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.updated", input);
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.updated", input);
  }

  publishTicketStatusUpdated(input: {
    tenantId: string;
    ticketId: string;
    status: string;
    updatedAt: Date | string;
  }) {
    const payload = { ...input, updatedAt: dateString(input.updatedAt) };
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.status.updated", payload);
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.status.updated", payload);
  }

  publishTicketAssignmentUpdated(input: {
    tenantId: string;
    ticketId: string;
    assignedMembershipId: string | null;
    updatedAt: Date | string;
  }) {
    const payload = { ...input, updatedAt: dateString(input.updatedAt) };
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.assignment.updated", payload);
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.assignment.updated", payload);
  }

  publishTicketCommentCreated(input: { tenantId: string; ticketId: string; comment: unknown }) {
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.comment.created", input);
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.comment.created", {
      tenantId: input.tenantId,
      ticketId: input.ticketId,
    });
  }

  publishTicketAttachmentCreated(input: {
    tenantId: string;
    ticketId: string;
    attachment: unknown;
  }) {
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.attachment.created", input);
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.attachment.created", {
      tenantId: input.tenantId,
      ticketId: input.ticketId,
    });
  }

  publishTicketAttachmentRemoved(input: {
    tenantId: string;
    ticketId: string;
    attachmentId: string;
  }) {
    this.realtime.publish({ ticketId: input.ticketId }, "ticket.attachment.removed", input);
    this.realtime.publish({ tenantId: input.tenantId }, "ticket.attachment.removed", input);
  }

  publishCampaignEvent(input: {
    tenantId: string;
    campaignId: string;
    event: RealtimeServerEvent;
    status: string;
    counters: unknown;
    updatedAt: Date | string;
  }) {
    const payload = { ...input, updatedAt: dateString(input.updatedAt) };
    this.realtime.publish({ tenantId: input.tenantId }, input.event, payload);
    this.realtime.publish({ campaignId: input.campaignId }, input.event, payload);
  }
}

function dateString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
