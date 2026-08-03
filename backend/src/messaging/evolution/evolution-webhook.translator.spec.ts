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
        content: "Hello, I need help with my order",
      },
    });
  });

  it("ignores group messages because groups are outside the current product scope", () => {
    expect(
      translator.translate(
        {
          event: "MESSAGES_UPSERT",
          instance: "tenant-support",
          data: {
            key: { remoteJid: "120363123456789@g.us", fromMe: false, id: "GROUP-1" },
            message: { conversation: "Grupo" },
          },
        },
        connection,
      ),
    ).toMatchObject({ kind: "ignored", reason: "group_message" });
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
    ).toMatchObject({ kind: "ignored", reason: "unknown_event" });
  });
});
