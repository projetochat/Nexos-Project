import { describe, expect, it } from "vitest";
import { MessageStatus, MessagingConnectionStatus } from "../../generated/prisma";
import { EvolutionWebhookTranslator } from "./evolution-webhook.translator";

describe("EvolutionWebhookTranslator", () => {
  const translator = new EvolutionWebhookTranslator();
  const connection = { tenantId: "tenant-a", id: "connection-a" };

  it("normalizes messages.upsert into canonical inbound events", () => {
    const result = translator.translate(
      {
        event: "messages.upsert",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "MSG1" },
          message: { conversation: "Ola Nexos" },
          messageTimestamp: 1_709_550_600,
          pushName: "Cliente",
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        tenantId: "tenant-a",
        connectionId: "connection-a",
        externalMessageId: "MSG1",
        content: "Ola Nexos",
      },
    });
  });

  it("preserves contact profile picture URLs from inbound webhook payloads", () => {
    const result = translator.translate(
      {
        event: "messages.upsert",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "MSG-PHOTO" },
          message: { conversation: "Ola" },
          pushName: "Cliente",
          profilePicUrl: "https://pps.whatsapp.net/v/profile.jpg",
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        metadata: {
          profilePictureUrl: "https://pps.whatsapp.net/v/profile.jpg",
        },
      },
    });
  });

  it("normalizes realistic Evolution v2.3.1 uppercase webhook payloads", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        destination: "http://host.docker.internal:3001/api/webhooks/evolution",
        date_time: "2026-03-04T12:34:56.789Z",
        sender: "5511999999999@s.whatsapp.net",
        data: {
          key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            fromMe: false,
            id: "3EB0C7B4E7A2B8E6D4F1",
          },
          pushName: "John Doe",
          message: {
            extendedTextMessage: { text: "Hello, I need help with my order" },
          },
          messageType: "extendedTextMessage",
          messageTimestamp: 1_709_553_296,
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalMessageId: "3EB0C7B4E7A2B8E6D4F1",
        sender: { phone: "5511999999999", normalizedPhone: "+5511999999999" },
        metadata: {
          remoteJid: "5511999999999@s.whatsapp.net",
          normalizedPhoneCandidates: ["+5511999999999", "+551199999999"],
        },
        content: "Hello, I need help with my order",
      },
    });
  });

  it("normalizes c.us and device-suffixed remote identities", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "551199999999:7@c.us", fromMe: false, id: "MSG-CUS" },
          message: { conversation: "Oi" },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        sender: { phone: "551199999999", normalizedPhone: "+551199999999" },
        metadata: {
          normalizedPhoneCandidates: ["+551199999999", "+5511999999999"],
        },
      },
    });
  });

  it("normalizes group messages with group chat and participant identity", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: {
            remoteJid: "120363123456789@g.us",
            participant: "551188887777@s.whatsapp.net",
            fromMe: false,
            id: "GROUP-1",
          },
          pushName: "Cliente Grupo",
          groupSubject: "Grupo Suporte",
          message: { conversation: "Grupo" },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalChatId: "120363123456789@g.us",
        conversationType: "GROUP",
        participantExternalId: "551188887777@s.whatsapp.net",
        participantPhone: "551188887777",
        participantName: "Cliente Grupo",
        metadata: { displayName: "Grupo Suporte" },
      },
    });
  });

  it("does not use group participant pushName as the group display name", () => {
    expect(
      translator.translate(
        {
          event: "MESSAGES_UPSERT",
          instance: "tenant-support",
          data: {
            key: {
              remoteJid: "120363123456789@g.us",
              participant: "551188887777@s.whatsapp.net",
              fromMe: false,
              id: "GROUP-1",
            },
            pushName: "Cliente Grupo",
            message: { conversation: "Grupo" },
          },
        },
        connection,
      ),
    ).toMatchObject({
      kind: "inbound",
      event: {
        externalChatId: "120363123456789@g.us",
        conversationType: "GROUP",
        participantExternalId: "551188887777@s.whatsapp.net",
        participantPhone: "551188887777",
        participantName: "Cliente Grupo",
        metadata: { displayName: null },
      },
    });
  });

  it("normalizes wrapped inbound replies with quoted provider ids and previews", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "REPLY-1" },
          pushName: "Cliente",
          message: {
            ephemeralMessage: {
              message: {
                extendedTextMessage: {
                  text: "Respondendo agora",
                  contextInfo: {
                    stanzaId: "ORIGINAL-1",
                    quotedMessage: { imageMessage: { caption: "Foto anterior" } },
                  },
                },
              },
            },
          },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalMessageId: "REPLY-1",
        content: "Respondendo agora",
        quotedProviderMessageId: "ORIGINAL-1",
        quotedContentPreview: "Foto anterior",
        quotedMessageType: "IMAGE",
      },
    });
  });

  it("normalizes direct inbound replies when Evolution puts contextInfo at data root", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "REPLY-ROOT" },
          pushName: "Cliente",
          message: {
            messageContextInfo: { messageSecret: [] },
            conversation: "Teste",
          },
          contextInfo: {
            stanzaId: "ORIGINAL-ROOT",
            quotedMessage: { imageMessage: { caption: "Foto citada" } },
          },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalMessageId: "REPLY-ROOT",
        content: "Teste",
        quotedProviderMessageId: "ORIGINAL-ROOT",
        quotedContentPreview: "Foto citada",
        quotedMessageType: "IMAGE",
      },
    });
  });

  it("normalizes stickers as inbound image media", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "STICKER-1" },
          pushName: "Cliente",
          message: {
            stickerMessage: {
              url: "https://mmg.whatsapp.net/sticker.enc",
              mimetype: "image/webp",
              fileSha256: "sha-sticker",
            },
          },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalMessageId: "STICKER-1",
        type: "IMAGE",
        content: "[figurinha]",
        media: {
          url: "https://mmg.whatsapp.net/sticker.enc",
          mimetype: "image/webp",
          sha256: "sha-sticker",
        },
      },
    });
  });

  it("normalizes wrapped inbound media and preserves raw message for Evolution download", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "IMG-1" },
          pushName: "Cliente",
          message: {
            viewOnceMessageV2: {
              message: {
                imageMessage: {
                  mimetype: "image/jpeg",
                  caption: "Imagem inbound",
                  directPath: "/v/t62.7118/media-path",
                  fileSha256: "sha256-a",
                },
              },
            },
          },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "inbound",
      event: {
        externalMessageId: "IMG-1",
        type: "IMAGE",
        content: "Imagem inbound",
        media: {
          url: "/v/t62.7118/media-path",
          mimetype: "image/jpeg",
          sha256: "sha256-a",
        },
      },
    });
    expect(result.kind === "inbound" ? result.event.media?.rawMessage : null).toBeTruthy();
  });

  it("normalizes status updates into canonical status events", () => {
    const result = translator.translate(
      {
        event: "messages.update",
        instance: "tenant-support",
        data: {
          key: { id: "MSG1" },
          status: "read",
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "status",
      event: {
        providerMessageId: "MSG1",
        status: MessageStatus.READ,
      },
    });
  });

  it("normalizes reaction messages into canonical reaction events", () => {
    const result = translator.translate(
      {
        event: "MESSAGES_UPSERT",
        instance: "tenant-support",
        data: {
          key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            fromMe: false,
            id: "REACTION-1",
          },
          pushName: "Cliente",
          message: {
            reactionMessage: {
              key: {
                remoteJid: "5511999999999@s.whatsapp.net",
                fromMe: true,
                id: "MSG-TARGET",
              },
              text: "\u{1f44d}",
            },
          },
        },
      },
      connection,
    );

    expect(result).toMatchObject({
      kind: "reaction",
      event: {
        providerMessageId: "MSG-TARGET",
        providerReactionId: "REACTION-1",
        emoji: "\u{1f44d}",
        actorExternalId: "5511999999999@s.whatsapp.net",
        actorName: "Cliente",
      },
    });
  });

  it("extracts owner identity from connection updates", () => {
    expect(
      translator.translate(
        {
          event: "connection.update",
          instance: "tenant-support",
          data: { state: "open", ownerJid: "551199990000@s.whatsapp.net" },
        },
        connection,
      ),
    ).toMatchObject({
      kind: "connection",
      status: MessagingConnectionStatus.CONNECTED,
      ownerExternalId: "551199990000@s.whatsapp.net",
      ownerPhoneNormalized: "+551199990000",
    });
  });

  it("ignores unknown events safely", () => {
    expect(
      translator.translate({ event: "labels.edit", instance: "x", data: {} }, connection),
    ).toMatchObject({ kind: "ignored", reason: "UNSUPPORTED_EVENT" });
  });

  it("returns canonical ignored reasons for invalid inbound payloads", () => {
    expect(
      translator.translate(
        {
          event: "MESSAGES_UPSERT",
          instance: "tenant-support",
          data: {
            key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "FROM-ME-1" },
            message: { conversation: "Outbound echo" },
          },
        },
        connection,
      ),
    ).toMatchObject({ kind: "ignored", reason: "FROM_ME" });

    expect(
      translator.translate(
        {
          event: "MESSAGES_UPSERT",
          instance: "tenant-support",
          data: {
            key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
            message: { conversation: "Sem id" },
          },
        },
        connection,
      ),
    ).toMatchObject({ kind: "ignored", reason: "MISSING_MESSAGE_ID" });
  });
});
