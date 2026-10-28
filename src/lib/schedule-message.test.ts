import { describe, expect, it } from "vitest";
import type { ApiSchedule } from "./schedule-types";
import {
  pendingConversationSchedules,
  scheduleDateSuggestions,
  toLocalDateTimeInput,
} from "./schedule-message";

function schedule(overrides: Partial<ApiSchedule>): ApiSchedule {
  return {
    id: "schedule-1",
    identifier: "message-1",
    type: "message",
    title: "Mensagem agendada",
    destination: "Conversa atual",
    conversationId: "conversation-1",
    scheduledAt: "2026-10-01T15:00:00.000Z",
    recurrence: "once",
    delivery: true,
    status: "pending",
    connectionId: "",
    departmentId: "",
    content: "Olá",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: null,
    ...overrides,
  };
}

describe("schedule message helpers", () => {
  it("keeps only pending messages from the active conversation and orders by date", () => {
    const result = pendingConversationSchedules(
      [
        schedule({ id: "later", scheduledAt: "2026-10-02T15:00:00.000Z" }),
        schedule({ id: "completed", status: "completed" }),
        schedule({ id: "other", conversationId: "conversation-2" }),
        schedule({ id: "task", type: "task" }),
        schedule({ id: "earlier", scheduledAt: "2026-10-01T15:00:00.000Z" }),
      ],
      "conversation-1",
    );

    expect(result.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("formats valid dates for datetime-local and rejects invalid input", () => {
    expect(toLocalDateTimeInput("invalid")).toBe("");
    expect(toLocalDateTimeInput("2026-10-01T15:00:00.000Z")).toMatch(/^2026-10-01T\d{2}:00$/);
  });
});

describe("schedule date suggestions", () => {
  it.each([
    [7, 59, 59, 999, ["2026-10-28T08:00", "2026-10-28T13:00", "2026-10-29T08:00"]],
    [8, 0, 0, 0, ["2026-10-28T13:00", "2026-10-29T08:00", "2026-10-29T13:00"]],
    [12, 59, 59, 999, ["2026-10-28T13:00", "2026-10-29T08:00", "2026-10-29T13:00"]],
    [13, 0, 0, 0, ["2026-10-29T08:00", "2026-10-29T13:00", "2026-10-30T08:00"]],
    [23, 59, 59, 999, ["2026-10-29T08:00", "2026-10-29T13:00", "2026-10-30T08:00"]],
  ] as const)(
    "excludes elapsed slots at %s:%s:%s.%s",
    (hours, minutes, seconds, milliseconds, expected) => {
      const now = new Date(2026, 9, 28, hours, minutes, seconds, milliseconds);
      const previous = now.getTime();
      const suggestions = scheduleDateSuggestions(now);
      expect(suggestions.map((date) => toLocalDateTimeInput(date.toISOString()))).toEqual(expected);
      expect(suggestions.every((date) => date.getTime() > now.getTime())).toBe(true);
      expect(now.getTime()).toBe(previous);
    },
  );

  it.each([
    [2026, 9, 31, ["2026-11-01T08:00", "2026-11-01T13:00", "2026-11-02T08:00"]],
    [2026, 11, 31, ["2027-01-01T08:00", "2027-01-01T13:00", "2027-01-02T08:00"]],
    [2028, 1, 28, ["2028-02-29T08:00", "2028-02-29T13:00", "2028-03-01T08:00"]],
  ] as const)(
    "uses calendar rollover after %s month-index %s day %s",
    (year, month, day, expected) => {
      expect(
        scheduleDateSuggestions(new Date(year, month, day, 14)).map((date) =>
          toLocalDateTimeInput(date.toISOString()),
        ),
      ).toEqual(expected);
    },
  );

  it.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === "America/New_York")(
    "preserves local wall-clock slots across daylight saving rather than adding 24 hours",
    () => {
      const now = new Date(2026, 2, 7, 14);
      const suggestions = scheduleDateSuggestions(now);
      expect(suggestions.map((date) => toLocalDateTimeInput(date.toISOString()))).toEqual([
        "2026-03-08T08:00",
        "2026-03-08T13:00",
        "2026-03-09T08:00",
      ]);
      expect(suggestions[0].getTime() - now.getTime()).toBe(17 * 60 * 60_000);
      expect(suggestions[0].getTimezoneOffset()).not.toBe(now.getTimezoneOffset());
    },
  );

  it("rejects an invalid clock without looping or manufacturing slots", () => {
    expect(scheduleDateSuggestions(new Date("invalid"))).toEqual([]);
  });
});
