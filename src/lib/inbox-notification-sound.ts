import type { RealtimeEnvelope } from "@/lib/realtime/events";

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;
const SOUND_PREFERENCE_PREFIX = "trixus:inbox-notification-sound:";

export function inboxNotificationSoundEnabled(userId?: string | null) {
  if (typeof window === "undefined" || !userId) return true;
  return window.localStorage.getItem(`${SOUND_PREFERENCE_PREFIX}${userId}`) !== "disabled";
}

export function setInboxNotificationSoundEnabled(userId: string, enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${SOUND_PREFERENCE_PREFIX}${userId}`,
    enabled ? "enabled" : "disabled",
  );
  window.dispatchEvent(
    new CustomEvent("trixus:inbox-notification-sound-changed", { detail: { userId, enabled } }),
  );
}

export function isInboundConversationUpdate(event: RealtimeEnvelope) {
  if (event.event !== "conversation.updated") return false;
  const reason = (event.data as { reason?: string } | undefined)?.reason;
  return reason === "inbound.created" || reason === "inbound.updated";
}

/** Enables the browser audio context after a user interaction. */
export function prepareInboxNotificationSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

/** Plays a short, unobtrusive notification for a received WhatsApp message. */
export function playInboxNotificationSound(userId?: string | null) {
  if (!inboxNotificationSoundEnabled(userId)) return;
  const context = getAudioContext();
  if (!context || context.state !== "running") return;

  const now = Date.now();
  if (now - lastPlayedAt < 250) return;
  lastPlayedAt = now;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(784, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(1_046, startAt + 0.12);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.23);
}

function getAudioContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}
