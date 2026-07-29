import * as React from "react";

export type QueueId = "ativas" | "standby" | "fila" | "leads";

export type QueuePref = {
  id: QueueId;
  label: string;
  enabled: boolean;
};

export const DEFAULT_QUEUE_PREFS: QueuePref[] = [
  { id: "ativas", label: "Ativas", enabled: true },
  { id: "standby", label: "Stand By", enabled: true },
  { id: "fila", label: "Fila", enabled: true },
  { id: "leads", label: "Leads", enabled: true },
];

const STORAGE_KEY = "nexo.settings.queuePrefs.v1";

function sanitize(input: unknown): QueuePref[] {
  if (!Array.isArray(input)) return DEFAULT_QUEUE_PREFS;
  const byId = new Map<QueueId, QueuePref>();
  for (const item of input as Partial<QueuePref>[]) {
    if (!item || typeof item !== "object") continue;
    const def = DEFAULT_QUEUE_PREFS.find((d) => d.id === item.id);
    if (!def) continue;
    byId.set(def.id, {
      id: def.id,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 24) : def.label,
      enabled: typeof item.enabled === "boolean" ? item.enabled : def.enabled,
    });
  }
  const ordered: QueuePref[] = [];
  for (const item of input as Partial<QueuePref>[]) {
    const v = byId.get(item?.id as QueueId);
    if (v && !ordered.find((o) => o.id === v.id)) ordered.push(v);
  }
  for (const def of DEFAULT_QUEUE_PREFS) {
    if (!ordered.find((o) => o.id === def.id)) ordered.push({ ...def });
  }
  return ordered;
}

export function loadQueuePrefs(): QueuePref[] {
  if (typeof window === "undefined") return DEFAULT_QUEUE_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUEUE_PREFS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_QUEUE_PREFS;
  }
}

export function saveQueuePrefs(prefs: QueuePref[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("nexo:queue-prefs"));
}

export function resetQueuePrefs() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("nexo:queue-prefs"));
}

export function useQueuePrefs(): QueuePref[] {
  const [prefs, setPrefs] = React.useState<QueuePref[]>(() => loadQueuePrefs());
  React.useEffect(() => {
    const sync = () => setPrefs(loadQueuePrefs());
    window.addEventListener("nexo:queue-prefs", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nexo:queue-prefs", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return prefs;
}
