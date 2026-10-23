import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingErrorCode } from "../messaging.contracts";
import { EvolutionClient } from "./evolution.client";

describe("EvolutionClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_BASE_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends text with auth header and canonical payload mapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ key: { id: "MSG1" }, status: "SENT" }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().sendText({
      instanceName: "instance-a",
      payload: { number: "5511999990000", text: "Ola" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/message/sendText/instance-a",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({ number: "5511999990000", text: "Ola" }),
      }),
    );
  });

  it("updates a group picture with the current Evolution contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ success: true }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().updateGroupPicture({
      instanceName: "instance-a",
      groupJid: "120363428119237023@g.us",
      image: "data:image/jpeg;base64,aGVsbG8=",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/group/updateGroupPicture/instance-a?groupJid=120363428119237023%40g.us",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({
          groupJid: "120363428119237023@g.us",
          image: "aGVsbG8=",
        }),
      }),
    );
  });

  it("falls back to the legacy group-picture endpoint when PUT is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "Method not allowed" }, 405))
      .mockResolvedValueOnce(response({ success: true }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().updateGroupPicture({
      instanceName: "instance-a",
      groupJid: "120363428119237023@g.us",
      image: "data:image/jpeg;base64,aGVsbG8=",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://evolution.local/group/updateGroupPicture/instance-a?groupJid=120363428119237023%40g.us",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends reactions with Evolution v2.3.7 root key/reaction payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ key: { id: "MSG1" }, status: "SENT" }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().sendReaction({
      instanceName: "instance-a",
      payload: {
        key: { id: "MSG1", remoteJid: "5511999990000@s.whatsapp.net", fromMe: false },
        reaction: "",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/message/sendReaction/instance-a",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          key: { id: "MSG1", remoteJid: "5511999990000@s.whatsapp.net", fromMe: false },
          reaction: "",
        }),
      }),
    );
  });

  it("blocks a contact with the Evolution v2 chat contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ success: true }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().updateBlockStatus({
      instanceName: "instance-a",
      number: "5511999990000",
      status: "block",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/chat/updateBlockStatus/instance-a",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({ number: "5511999990000", status: "block" }),
      }),
    );
  });

  it("deletes a message only through the confirmed Evolution v2.3.7 contract", async () => {
    const key = { id: "MSG1", remoteJid: "5511999990000@s.whatsapp.net", fromMe: true };
    const fetchMock = vi.fn().mockResolvedValue(response({ key }));
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().deleteMessage({
        instanceName: "instance-a",
        messageId: key.id,
        remoteJid: key.remoteJid,
      }),
    ).resolves.toMatchObject({ key });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/chat/deleteMessageForEveryone/instance-a",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ remoteJid: key.remoteJid, fromMe: true, id: key.id }),
      }),
    );
  });

  it("rejects an ambiguous deletion response without calling a legacy fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ success: true }));
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().deleteMessage({
        instanceName: "instance-a",
        messageId: "MSG1",
        remoteJid: "5511999990000@s.whatsapp.net",
      }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("registers per-instance webhook with jwt_key and event filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().setWebhook({
      instanceName: "instance-a",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: ["webhook", "secret"].join("-"),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/webhook/set/instance-a",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: "http://host.docker.internal:3001/api/webhooks/evolution",
            byEvents: false,
            base64: false,
            headers: { jwt_key: "webhook-secret" },
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_EDITED",
              "MESSAGES_UPDATE",
              "MESSAGES_DELETE",
              "SEND_MESSAGE_UPDATE",
              "QRCODE_UPDATED",
              "CONNECTION_UPDATE",
            ],
          },
        }),
      }),
    );
  });

  it("reads the webhook from Evolution's dedicated endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        enabled: true,
        url: "http://host.docker.internal:3001/api/webhooks/evolution",
        events: ["MESSAGES_UPSERT"],
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(new EvolutionClient().findWebhook("instance-a")).resolves.toMatchObject({
      enabled: true,
      events: ["MESSAGES_UPSERT"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/webhook/find/instance-a",
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "test-key" }) }),
    );
  });

  it("rejects an Evolution HTTP 200 response that carries a semantic error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(response({ error: true, message: "Instance unavailable" }));

    await expect(new EvolutionClient().connect("instance-a")).rejects.toMatchObject({
      code: MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      retryable: true,
      httpStatus: 502,
    });
  });

  it("downloads inbound media through Evolution getBase64FromMediaMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        mimetype: "image/jpeg",
        fileName: "foto.jpg",
        base64: "data:image/jpeg;base64,aGVsbG8=",
      }),
    );
    globalThis.fetch = fetchMock;

    const result = await new EvolutionClient().getBase64FromMediaMessage({
      instanceName: "instance-a",
      message: { key: { id: "IMG-1" }, message: { imageMessage: { directPath: "/media" } } },
    });

    expect(result.body.toString("utf8")).toBe("hello");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.fileName).toBe("foto.jpg");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/chat/getBase64FromMediaMessage/instance-a",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({
          message: { key: { id: "IMG-1" }, message: { imageMessage: { directPath: "/media" } } },
        }),
      }),
    );
  });

  it("stops an oversized encoded media response before decoding it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ base64: "A".repeat(70_000) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().getBase64FromMediaMessage({
        instanceName: "instance-a",
        message: { key: { id: "IMG-LARGE" } },
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.MEDIA_DOWNLOAD_FAILED });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects decoded base64 media larger than its message-type limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ base64: Buffer.alloc(20, 1).toString("base64") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().getBase64FromMediaMessage({
        instanceName: "instance-a",
        message: { key: { id: "IMG-DECODED-LARGE" } },
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.MEDIA_DOWNLOAD_FAILED });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fetches group info with Evolution v2.3.7 query contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ subject: "Como treinar seu dragao" }));
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().findGroupInfo({
        instanceName: "instance-a",
        groupJid: "120363428119237023@g.us",
      }),
    ).resolves.toMatchObject({ subject: "Como treinar seu dragao" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution.local/group/findGroupInfos/instance-a?groupJid=120363428119237023%40g.us",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects an invalid group-list envelope instead of treating it as an empty snapshot", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response({ unexpected: true }));

    await expect(
      new EvolutionClient().fetchGroups({ instanceName: "instance-a" }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD });
  });

  it("rejects a partially malformed group list", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        response([
          { id: "120363405324564520@g.us", subject: "Grupo válido" },
          { subject: "Sem id" },
        ]),
      );

    await expect(
      new EvolutionClient().fetchGroups({ instanceName: "instance-a" }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.INVALID_PROVIDER_PAYLOAD });
  });

  it("maps detailed group participants from Evolution responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: "120363405324564520@g.us",
        subject: "Os 3 fas de quilos mortais",
        participants: {
          "5562999991111@s.whatsapp.net": {
            id: "5562999991111@s.whatsapp.net",
            name: "Douglas",
            admin: "admin",
          },
          "5562888882222@s.whatsapp.net": {
            id: "5562888882222@s.whatsapp.net",
            notify: "Jullya",
          },
        },
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().findGroupInfo({
        instanceName: "instance-a",
        groupJid: "120363405324564520@g.us",
      }),
    ).resolves.toMatchObject({
      subject: "Os 3 fas de quilos mortais",
      participants: [
        {
          externalParticipantId: "5562999991111@s.whatsapp.net",
          phone: "5562999991111",
          displayName: "Douglas",
          isAdmin: true,
        },
        {
          externalParticipantId: "5562888882222@s.whatsapp.net",
          phone: "5562888882222",
          displayName: "Jullya",
          isAdmin: false,
        },
      ],
    });
  });

  it("includes the group creator when Evolution returns the owner outside participants", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      response({
        id: "120363405324564520@g.us",
        subject: "Trixus - MELHORIAS",
        owner: "5562981147652@s.whatsapp.net",
        participants: [
          {
            id: "5562996171414@s.whatsapp.net",
            name: "FLOWID-LOCALHOST",
          },
        ],
      }),
    );

    await expect(
      new EvolutionClient().findGroupInfo({
        instanceName: "instance-a",
        groupJid: "120363405324564520@g.us",
      }),
    ).resolves.toMatchObject({
      participants: [
        expect.objectContaining({
          externalParticipantId: "5562996171414@s.whatsapp.net",
          isSuperAdmin: false,
        }),
        expect.objectContaining({
          externalParticipantId: "5562981147652@s.whatsapp.net",
          phone: "5562981147652",
          isAdmin: true,
          isSuperAdmin: true,
        }),
      ],
    });
  });

  it("marks an owner already present in participants as creator without duplicating it", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      response({
        id: "120363405324564520@g.us",
        subject: "Trixus - MELHORIAS",
        owner: "5562981147652@s.whatsapp.net",
        participants: [
          {
            id: "5562981147652@s.whatsapp.net",
            name: "Douglas Rezende",
            admin: "admin",
          },
        ],
      }),
    );

    const group = await new EvolutionClient().findGroupInfo({
      instanceName: "instance-a",
      groupJid: "120363405324564520@g.us",
    });

    expect(group?.participants).toEqual([
      expect.objectContaining({
        externalParticipantId: "5562981147652@s.whatsapp.net",
        displayName: "Douglas Rezende",
        isAdmin: true,
        isSuperAdmin: true,
      }),
    ]);
  });

  it("maps the real LID and phoneNumber shape returned for group participants", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      response({
        id: "120363428331401226@g.us",
        subject: "Trixus - MELHORIAS",
        owner: "186311537357054@lid",
        participants: [
          {
            id: "178215842742477@lid",
            phoneNumber: "556296171414@s.whatsapp.net",
            admin: null,
          },
          {
            id: "186311537357054@lid",
            phoneNumber: "556281147652@s.whatsapp.net",
            admin: "superadmin",
          },
        ],
      }),
    );

    const group = await new EvolutionClient().findGroupInfo({
      instanceName: "instance-a",
      groupJid: "120363428331401226@g.us",
    });

    expect(group?.participants).toEqual([
      expect.objectContaining({
        externalParticipantId: "178215842742477@lid",
        phone: "556296171414",
        isSuperAdmin: false,
      }),
      expect.objectContaining({
        externalParticipantId: "186311537357054@lid",
        phone: "556281147652",
        isAdmin: true,
        isSuperAdmin: true,
      }),
    ]);
  });

  it("keeps group descriptions and does not treat LIDs as phone numbers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: "120363405324564520@g.us",
        subject: "Grupo LID",
        description: "Descrição sincronizada",
        participants: [
          {
            id: "123456789012345@lid",
            pushName: "Instância A",
            admin: "SuperAdmin",
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().findGroupInfo({
        instanceName: "instance-a",
        groupJid: "120363405324564520@g.us",
      }),
    ).resolves.toMatchObject({
      descriptionPresent: true,
      description: "Descrição sincronizada",
      participants: [
        {
          externalParticipantId: "123456789012345@lid",
          phone: null,
          lid: "123456789012345@lid",
          displayName: "Instância A",
          isSuperAdmin: true,
        },
      ],
    });
  });

  it("maps contacts without deriving phone numbers from internal ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        {
          id: "internal-contact-123",
          remoteJid: "5562999991111:12@s.whatsapp.net",
          contactName: "Douglas Rezende",
          profilePicUrl: "https://whatsapp.test/profile.jpg",
        },
        {
          id: "internal-contact-456",
          number: 6292728679,
          shortName: "Contato Agenda",
        },
      ]),
    );
    globalThis.fetch = fetchMock;

    await expect(
      new EvolutionClient().findContacts({ instanceName: "instance-a" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "internal-contact-123",
        remoteJid: "5562999991111:12@s.whatsapp.net",
        number: null,
        contactName: "Douglas Rezende",
        profilePictureUrl: "https://whatsapp.test/profile.jpg",
      }),
      expect.objectContaining({
        id: "internal-contact-456",
        number: "6292728679",
        shortName: "Contato Agenda",
      }),
    ]);
  });

  it("fetches and deletes Evolution instances", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ name: "instance-a", connectionStatus: "open" }]))
      .mockResolvedValueOnce(response({ ok: true }));
    globalThis.fetch = fetchMock;

    await expect(new EvolutionClient().findInstance("instance-a")).resolves.toMatchObject({
      name: "instance-a",
    });
    await new EvolutionClient().deleteInstance("instance-a");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://evolution.local/instance/fetchInstances?instanceName=instance-a",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://evolution.local/instance/delete/instance-a",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("treats missing instance lookup as null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response({ message: "Not Found" }, 404));

    await expect(new EvolutionClient().findInstance("missing-instance")).resolves.toBeNull();
  });

  it("maps auth failures to canonical errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response({ message: "bad key" }, 401));

    await expect(
      new EvolutionClient().sendText({ instanceName: "i", payload: { number: "1", text: "x" } }),
    ).rejects.toMatchObject({ code: MessagingErrorCode.AUTHENTICATION_FAILURE });
  });

  it("fails safely when Evolution is not configured", async () => {
    process.env.EVOLUTION_BASE_URL = "";
    process.env.EVOLUTION_API_KEY = "";

    await expect(new EvolutionClient().connectionState("i")).rejects.toMatchObject({
      code: MessagingErrorCode.PROVIDER_UNAVAILABLE,
    });
  });
});

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
