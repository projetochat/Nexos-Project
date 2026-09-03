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

  it("registers per-instance webhook with jwt_key and event filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    globalThis.fetch = fetchMock;

    await new EvolutionClient().setWebhook({
      instanceName: "instance-a",
      webhookUrl: "http://host.docker.internal:3001/api/webhooks/evolution",
      webhookSecret: "webhook-secret",
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
              "MESSAGES_UPDATE",
              "SEND_MESSAGE_UPDATE",
              "QRCODE_UPDATED",
              "CONNECTION_UPDATE",
            ],
          },
        }),
      }),
    );
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
        headers: expect.objectContaining({ apikey: "test-key" }),
        body: JSON.stringify({
          message: { key: { id: "IMG-1" }, message: { imageMessage: { directPath: "/media" } } },
        }),
      }),
    );
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
