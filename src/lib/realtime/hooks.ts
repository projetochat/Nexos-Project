import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
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

export function useRealtimeInbox(conversationId?: string | null) {
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
    return onRealtimeEvent((event) => {
      if (
        event.event === "message.created" ||
        event.event === "message.status.updated" ||
        event.event === "message.reaction.updated" ||
        event.event === "conversation.updated" ||
        event.event === "conversation.created" ||
        event.event === "conversation.assignment.updated" ||
        event.event === "conversation.unread.updated"
      ) {
        void queryClient.invalidateQueries({ queryKey: ["trixus", "conversations"] });
      }
      if (
        event.event === "message.created" ||
        event.event === "message.status.updated" ||
        event.event === "message.reaction.updated" ||
        event.event === "conversation.unread.updated"
      ) {
        const data = event.data as { conversationId?: string };
        if (data.conversationId) {
          void queryClient.invalidateQueries({
            queryKey: ["trixus", "messages", data.conversationId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["trixus", "conversations", data.conversationId],
          });
        }
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
  }, [queryClient]);

  React.useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = realtime.status;
    if (realtime.status !== "connected" || previousStatus === "connected") return;
    void queryClient.invalidateQueries({ queryKey: ["trixus", "conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["trixus", "messaging-connections"] });
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ["trixus", "conversations", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["trixus", "messages", conversationId] });
    }
  }, [conversationId, queryClient, realtime.status]);

  return realtime;
}
