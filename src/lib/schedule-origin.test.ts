import { expect, it } from "vitest";
import { scheduleOrigin, scheduleWritePayload, type ApiSchedule } from "./schedule-types";
it.each([
  [{ origin: "CHAT", conversationId: "conversation-a" }, "CHAT"],
  [{ origin: "SCHEDULES", conversationId: "conversation-a" }, "SCHEDULES"],
  [{ origin: "CHAT" }, "CHAT"],
  [{ conversationId: "conversation-a" }, "CHAT"],
  [{ conversationId: "" }, "SCHEDULES"],
  [{ conversationId: "  " }, "SCHEDULES"],
  [{}, "SCHEDULES"],
] as const)(
  "resolves a persisted or legacy origin without changing the record: %j",
  (data, expected) => {
    const before = { ...data };
    expect(scheduleOrigin(data)).toBe(expected);
    expect(data).toEqual(before);
  },
);
it.each(["CHAT", "SCHEDULES"] as const)(
  "preserves %s through the write payload without sending execution state",
  (origin) => {
    const data = {
      id: "synthetic-schedule",
      origin,
      conversationId: "conversation-a",
      messageId: "server-only",
      executionStatus: "SENT",
      completedAt: "2026-10-28T03:00:00Z",
    } as ApiSchedule;
    const result = scheduleWritePayload(data);
    expect(result).toMatchObject({ id: data.id, origin, conversationId: data.conversationId });
    expect(result).not.toHaveProperty("messageId");
    expect(result).not.toHaveProperty("executionStatus");
    expect(result).not.toHaveProperty("completedAt");
  },
);
