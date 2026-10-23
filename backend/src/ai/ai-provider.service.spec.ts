import { HttpException, HttpStatus, RequestTimeoutException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiProvider } from "../generated/prisma";
import { AiProviderService, PROVIDER_MODELS } from "./ai-provider.service";

const input = {
  provider: AiProvider.OPENAI,
  model: "gpt-4o",
  apiKey: ["sk", "test", "only"].join("-"),
  prompt: "Retorne JSON.",
  images: [],
};

describe("AiProviderService", () => {
  const originalTimeout = process.env.AI_PROVIDER_TIMEOUT_MS;

  beforeEach(() => {
    process.env.AI_PROVIDER_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalTimeout === undefined) delete process.env.AI_PROVIDER_TIMEOUT_MS;
    else process.env.AI_PROVIDER_TIMEOUT_MS = originalTimeout;
  });

  it("offers Gemini 3.8 Flash using the official model id", () => {
    expect(PROVIDER_MODELS[AiProvider.GEMINI]).toContain("gemini-3.8-flash");
  });

  it("calls Groq through its OpenAI-compatible endpoint", async () => {
    mockResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] });

    await expect(
      new AiProviderService().generate({
        ...input,
        provider: AiProvider.GROQ,
        model: "openai/gpt-oss-20b",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: `Bearer ${input.apiKey}` }),
      }),
    );
  });

  it("calls OpenRouter with a compatible route that preserves required parameters", async () => {
    mockResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] });

    await expect(
      new AiProviderService().generate({
        ...input,
        provider: AiProvider.OPENROUTER,
        model: "openai/gpt-4.1-mini",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const options = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      provider: { require_parameters: true },
      response_format: { type: "json_object" },
    });
  });

  it("returns parsed JSON for a valid provider response", async () => {
    mockResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] });

    await expect(new AiProviderService().generate(input)).resolves.toEqual({ ok: true });
  });

  it.each([
    [400, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_REQUEST_INVALID", "rejeitou os dados"],
    [401, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_CREDENTIAL_INVALID", "API Key"],
    [402, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_CREDITS_UNAVAILABLE", "sem créditos"],
    [403, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_ACCESS_DENIED", "não possui permissão"],
    [404, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_MODEL_NOT_FOUND", "Edite o agente"],
    [408, HttpStatus.GATEWAY_TIMEOUT, "AI_PROVIDER_TIMEOUT", "demorou mais"],
    [409, HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVIDER_CONFLICT", "neste momento"],
    [413, HttpStatus.PAYLOAD_TOO_LARGE, "AI_PROVIDER_PAYLOAD_TOO_LARGE", "excedem o limite"],
    [415, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_MEDIA_UNSUPPORTED", "formato"],
    [422, HttpStatus.UNPROCESSABLE_ENTITY, "AI_PROVIDER_CONTENT_REJECTED", "processar o conteúdo"],
    [500, HttpStatus.BAD_GATEWAY, "AI_PROVIDER_INTERNAL_ERROR", "falha interna"],
    [502, HttpStatus.BAD_GATEWAY, "AI_PROVIDER_BAD_GATEWAY", "seus próprios serviços"],
    [503, HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVIDER_UNAVAILABLE", "indisponível"],
    [504, HttpStatus.GATEWAY_TIMEOUT, "AI_PROVIDER_TIMEOUT", "demorou mais"],
  ])("maps provider HTTP %i to a clear error", async (providerStatus, apiStatus, code, text) => {
    mockResponse(providerStatus, { error: { type: "provider_error" } });

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getStatus()).toBe(apiStatus);
    expect(error.getResponse()).toMatchObject({ code, message: expect.stringContaining(text) });
    expect(JSON.stringify(error.getResponse())).not.toContain(input.apiKey);
  });

  it.each([
    [
      { error: { type: "insufficient_quota", code: "insufficient_quota" } },
      "AI_PROVIDER_QUOTA_EXCEEDED",
      "cota ou os créditos",
    ],
    [
      { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } },
      "AI_PROVIDER_RATE_LIMITED",
      "muitas solicitações",
    ],
    [{ error: {} }, "AI_PROVIDER_LIMIT_REACHED", "cota ou o limite"],
  ])("distinguishes provider limit responses", async (body, code, text) => {
    mockResponse(429, body);

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse()).toMatchObject({ code, message: expect.stringContaining(text) });
  });

  it.each([
    ["ENOTFOUND", "AI_PROVIDER_DNS_FAILED", "não pôde ser localizado"],
    ["ECONNREFUSED", "AI_PROVIDER_CONNECTION_REFUSED", "recusou a conexão"],
    ["ECONNRESET", "AI_PROVIDER_CONNECTION_RESET", "foi interrompida"],
    ["ETIMEDOUT", "AI_PROVIDER_CONNECTION_TIMEOUT", "expirou"],
    ["CERT_HAS_EXPIRED", "AI_PROVIDER_TLS_FAILED", "conexão segura"],
  ])("maps network error %s to a clear error", async (networkCode, code, text) => {
    const cause = Object.assign(new Error("internal network detail"), { code: networkCode });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause })),
    );

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getResponse()).toMatchObject({ code, message: expect.stringContaining(text) });
    expect(JSON.stringify(error.getResponse())).not.toContain("internal network detail");
  });

  it("reports an unreadable successful HTTP body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>upstream error</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getResponse()).toMatchObject({
      code: "AI_PROVIDER_RESPONSE_BODY_INVALID",
      message: expect.stringContaining("não pôde ser lido"),
    });
  });

  it("reports an empty model response", async () => {
    mockResponse(200, { choices: [{ message: { content: "" } }] });

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getResponse()).toMatchObject({
      code: "AI_PROVIDER_RESPONSE_EMPTY",
      message: expect.stringContaining("não retornou conteúdo"),
    });
  });

  it("reports model output that is not valid JSON", async () => {
    mockResponse(200, { choices: [{ message: { content: "resposta sem JSON" } }] });

    const error = await rejectedHttpException(new AiProviderService().generate(input));

    expect(error.getResponse()).toMatchObject({
      code: "AI_MODEL_OUTPUT_INVALID_JSON",
      message: expect.stringContaining("fora do formato esperado"),
    });
  });

  it("reports provider timeout separately", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );

    const pending = new AiProviderService().generate(input).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await pending;

    expect(error).toBeInstanceOf(RequestTimeoutException);
    expect((error as RequestTimeoutException).getResponse()).toMatchObject({
      code: "AI_PROVIDER_TIMEOUT",
      message: expect.stringContaining("demorou mais"),
    });
  });
});

function mockResponse(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

async function rejectedHttpException(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}
