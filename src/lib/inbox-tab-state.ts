export type InboxTabId = "ativas" | "standby" | "fila" | "leads";

let activeInboxTab: InboxTabId = "ativas";
const listeners = new Set<() => void>();

export function getInboxTab() {
  return activeInboxTab;
}

export function setInboxTab(tab: InboxTabId) {
  if (activeInboxTab === tab) return;
  activeInboxTab = tab;
  listeners.forEach((listener) => listener());
}

export function subscribeInboxTab(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
