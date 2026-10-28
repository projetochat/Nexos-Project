import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProvider } from "../generated/prisma";
import { AiProviderService } from "./ai-provider.service";
const secret = "placeholder-value";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const cases = [
  [AiProvider.OPENAI, "https://api.openai.com/v1/models", "authorization", { data: [] }],
  [
    AiProvider.GEMINI,
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    "x-goog-api-key",
    { models: [] },
  ],
  [AiProvider.ANTHROPIC, "https://api.anthropic.com/v1/models?limit=1", "x-api-key", { data: [] }],
  [AiProvider.DEEPSEEK, "https://api.deepseek.com/models", "authorization", { data: [] }],
  [AiProvider.GROQ, "https://api.groq.com/openai/v1/models", "authorization", { data: [] }],
  [
    AiProvider.OPENROUTER,
    "https://openrouter.ai/api/v1/key",
    "authorization",
    { data: { label: "synthetic" } },
  ],
] as const;
describe("credential validation without generation", () => {
  it.each(cases)(
    "authenticates %s only through fixed read metadata endpoint",
    async (provider, url, header, payload) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
      vi.stubGlobal("fetch", fetchMock);
      await new AiProviderService().validateCredential({
        provider,
        apiKey: ` ${secret} `,
        organization: "org-synthetic",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [actual, options] = fetchMock.mock.calls[0];
      expect(actual).toBe(url);
      expect(actual).not.toContain(secret);
      expect(options).toMatchObject({ method: "GET", redirect: "error" });
      expect(options.headers["cache-control"]).toBe("no-store");
      expect(options).not.toHaveProperty("body");
      expect(options.headers[header]).toBe(
        header === "authorization" ? `Bearer ${secret}` : secret,
      );
      if (provider === AiProvider.OPENAI)
        expect(options.headers["OpenAI-Organization"]).toBe("org-synthetic");
    },
  );
  it.each([
    [401, "AI_PROVIDER_CREDENTIAL_INVALID"],
    [403, "AI_PROVIDER_ACCESS_DENIED"],
    [402, "AI_PROVIDER_CREDITS_UNAVAILABLE"],
    [429, "AI_PROVIDER_RATE_LIMITED"],
    [500, "AI_CREDENTIAL_VALIDATION_UNAVAILABLE"],
    [404, "AI_CREDENTIAL_VALIDATION_UNAVAILABLE"],
  ])("keeps authentication failure distinct from HTTP%s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: secret } }, { status: status as number }),
        ),
    );
    const error = await new AiProviderService()
      .validateCredential({ provider: AiProvider.OPENAI, apiKey: secret })
      .catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code });
    expect(JSON.stringify(error.getResponse())).not.toContain(secret);
  });
  it("recognizes Google's explicit invalid-key reason without echoing response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: secret, details: [{ reason: "API_KEY_INVALID" }] } },
            { status: 400 },
          ),
        ),
    );
    await expect(
      new AiProviderService().validateCredential({ provider: AiProvider.GEMINI, apiKey: secret }),
    ).rejects.toMatchObject({ response: { code: "AI_PROVIDER_CREDENTIAL_INVALID" } });
  });
  it.each([
    "bad json",
    JSON.stringify({ error: secret }),
    JSON.stringify({ public_catalog: [] }),
    " ".repeat(262145),
  ])(
    "rejects unreadable or unexpected metadata without treating the key as invalid",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      await expect(
        new AiProviderService().validateCredential({ provider: AiProvider.OPENAI, apiKey: secret }),
      ).rejects.toMatchObject({ response: { code: "AI_CREDENTIAL_VALIDATION_UNAVAILABLE" } });
    },
  );
  it("rejects network and redirect failures safely without echoing the request secret", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`network authorization=${secret}`)));
    const error = await new AiProviderService()
      .validateCredential({ provider: AiProvider.OPENAI, apiKey: secret })
      .catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code: "AI_CREDENTIAL_VALIDATION_UNAVAILABLE" });
    expect(JSON.stringify(error.getResponse())).not.toContain(secret);
  });
  it("times out validation with no retry or generation", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = new AiProviderService()
      .validateCredential({ provider: AiProvider.OPENAI, apiKey: secret })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);
    expect((await result).getResponse()).toMatchObject({ code: "AI_PROVIDER_TIMEOUT" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not contact a provider for an empty key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new AiProviderService().validateCredential({ provider: AiProvider.OPENAI, apiKey: "  " }),
    ).rejects.toMatchObject({ response: { code: "AI_PROVIDER_CREDENTIAL_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
