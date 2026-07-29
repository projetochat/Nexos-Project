/* ============================================================
   Nexo · Realtime Adapter
   Interface unificada de tempo real. Hoje: emitter local.
   Amanhã: substituir a implementação por Socket.IO sem tocar
   nas telas — os hooks/eventos permanecem idênticos.
   ============================================================ */

import * as React from "react";

export type RealtimeEvent =
  | { type: "message.new"; conversaId: string; messageId: string }
  | { type: "conversation.updated"; conversaId: string }
  | { type: "presence"; atendenteId: string; status: "online" | "ausente" | "offline" }
  | { type: "typing"; conversaId: string; from: "cliente" | "atendente" }
  | { type: "connection.status"; status: "live" | "reconnecting" | "offline" };

type Listener = (e: RealtimeEvent) => void;

class RealtimeBus {
  private listeners = new Set<Listener>();
  emit(e: RealtimeEvent) {
    for (const l of this.listeners) l(e);
  }
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const realtime = new RealtimeBus();

export function useRealtime(listener: Listener) {
  React.useEffect(() => realtime.subscribe(listener), [listener]);
}

/** Status da conexão realtime — futuro: reflete socket state real. */
export function useConnectionStatus() {
  const [status, setStatus] = React.useState<"live" | "reconnecting" | "offline">("live");
  React.useEffect(() => {
    const onOffline = () => setStatus("offline");
    const onOnline = () => {
      setStatus("reconnecting");
      const t = setTimeout(() => setStatus("live"), 900);
      return () => clearTimeout(t);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return status;
}
