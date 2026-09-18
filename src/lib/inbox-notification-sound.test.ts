import { describe, expect, it } from "vitest";
import { isInboundConversationUpdate } from "./inbox-notification-sound";

describe("isInboundConversationUpdate", () => {
  it("identifies only conversation updates caused by received messages", () => {
    expect(
      isInboundConversationUpdate({
        eventId: "event-a",
        event: "conversation.updated",
        version: 1,
        occurredAt: "2026-09-17T20:00:00.000Z",
        data: { reason: "inbound.updated" },
      }),
    ).toBe(true);
    expect(
      isInboundConversationUpdate({
        eventId: "event-b",
        event: "conversation.updated",
        version: 1,
        occurredAt: "2026-09-17T20:00:00.000Z",
        data: { reason: "outbound.queued" },
      }),
    ).toBe(false);
    expect(
      isInboundConversationUpdate({
        eventId: "event-c",
        event: "message.created",
        version: 1,
        occurredAt: "2026-09-17T20:00:00.000Z",
        data: {},
      }),
    ).toBe(false);
  });
});
