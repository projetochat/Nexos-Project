import { describe, expect, it } from "vitest";
import {
  taskDateTimeToIso,
  taskDayBoundary,
  taskLocalDateTime,
  taskWritePayload,
  type TaskInput,
} from "./task-management";

describe("task management civil times and write contract", () => {
  it("uses the task IANA zone independently of browser timezone", () => {
    expect(taskDateTimeToIso("2026-10-30T09:00", "America/Sao_Paulo")).toBe(
      "2026-10-30T12:00:00.000Z",
    );
    expect(taskLocalDateTime("2026-10-30T12:00:00.000Z", "America/Sao_Paulo")).toBe(
      "2026-10-30T09:00",
    );
    expect(taskDateTimeToIso("2026-10-30T09:00", "Asia/Tokyo")).toBe("2026-10-30T00:00:00.000Z");
  });
  it("uses the first existing civil minute for calendar boundaries during a midnight DST gap", () => {
    expect(taskDayBoundary("2018-11-04", "America/Sao_Paulo")).toBe("2018-11-04T03:00:00.000Z");
  });
  it("rejects invalid dates, partial hours and nonexistent DST civil times", () => {
    for (const value of ["2026-02-30T09:00", "2026-10-30T25:00", "2026-10-30T9", "2026-10-30T"])
      expect(() => taskDateTimeToIso(value, "America/Sao_Paulo")).toThrow();
    expect(() => taskDateTimeToIso("2018-11-04T00:30", "America/Sao_Paulo")).toThrow();
  });
  it("does not send persisted identifiers, tenant or execution state back as writable input", () => {
    const form = {
      title: "Synthetic",
      description: "",
      type: "task",
      assignedMembershipId: "member",
      priority: "medium",
      status: "active",
      recurrence: {
        frequency: "once",
        interval: 1,
        weekdays: [],
        monthDays: [],
        startAt: "2026-10-30T12:00:00Z",
        timezone: "America/Sao_Paulo",
      },
      audience: {
        mode: "contacts",
        selection: "fixed",
        contactIds: [],
        groupIds: [],
        conditions: [],
      },
      channels: {
        popup: false,
        bell: false,
        whatsapp: { enabled: false, connectionId: "", message: "", leadMinutes: 0 },
        email: { enabled: false, smtpAccountId: "", subject: "", body: "", leadMinutes: 0 },
      },
      id: "persisted-id",
      tenantId: "tenant",
      version: 3,
      nextOccurrenceId: "occurrence",
    } as TaskInput;
    const payload = taskWritePayload(form);
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("tenantId");
    expect(payload).not.toHaveProperty("version");
    expect(payload).not.toHaveProperty("nextOccurrenceId");
    expect(payload.title).toBe("Synthetic");
  });
});
