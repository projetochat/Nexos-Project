import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { invalidateConversationQueries } from "./invalidate-conversation";
import {
  isInboundConversationUpdate,
  playInboxNotificationSound,
  prepareInboxNotificationSound,
} from "@/lib/inbox-notification-sound";
import {
  connectRealtime,
  disconnectRealtime,
  heartbeatRealtime,
  onRealtimeEvent,
  realtimeSnapshot,
  subscribeConversation,
  subscribeRealtime,
  unsubscribeConversation,
} from "./client";

export function useRealtimeStatus() {
  return React.useSyncExternalStore(subscribeRealtime, realtimeSnapshot, realtimeSnapshot);
}

export function useInstanceAccessUpdates(connect = true) {
  const user = useSession((state) => state.user);
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (user && connect) void connectRealtime();
    return onRealtimeEvent((event) => {
      if (event.event !== "instance-access.updated") return;
      void queryClient.cancelQueries().then(() => queryClient.resetQueries());
    });
  }, [connect, queryClient, user]);
}

export function useRealtimeInbox(conversationId?: string | null) {
  useInstanceAccessUpdates(false);
  const user = useSession((state) => state.user);
  const queryClient = useQueryClient();
  const realtime = useRealtimeStatus();
  const previousStatusRef = React.useRef(realtime.status);

  React.useEffect(() => {
    if (realtime.status === "disabled") return;
    if (!user) {
      disconnectRealtime();
      return;
    }
    void connectRealtime();
    const heartbeat = window.setInterval(() => heartbeatRealtime("online"), 30_000);
    return () => window.clearInterval(heartbeat);
  }, [realtime.status, user]);

  React.useEffect(() => {
    if (!conversationId || realtime.status !== "connected") return;
    subscribeConversation(conversationId);
    return () => unsubscribeConversation(conversationId);
  }, [conversationId, realtime.status]);

  React.useEffect(() => {
    const enableSound = () => prepareInboxNotificationSound();
    window.addEventListener("pointerdown", enableSound, { once: true });
    window.addEventListener("keydown", enableSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", enableSound);
      window.removeEventListener("keydown", enableSound);
    };
  }, []);

  React.useEffect(() => {
    return onRealtimeEvent((event) => {
      if (isInboundConversationUpdate(event)) playInboxNotificationSound(user?.id);
      if (
        event.event === "message.created" ||
        event.event === "message.status.updated" ||
        event.event === "message.reaction.updated" ||
        event.event === "conversation.updated" ||
        event.event === "conversation.created" ||
        event.event === "conversation.assignment.updated" ||
        event.event === "conversation.unread.updated"
      ) {
        const data = event.data as { conversationId?: string };
        void invalidateConversationQueries(queryClient, data.conversationId);
      }
      if (event.event === "connection.status.updated") {
        void queryClient.invalidateQueries({ queryKey: ["trixus", "messaging-connections"] });
      }
      if (event.event === "contact.updated" || event.event === "contact.tags.updated") {
        const data = event.data as { contactId?: string };
        if (data.contactId) {
          void queryClient.invalidateQueries({ queryKey: ["trixus", "contacts", data.contactId] });
          void queryClient.invalidateQueries({
            queryKey: ["trixus", "contact_protocols", data.contactId],
          });
          void queryClient.invalidateQueries({ queryKey: ["trixus", "conversations"] });
        }
      }
    });
  }, [queryClient, user?.id]);

  React.useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = realtime.status;
    if (realtime.status !== "connected" || previousStatus === "connected") return;
    void invalidateConversationQueries(queryClient, conversationId);
    void queryClient.invalidateQueries({ queryKey: ["trixus", "messaging-connections"] });
  }, [conversationId, queryClient, realtime.status]);

  return realtime;
}
