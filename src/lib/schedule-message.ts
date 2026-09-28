import type { ApiSchedule } from "./schedule-types";

export function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function pendingConversationSchedules(items: ApiSchedule[], conversationId: string) {
  return items
    .filter(
      (item) =>
        item.type === "message" &&
        item.status === "pending" &&
        item.conversationId === conversationId,
    )
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
}
