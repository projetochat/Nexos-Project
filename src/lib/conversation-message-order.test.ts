import { describe, expect, it } from "vitest";
import type { ApiMessage } from "./trixus-api";
import { orderConversationMessages } from "./conversation-message-order";

function message(id: string, createdAt: string) {
  return { id, created_at: createdAt } as ApiMessage;
}

describe("orderConversationMessages", () => {
  it("orders the chat by the complete message timestamp", () => {
    const items = [
      message("third", "2026-10-08T21:24:31.000Z"),
      message("first", "2026-10-08T21:23:59.999Z"),
      message("second", "2026-10-08T21:24:05.100Z"),
    ];

    expect(orderConversationMessages(items).map((item) => item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(items.map((item) => item.id)).toEqual(["third", "first", "second"]);
  });

  it("uses the message id as a stable tie breaker", () => {
    const timestamp = "2026-10-08T21:24:05.000Z";
    expect(
      orderConversationMessages([message("b", timestamp), message("a", timestamp)]).map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
  });
});
