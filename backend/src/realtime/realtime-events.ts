import { randomUUID } from "crypto";

export const REALTIME_NAMESPACE = "/realtime";
export const REALTIME_PATH = "/socket.io";

export type RealtimeServerEvent =
  | "message.created"
  | "message.status.updated"
  | "conversation.created"
  | "conversation.updated"
  | "conversation.assignment.updated"
  | "conversation.unread.updated"
  | "connection.status.updated"
  | "contact.updated"
  | "contact.tags.updated"
  | "ticket.created"
  | "ticket.updated"
  | "ticket.status.updated"
  | "ticket.assignment.updated"
  | "ticket.comment.created"
  | "ticket.attachment.created"
  | "ticket.attachment.removed"
  | "presence.updated"
  | "typing.started"
  | "typing.stopped";

export type RealtimeEnvelope<T = unknown> = {
  eventId: string;
  event: RealtimeServerEvent;
  version: 1;
  occurredAt: string;
  data: T;
};

export function realtimeEnvelope<T>(
  event: RealtimeServerEvent,
  data: T,
  occurredAt = new Date(),
): RealtimeEnvelope<T> {
  return {
    eventId: randomUUID(),
    event,
    version: 1,
    occurredAt: occurredAt.toISOString(),
    data,
  };
}
