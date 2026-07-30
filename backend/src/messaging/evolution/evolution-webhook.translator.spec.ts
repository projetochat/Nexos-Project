import { describe, expect, it } from "vitest";
import { MessageStatus } from "../../generated/prisma";
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

  it("ignores unknown events safely", () => {
    expect(
      translator.translate({ event: "labels.edit", instance: "x", data: {} }, connection),
    ).toMatchObject({ kind: "ignored", reason: "unknown_event" });
  });
});
