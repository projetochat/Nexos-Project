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

  it("transcodes browser recordings before sending WhatsApp voice audio", async () => {
    const client = {
      sendAudio: vi.fn().mockResolvedValue({
        key: { id: "VOICE1" },
        messageTimestamp: 1_709_550_600,
        status: "SENT",
      }),
    } as unknown as EvolutionClient;
    const transcoder = {
      transcode: vi.fn().mockResolvedValue({
        buffer: Buffer.from("ID3-mp3"),
        mimeType: "audio/mpeg",
        fileName: "recording.mp3",
      }),
    };
    const provider = new EvolutionMessagingProvider(client, transcoder as never);

    await provider.send({
      tenantId: "tenant",
      conversationId: "conversation",
      messageId: "message",
      connectionId: "connection",
      providerConnectionRef: "tenant-support",
      providerType: MessagingProviderType.EVOLUTION,
      recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
      content: {
        type: MessageType.VOICE,
        mediaBuffer: Buffer.from("webm-recording"),
        mimeType: "audio/webm;codecs=opus",
        fileName: "recording.webm",
      },
    });

    expect(transcoder.transcode).toHaveBeenCalledWith(
      expect.any(Buffer),
      "recording.webm",
      "audio/webm;codecs=opus",
    );
    expect(client.sendAudio).toHaveBeenCalledWith({
      instanceName: "tenant-support",
      payload: { number: "5511999990000" },
      media: Buffer.from("ID3-mp3"),
      mimeType: "audio/mpeg",
      fileName: "recording.mp3",
    });
  });

  it("sends quick-reply audio as media without requiring voice transcoding", async () => {
    const client = {
      sendMedia: vi.fn().mockResolvedValue({
        key: { id: "AUDIO1" },
        messageTimestamp: 1_709_550_600,
        status: "SENT",
      }),
    } as unknown as EvolutionClient;
    const transcoder = { transcode: vi.fn() };
    const provider = new EvolutionMessagingProvider(client, transcoder as never);
    const media = Buffer.from("webm-recording");

    await provider.send({
      tenantId: "tenant",
      conversationId: "conversation",
      messageId: "message",
      connectionId: "connection",
      providerConnectionRef: "tenant-support",
      providerType: MessagingProviderType.EVOLUTION,
      recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
      content: {
        type: MessageType.AUDIO,
        mediaBuffer: media,
        mimeType: "audio/webm",
        fileName: "recording.webm",
        caption: "Bom dia",
      },
    });

    expect(transcoder.transcode).not.toHaveBeenCalled();
    expect(client.sendMedia).toHaveBeenCalledWith({
      instanceName: "tenant-support",
      payload: {
        number: "5511999990000",
        mediatype: "audio",
        mimetype: "audio/webm",
        fileName: "recording.webm",
        caption: "Bom dia",
      },
      media,
      mimeType: "audio/webm",
      fileName: "recording.webm",
    });
  });

  it("sends vCards as native WhatsApp contacts", async () => {
    const client = {
      sendContact: vi.fn().mockResolvedValue({
        key: { id: "CONTACT1" },
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
      recipient: { phone: "(11) 99999-0000", normalizedPhone: "+5511999990000" },
      content: {
        type: MessageType.DOCUMENT,
        mediaBuffer: Buffer.from(
          "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Silva\r\nTEL;TYPE=CELL:+5562999991234\r\nEND:VCARD\r\n",
        ),
        mimeType: "text/vcard",
        fileName: "contato.vcf",
      },
    });

    expect(client.sendContact).toHaveBeenCalledWith({
      instanceName: "tenant-support",
      payload: {
        number: "5511999990000",
        contact: [{ fullName: "Ana Silva", wuid: "5562999991234", phoneNumber: "+5562999991234" }],
      },
    });
  });
});
