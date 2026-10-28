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

/** The next three future 08:00/13:00 slots in the browser's local calendar. */
export function scheduleDateSuggestions(now = new Date()): Date[] {
  if (Number.isNaN(now.getTime())) return [];
  const suggestions: Date[] = [];
  for (let day = 0; suggestions.length < 3; day += 1) {
    for (const hour of [8, 13]) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + day,
        hour,
        0,
        0,
        0,
      );
      if (candidate.getTime() > now.getTime()) suggestions.push(candidate);
      if (suggestions.length === 3) break;
    }
  }
  return suggestions;
}
