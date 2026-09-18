import type { ApiMessage } from "./trixus-api";

export function orderHistoryMessages(messages: ApiMessage[]) {
  const ordered = [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id.localeCompare(b.id),
  );
  const isEvent = (message: ApiMessage, pattern: RegExp) =>
    (message.type === "system" || message.direction === "system") &&
    pattern.test(message.content ?? "");
  // The opening record can be created after older WhatsApp messages were imported.
  // Position this boundary at the start without changing its recorded timestamp.
  const opening = ordered.find((message) => isEvent(message, /^Conversa iniciada\b/i));
  const closing = [...ordered]
    .reverse()
    .find((message) => isEvent(message, /^Conversa encerrada\b/i));
  return [
    ...(opening ? [opening] : []),
    ...ordered.filter((message) => message !== opening && message !== closing),
    ...(closing ? [closing] : []),
  ];
}
