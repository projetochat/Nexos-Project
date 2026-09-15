import { describe, expect, it, vi } from "vitest";
import { MessageType, MessagingProviderType } from "../../generated/prisma";
import { EvolutionClient } from "./evolution.client";
import { EvolutionMessagingProvider } from "./evolution-messaging.provider";

describe("EvolutionMessagingProvider", () => {
  it("maps canonical text commands to Evolution sendText", async () => {
    const client = {
      sendText: vi.fn().mockResolvedValue({
        key: { id: "EVMSG1" },
        messageTimestamp: 1_709_550_600,
        status: "SENT",
      }),
    } as unknown as EvolutionClient;
    const provider = new EvolutionMessagingProvider(client);

    const result = await provider.send({
      tenantId: "tenant",
      conversationId: "conversation",
      messageId: "message",
      connectionId: "connection",
      providerConnectionRef: "tenant-support",
      providerType: MessagingProviderType.EVOLUTION,
      recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
      content: { type: MessageType.TEXT, text: "Ola" },
    });

    expect(client.sendText).toHaveBeenCalledWith({
      instanceName: "tenant-support",
      payload: { number: "5511999990000", text: "Ola" },
    });
    expect(result).toMatchObject({
      accepted: true,
      providerMessageId: "EVMSG1",
      providerStatus: "SENT",
    });
  });

  it("maps group replies to Evolution quoted key without changing the group recipient", async () => {
    const client = {
      sendText: vi.fn().mockResolvedValue({
        key: { id: "EVMSG2" },
        messageTimestamp: 1_709_550_600,
        status: "SENT",
      }),
    } as unknown as EvolutionClient;
    const provider = new EvolutionMessagingProvider(client);

    await provider.send({
      tenantId: "tenant",
      conversationId: "conversation",
      messageId: "message",
      connectionId: "connection",
      providerConnectionRef: "tenant-support",
      providerType: MessagingProviderType.EVOLUTION,
      recipient: { phone: "", normalizedPhone: "" },
      externalChatId: "120363123456789@g.us",
      content: { type: MessageType.TEXT, text: "Reply" },
      quotedProviderMessageId: "ORIGINAL",
      quotedProviderChatId: "120363123456789@g.us",
      quotedFromMe: false,
      quotedParticipant: "5511999990000@s.whatsapp.net",
    });

    expect(client.sendText).toHaveBeenCalledWith({
      instanceName: "tenant-support",
      payload: {
        number: "120363123456789@g.us",
        text: "Reply",
        quoted: {
          key: {
            id: "ORIGINAL",
            remoteJid: "120363123456789@g.us",
            fromMe: false,
            participant: "5511999990000@s.whatsapp.net",
          },
        },
      },
    });
  });
});
