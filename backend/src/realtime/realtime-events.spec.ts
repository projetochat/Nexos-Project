import { describe, expect, it } from "vitest";
import { realtimeEnvelope } from "./realtime-events";
import { conversationRoomId, realtimeRooms } from "./realtime-rooms";

describe("realtime contract", () => {
  it("builds tenant-scoped room names centrally", () => {
    expect(realtimeRooms.tenant("tenant-a")).toBe("tenant:tenant-a");
    expect(realtimeRooms.membership("membership-a")).toBe("membership:membership-a");
    expect(realtimeRooms.department("department-a")).toBe("department:department-a");
    expect(realtimeRooms.conversation("conversation-a")).toBe("conversation:conversation-a");
    expect(conversationRoomId("conversation:conversation-a")).toBe("conversation-a");
  });

  it("wraps server events in versioned envelopes with unique event ids", () => {
    const first = realtimeEnvelope("message.created", { messageId: "message-a" });
    const second = realtimeEnvelope("message.created", { messageId: "message-a" });

    expect(first).toMatchObject({
      event: "message.created",
      version: 1,
      data: { messageId: "message-a" },
    });
    expect(first.eventId).toEqual(expect.any(String));
    expect(first.eventId).not.toBe(second.eventId);
    expect(new Date(first.occurredAt).toString()).not.toBe("Invalid Date");
  });
});
