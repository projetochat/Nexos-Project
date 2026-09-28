import { describe, expect, it } from "vitest";
import { MessageDirection } from "../generated/prisma";
import { outboundMessageOrigin } from "./message-origin";

describe("outboundMessageOrigin", () => {
  it("separates Trixus, external and legacy outbound messages", () => {
    expect(
      outboundMessageOrigin({
        direction: MessageDirection.OUTBOUND,
        authorMembershipId: "membership-a",
      }),
    ).toBe("trixus");
    expect(
      outboundMessageOrigin({
        direction: MessageDirection.OUTBOUND,
        clientMessageId: "automatic:welcome:1",
      }),
    ).toBe("trixus");
    expect(
      outboundMessageOrigin({
        direction: MessageDirection.OUTBOUND,
        externalMessageId: "provider-message-a",
      }),
    ).toBe("external");
    expect(outboundMessageOrigin({ direction: MessageDirection.OUTBOUND })).toBe("unknown");
    expect(outboundMessageOrigin({ direction: MessageDirection.INBOUND })).toBeNull();
  });
});
