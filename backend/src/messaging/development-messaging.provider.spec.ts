import { describe, expect, it } from "vitest";
import { MessageType } from "../generated/prisma";
import { DevelopmentMessagingProvider } from "./development-messaging.provider";

describe("DevelopmentMessagingProvider", () => {
  it("accepts canonical text commands without simulating delivery", async () => {
    const provider = new DevelopmentMessagingProvider();

    const result = await provider.send({
      tenantId: "tenant-a",
      conversationId: "conversation-a",
      messageId: "message-a",
      connectionId: "connection-a",
      providerType: provider.type,
      recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
      content: { type: MessageType.TEXT, text: "Ola" },
    });

    expect(result).toMatchObject({
      accepted: true,
      providerMessageId: "dev_message-a",
      providerStatus: "accepted_by_development_provider",
    });
  });

  it("accepts canonical media commands for local outbox smoke tests", async () => {
    const provider = new DevelopmentMessagingProvider();

    await expect(
      provider.send({
        tenantId: "tenant-a",
        conversationId: "conversation-a",
        messageId: "message-a",
        connectionId: "connection-a",
        providerType: provider.type,
        recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
        content: {
          type: MessageType.IMAGE,
          mediaRef: "media-key",
          mediaBuffer: Buffer.from("image"),
          mimeType: "image/jpeg",
          fileName: "image.jpg",
        },
      }),
    ).resolves.toMatchObject({ accepted: true });
  });
});
