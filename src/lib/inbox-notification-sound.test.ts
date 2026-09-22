// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  inboxNotificationSoundEnabled,
  isInboundConversationUpdate,
  setInboxNotificationSoundEnabled,
  inboxNotificationQueues,
  setInboxNotificationQueues,
  shouldNotifyInboxUpdate,
  NOTIFICATION_QUEUES,
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

  it("filters incoming alerts by the conversation queue and preserves user preferences", () => {
    setInboxNotificationQueues("user-a", ["leads", "standby"]);
    expect(inboxNotificationQueues("user-a")).toEqual(["leads", "standby"]);
    expect(inboxNotificationQueues("user-b")).toHaveLength(4);
    for (const { id } of NOTIFICATION_QUEUES) {
      const event = {
        eventId: id,
        event: "conversation.updated" as const,
        version: 1 as const,
        occurredAt: "2026-09-21T20:00:00Z",
        data: { reason: "inbound.updated", notificationQueue: id },
      };
      expect(shouldNotifyInboxUpdate(event, "user-a")).toBe(["leads", "standby"].includes(id));
      expect(shouldNotifyInboxUpdate(event, "user-b")).toBe(true);
      expect(
        shouldNotifyInboxUpdate(
          { ...event, data: { ...event.data, reason: "outbound.synced" } },
          "user-b",
        ),
      ).toBe(false);
      setInboxNotificationSoundEnabled("user-a", false);
      expect(shouldNotifyInboxUpdate(event, "user-a")).toBe(false);
      setInboxNotificationSoundEnabled("user-a", true);
    }
  });

  it("supports selecting all or none and safely handles events from older servers", () => {
    const event = {
      eventId: "legacy",
      event: "conversation.updated" as const,
      version: 1 as const,
      occurredAt: "2026-09-21T20:00:00Z",
      data: { reason: "inbound.created" },
    };
    expect(shouldNotifyInboxUpdate(event, "user-a")).toBe(true);
    setInboxNotificationQueues("user-a", []);
    expect(inboxNotificationQueues("user-a")).toEqual([]);
    expect(shouldNotifyInboxUpdate(event, "user-a")).toBe(false);
    setInboxNotificationQueues(
      "user-a",
      NOTIFICATION_QUEUES.map(({ id }) => id),
    );
    expect(shouldNotifyInboxUpdate(event, "user-a")).toBe(true);
  });
});
