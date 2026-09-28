import { describe, expect, it } from "vitest";
import type { ApiSchedule } from "./schedule-types";
import { pendingConversationSchedules, toLocalDateTimeInput } from "./schedule-message";

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
