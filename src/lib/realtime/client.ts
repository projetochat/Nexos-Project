import { io, type Socket } from "socket.io-client";
import {
  ensureTrixusAccessToken,
  getTrixusAccessToken,
  trixusRealtimeBaseUrl,
  refreshTrixusAccessToken,
} from "@/lib/trixus-api";
import type { RealtimeEnvelope, RealtimeServerEvent, RealtimeStatus } from "./events";

type Listener = () => void;
type EventHandler = (event: RealtimeEnvelope) => void;

let socket: Socket | null = null;
let authenticationSuspended = false;
let authenticationFailureCode: string | null = null;
let authenticationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let connectionGeneration = 0;
let connectionRequest: Promise<Socket | null> | null = null;
let reportedFailureCode: string | null = null;
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

export function connectRealtime() {
  if (connectionRequest) return connectionRequest;
  const request = createRealtimeConnection().finally(() => {
    if (connectionRequest === request) connectionRequest = null;
  });
  connectionRequest = request;
  return request;
}

async function createRealtimeConnection() {
  if (!realtimeEnabled()) {
    setStatus("disabled");
    return null;
  }
  if (authenticationSuspended) return socket;
  const generation = connectionGeneration;
  const accessToken = await ensureTrixusAccessToken();
  if (generation !== connectionGeneration || authenticationSuspended) return socket;
  if (!accessToken) {
    setStatus("offline");
    return null;
  }
  if (socket?.connected) return socket;
  if (socket) {
    socket.auth = { accessToken };
    // Socket.IO owns transport retries; callers must not bypass its backoff.
    return socket;
  }

  setStatus("connecting");
  socket = io(`${trixusRealtimeBaseUrl()}/realtime`, {
    path: "/socket.io",
    auth: { accessToken },
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    transports: ["websocket", "polling"],
  });

  const currentSocket = socket;
  let authenticationRecoveryUsed = false;
  let authenticationRecoveryInFlight = false;
  const suspendAuthentication = () => {
    if (socket !== currentSocket) return;
    authenticationSuspended = true;
    clearAuthenticationRetry();
    currentSocket.disconnect();
    setStatus("degraded");
    if (import.meta.env.DEV && reportedFailureCode !== authenticationFailureCode) {
      reportedFailureCode = authenticationFailureCode;
      console.warn(
        `[Trixus realtime] ${authenticationFailureCode}: reconexão automática suspensa.`,
      );
    }
  };

  // The transport connects before the gateway finishes authentication and joins rooms.
  socket.on("connect", () => setStatus("connecting"));
  socket.on("realtime.ready", () => {
    if (socket !== currentSocket) return;
    authenticationSuspended = false;
    authenticationFailureCode = null;
    authenticationRecoveryUsed = false;
    reportedFailureCode = null;
    clearAuthenticationRetry();
    // Rooms are lost on reconnect, even if React batches the offline/online renders.
    for (const conversationId of activeConversationIds) {
      socket?.emit("conversation.subscribe", { conversationId });
    }
    setStatus("connected");
  });
  socket.io.on("reconnect_attempt", () => {
    const token = getTrixusAccessToken();
    if (token && socket) socket.auth = { accessToken: token };
    setStatus("reconnecting");
  });
  socket.io.on("reconnect", () => setStatus("connecting"));
  socket.on("disconnect", () => {
    if (socket === currentSocket) setStatus(authenticationSuspended ? "degraded" : "offline");
  });
  socket.on("connect_error", () => {
    // A transport failure does not prove an expired token. Let bounded transport retries run.
    if (socket === currentSocket) setStatus("degraded");
  });
  socket.io.on("reconnect_failed", () => {
    if (socket !== currentSocket) return;
    authenticationFailureCode = "REALTIME_TRANSPORT_UNAVAILABLE";
    suspendAuthentication();
  });
  socket.on("realtime.auth_failed", async (failure?: { code?: unknown }) => {
    if (socket !== currentSocket) return;
    const code = typeof failure?.code === "string" ? failure.code : "REALTIME_AUTH_REJECTED";
    const refreshable = [
      "REALTIME_TOKEN_MISSING",
      "REALTIME_TOKEN_INVALID",
      "REALTIME_TOKEN_EXPIRED",
    ].includes(code);
    if (!refreshable) {
      authenticationFailureCode = [
        "REALTIME_ONBOARDING_PENDING",
        "REALTIME_USER_INACTIVE",
        "REALTIME_MEMBERSHIP_INACTIVE",
      ].includes(code)
        ? code
        : "REALTIME_AUTH_REJECTED";
      suspendAuthentication();
      return;
    }
    if (authenticationRecoveryInFlight || authenticationRetryTimer) return;
    authenticationFailureCode = code;
    if (authenticationRecoveryUsed) {
      suspendAuthentication();
      return;
    }
    authenticationRecoveryUsed = true;
    authenticationRecoveryInFlight = true;
    authenticationSuspended = true;
    currentSocket.disconnect();
    setStatus("degraded");
    try {
      const token = await refreshTrixusAccessToken();
      if (socket !== currentSocket || authenticationFailureCode !== code) return;
      if (!token) {
        suspendAuthentication();
        return;
      }
      currentSocket.auth = { accessToken: token };
      authenticationRetryTimer = setTimeout(() => {
        authenticationRetryTimer = null;
        if (socket === currentSocket && authenticationFailureCode === code) currentSocket.connect();
      }, 1_000);
    } catch {
      suspendAuthentication();
    } finally {
      authenticationRecoveryInFlight = false;
    }
  });

  const events: RealtimeServerEvent[] = [
    "schedule.updated",
    "message.created",
    "message.status.updated",
    "message.reaction.updated",
    "conversation.created",
    "conversation.updated",
    "conversation.assignment.updated",
    "conversation.unread.updated",
    "connection.status.updated",
    "instance-access.updated",
    "authorization.updated",
    "contact.updated",
    "contact.tags.updated",
    "ticket.created",
    "ticket.updated",
    "ticket.status.updated",
    "ticket.assignment.updated",
    "ticket.comment.created",
    "ticket.attachment.created",
    "ticket.attachment.removed",
    "notification.created",
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

export async function resumeRealtimeAfterOnboarding() {
  if (authenticationFailureCode !== "REALTIME_ONBOARDING_PENDING") return null;
  const previous = socket;
  socket = null;
  connectionGeneration += 1;
  connectionRequest = null;
  clearAuthenticationRetry();
  authenticationFailureCode = null;
  authenticationSuspended = false;
  previous?.disconnect();
  return connectRealtime();
}

export function disconnectRealtime() {
  connectionGeneration += 1;
  connectionRequest = null;
  clearAuthenticationRetry();
  authenticationSuspended = false;
  authenticationFailureCode = null;
  reportedFailureCode = null;
  socket?.disconnect();
  socket = null;
  activeConversationIds.clear();
  seenEventIds.clear();
  setStatus(realtimeEnabled() ? "offline" : "disabled");
}

export function subscribeConversation(conversationId: string) {
  if (!socket?.connected || status !== "connected" || activeConversationIds.has(conversationId))
    return;
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
    authenticationFailureCode,
    authenticationSuspended,
  };
}

function clearAuthenticationRetry() {
  if (authenticationRetryTimer !== null) clearTimeout(authenticationRetryTimer);
  authenticationRetryTimer = null;
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
  return import.meta.env.VITE_TRIXUS_REALTIME_ENABLED !== "false";
}

if (import.meta.hot) import.meta.hot.dispose(disconnectRealtime);
