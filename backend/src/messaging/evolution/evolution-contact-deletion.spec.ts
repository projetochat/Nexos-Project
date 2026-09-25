import { afterEach, describe, expect, it, vi } from "vitest";
import { EvolutionWebhookTranslator } from "./evolution-webhook.translator";
import { EvolutionClient } from "./evolution.client";
import { MessagingInboundService } from "../messaging-inbound.service";
import { MessageType } from "../../generated/prisma";

const connection = { tenantId: "test-tenant", id: "test-connection" };
const translator = new EvolutionWebhookTranslator();
const card = (name: string) =>
  `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nTEL:+5511999990000\r\nEND:VCARD`;
const payload = (message: Record<string, unknown>) => ({
  instance: "test-instance",
  event: "messages.upsert",
  data: {
    key: { id: "envelope", fromMe: true, remoteJid: "5511999990000@s.whatsapp.net" },
    message,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("contact sharing and WhatsApp deletions", () => {
  it("stores every card in a WhatsApp contactsArrayMessage", async () => {
    const result = translator.translate(
      payload({
        contactsArrayMessage: {
          contacts: [
            { displayName: "Ana", vcard: card("Ana") },
            { displayName: "Bia", vcard: card("Bia") },
          ],
        },
      }),
      connection,
    );
    expect(result.kind).toBe("inbound");
    if (result.kind !== "inbound") throw new Error("Expected contact message");
    expect(result.event.content).toBe("[contato] Ana, Bia");
    expect(result.event.media?.inlineBody?.toString()).toBe(`${card("Ana")}\r\n${card("Bia")}`);
    const storeDownloaded = vi.fn().mockResolvedValue({ objectKey: "test/contact.vcf" });
    const getBase64FromMediaMessage = vi
      .fn()
      .mockRejectedValue(new Error("Contacts cannot be downloaded"));
    const service = new MessagingInboundService(
      {} as never,
      { storeDownloaded } as never,
      undefined,
      { getBase64FromMediaMessage } as never,
    );
    await service["downloadInboundMedia"](result.event, "conversation", "instance");
    expect(getBase64FromMediaMessage).not.toHaveBeenCalled();
    expect(storeDownloaded).toHaveBeenCalledWith(
      expect.objectContaining({
        body: result.event.media?.inlineBody,
        mimeType: "text/vcard",
        messageType: MessageType.DOCUMENT,
      }),
    );
  });

  it.each([0, "0", "REVOKE"])(
    "recognizes upsert revocation type %s using the target key",
    (type) => {
      const result = translator.translate(
        payload({ protocolMessage: { type, key: { id: "original" } } }),
        connection,
      );
      expect(result).toMatchObject({
        kind: "delete",
        event: {
          providerMessageId: "original",
          tenantId: connection.tenantId,
          connectionId: connection.id,
        },
      });
    },
  );

  it("recognizes deletion notifications with a direct key", () => {
    const result = translator.translate(
      {
        instance: "instance",
        event: "MESSAGES_DELETE",
        data: { id: "original", remoteJid: "5511999990000@s.whatsapp.net" },
      },
      connection,
    );
    expect(result).toMatchObject({ kind: "delete", event: { providerMessageId: "original" } });
  });

  it("does not interpret unrelated protocol messages as deletion", () => {
    expect(
      translator.translate(
        payload({ protocolMessage: { type: 3, key: { id: "original" } } }),
        connection,
      ).kind,
    ).toBe("ignored");
  });

  it("stores the deletion marker only within the connection and tenant and publishes refresh", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "local", conversationId: "conversation", interactiveData: null });
    const update = vi.fn().mockResolvedValue({});
    const publishConversationUpdated = vi.fn();
    await new MessagingInboundService({ message: { findFirst, update } } as never, undefined, {
      publishConversationUpdated,
    } as never).processDeletion({
      tenantId: connection.tenantId,
      connectionId: connection.id,
      providerMessageId: "original",
      occurredAt: new Date("2026-09-22T12:00:00Z"),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          providerMessageId: "original",
        },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          interactiveData: expect.objectContaining({ deletedForEveryone: true }),
        }),
      }),
    );
    expect(update.mock.calls[0]?.[0]?.data).not.toHaveProperty("content");
    expect(publishConversationUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "message.deleted" }),
    );
  });

  it("subscribes to deletion events without contacting a provider", async () => {
    vi.stubEnv("EVOLUTION_BASE_URL", "http://test.invalid");
    vi.stubEnv("EVOLUTION_API_KEY", "test-key");
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await new EvolutionClient().setWebhook({
      instanceName: "instance",
      webhookUrl: "http://test.invalid/webhook",
    });
    const options = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string).webhook.events).toContain("MESSAGES_DELETE");
  });
});
