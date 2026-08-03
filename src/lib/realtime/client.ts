import { io, type Socket } from "socket.io-client";
import {
  ensureNexosAccessToken,
  getNexosAccessToken,
  nexosRealtimeBaseUrl,
  refreshNexosAccessToken,
} from "@/lib/nexos-api";
import type { RealtimeEnvelope, RealtimeServerEvent, RealtimeStatus } from "./events";

type Listener = () => void;
type EventHandler = (event: RealtimeEnvelope) => void;

let socket: Socket | null = null;
let status: RealtimeStatus = "offline";
let lastEventId: string | null = null;
const listeners = new Set<Listener>();
const handlers = new Set<EventHandler>();
const seenEventIds = new Set<string>();

export function realtimeSnapshot() {
  return { status, lastEventId };
}

export function subscribeRealtime(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function onRealtimeEvent(handler: EventHandler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export async function connectRealtime() {
  const accessToken = await ensureNexosAccessToken();
  if (!accessToken) {
    setStatus("offline");
    return null;
  }
  if (socket?.connected) return socket;
  if (socket) {
    socket.auth = { accessToken };
    socket.connect();
    return socket;
  }

  setStatus("connecting");
  socket = io(`${nexosRealtimeBaseUrl()}/realtime`, {
    path: "/socket.io",
    auth: { accessToken },
    autoConnect: true,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => setStatus("connected"));
  socket.io.on("reconnect_attempt", () => {
    const token = getNexosAccessToken();
    if (token && socket) socket.auth = { accessToken: token };
    setStatus("reconnecting");
  });
  socket.io.on("reconnect", () => setStatus("connected"));
  socket.on("disconnect", () => setStatus("offline"));
  socket.on("connect_error", async () => {
    const token = await refreshNexosAccessToken();
    if (token && socket) socket.auth = { accessToken: token };
    setStatus("degraded");
  });
  socket.on("realtime.auth_failed", async () => {
    const token = await refreshNexosAccessToken();
    if (token && socket) {
      socket.auth = { accessToken: token };
      socket.connect();
    } else {
      setStatus("offline");
    }
  });

  const events: RealtimeServerEvent[] = [
    "message.created",
    "message.status.updated",
    "conversation.created",
    "conversation.updated",
    "conversation.assignment.updated",
    "conversation.unread.updated",
    "connection.status.updated",
    "presence.updated",
    "typing.started",
    "typing.stopped",
  ];
  for (const eventName of events) {
    socket.on(eventName, (envelope: RealtimeEnvelope) => {
      if (!envelope?.eventId || seenEventIds.has(envelope.eventId)) return;
      seenEventIds.add(envelope.eventId);
      if (seenEventIds.size > 500) seenEventIds.clear();
      lastEventId = envelope.eventId;
      handlers.forEach((handler) => handler(envelope));
      notify();
    });
  }
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
  seenEventIds.clear();
  setStatus("offline");
}

export function subscribeConversation(conversationId: string) {
  socket?.emit("conversation.subscribe", { conversationId });
}

export function unsubscribeConversation(conversationId: string) {
  socket?.emit("conversation.unsubscribe", { conversationId });
}

export function startTyping(conversationId: string) {
  socket?.emit("typing.start", { conversationId });
}

export function stopTyping(conversationId: string) {
  socket?.emit("typing.stop", { conversationId });
}

export function heartbeatRealtime(statusValue: "online" | "away" = "online") {
  socket?.emit("presence.heartbeat", { status: statusValue });
}

function setStatus(next: RealtimeStatus) {
  status = next;
  notify();
}

function notify() {
  listeners.forEach((listener) => listener());
}
