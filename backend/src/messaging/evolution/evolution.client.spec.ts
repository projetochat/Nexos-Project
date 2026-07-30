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
      number: "5511999990000",
      text: "Ola",
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

  it("maps auth failures to canonical errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response({ message: "bad key" }, 401));

    await expect(
      new EvolutionClient().sendText({ instanceName: "i", number: "1", text: "x" }),
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
