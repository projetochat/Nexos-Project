// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  inboxNotificationSoundEnabled,
  isInboundConversationUpdate,
  setInboxNotificationSoundEnabled,
} from "./inbox-notification-sound";

describe("isInboundConversationUpdate", () => {
  beforeEach(() => window.localStorage.clear());

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

  it("stores the sound preference independently for each user", () => {
    expect(inboxNotificationSoundEnabled("user-a")).toBe(true);
    setInboxNotificationSoundEnabled("user-a", false);
    expect(inboxNotificationSoundEnabled("user-a")).toBe(false);
    expect(inboxNotificationSoundEnabled("user-b")).toBe(true);
    setInboxNotificationSoundEnabled("user-a", true);
    expect(inboxNotificationSoundEnabled("user-a")).toBe(true);
  });
});
