export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "degraded" | "offline";

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
  | "conversation.created"
  | "conversation.updated"
  | "conversation.assignment.updated"
  | "conversation.unread.updated"
  | "connection.status.updated"
  | "presence.updated"
  | "typing.started"
  | "typing.stopped";
