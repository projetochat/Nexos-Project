import { describe, expect, it, vi } from "vitest";
import { RealtimePublisher } from "./realtime.publisher";

describe("additional fields realtime contract", () => {
  it.each([
    ["authorized actor", ["contacts.additional_fields.read"]],
    ["actor without additional-field permission", ["contacts.update"]],
  ])("publishes the same safe contact.updated payload for %s", (_label, _actorPermissions) => {
    const realtime = { publish: vi.fn() };
    const publisher = new RealtimePublisher(realtime as never);

    publisher.publishContactUpdated({ tenantId: "tenant-a", contactId: "contact-a" });

    expect(realtime.publish).toHaveBeenCalledWith({ tenantId: "tenant-a" }, "contact.updated", {
      contactId: "contact-a",
    });
    const serialized = JSON.stringify(realtime.publish.mock.calls);
    expect(serialized).not.toContain("customFields");
    expect(serialized).not.toContain("customFieldValues");
    expect(serialized).not.toContain("variableKey");
  });

  it("does not route a tenant event to another tenant", () => {
    const realtime = { publish: vi.fn() };
    const publisher = new RealtimePublisher(realtime as never);

    publisher.publishContactUpdated({ tenantId: "tenant-b", contactId: "contact-b" });

    expect(realtime.publish).toHaveBeenCalledOnce();
    expect(realtime.publish).toHaveBeenCalledWith({ tenantId: "tenant-b" }, "contact.updated", {
      contactId: "contact-b",
    });
  });

  it("keeps conversation events free of embedded contact data", () => {
    const realtime = { publish: vi.fn() };
    const publisher = new RealtimePublisher(realtime as never);

    publisher.publishConversationCreated({
      tenantId: "tenant-a",
      conversationId: "conversation-a",
    });
    publisher.publishConversationUpdated({
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      reason: "contact.updated",
    });

    const serialized = JSON.stringify(realtime.publish.mock.calls);
    expect(serialized).not.toContain("customFields");
    expect(serialized).not.toContain("customFieldValues");
    expect(serialized).not.toContain("variableKey");
  });
});
