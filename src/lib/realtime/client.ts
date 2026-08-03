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
let status: RealtimeStatus = realtimeEnabled() ? "offline" : "disabled";
let lastEventId: string | null = null;
let snapshot: { status: RealtimeStatus; lastEventId: string | null } = { status, lastEventId };
const listeners = new Set<Listener>();
const handlers = new Set<EventHandler>();
const seenEventIds = new Set<string>();
const activeConversationIds = new Set<string>();

export function realtimeSnapshot() {
  return snapshot;
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
  if (!realtimeEnabled()) {
    setStatus("disabled");
    return null;
  }
  const accessToken = await ensureNexosAccessToken();
  if (!accessToken) {
    setStatus("offline");
    return null;
  }
  if (socket?.connected) return socket;
  if (socket) {
    socket.auth = { accessToken };
    if (!socket.connected) socket.connect();
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
      setLastEventId(envelope.eventId);
      handlers.forEach((handler) => handler(envelope));
      notify();
    });
  }
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
  activeConversationIds.clear();
  seenEventIds.clear();
  setStatus(realtimeEnabled() ? "offline" : "disabled");
}

export function subscribeConversation(conversationId: string) {
  if (!socket?.connected || activeConversationIds.has(conversationId)) return;
  activeConversationIds.add(conversationId);
  socket?.emit("conversation.subscribe", { conversationId });
}

export function unsubscribeConversation(conversationId: string) {
  if (!activeConversationIds.delete(conversationId)) return;
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

export function realtimeDiagnostics() {
  return {
    enabled: realtimeEnabled(),
    socketInstances: socket ? 1 : 0,
    listenerCount: listeners.size,
    eventHandlerCount: handlers.size,
    conversationSubscriptions: activeConversationIds.size,
    status,
  };
}

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  snapshot = { status, lastEventId };
  notify();
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setLastEventId(next: string) {
  if (lastEventId === next) return;
  lastEventId = next;
  snapshot = { status, lastEventId };
}

function realtimeEnabled() {
  return import.meta.env.VITE_NEXOS_REALTIME_ENABLED !== "false";
}
