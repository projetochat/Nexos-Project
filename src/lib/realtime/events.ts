export type RealtimeStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"
  | "offline";

export type RealtimeEnvelope<T = unknown> = {
  eventId: string;
  event: RealtimeServerEvent;
  version: 1;
  occurredAt: string;
  data: T;
};

export type RealtimeServerEvent =
  | "message.created"
  | "message.status.updated"
  | "message.reaction.updated"
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
