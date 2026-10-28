import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { AiProvider } from "../generated/prisma";

export const PROVIDER_MODELS: Record<AiProvider, readonly string[]> = {
  OPENAI: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  GEMINI: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.8-flash"],
  ANTHROPIC: ["claude-3-5-haiku-latest", "claude-3-7-sonnet-latest", "claude-sonnet-4-0"],
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
  GROQ: ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
  OPENROUTER: [
    "openai/gpt-4.1-mini",
    "openai/gpt-5-mini",
    "google/gemini-3.8-flash",
    "anthropic/claude-sonnet-4.6",
    "qwen/qwen3.8-27b",
  ],
};

export type AiImageInput = { mimeType: string; body: Buffer };

@Injectable()
export class AiProviderService {
  async validateCredential(input: {
    provider: AiProvider;
    apiKey: string;
    organization?: string | null;
  }): Promise<void> {
    const apiKey = input.apiKey.trim();
    const label = providerLabel(input.provider);
    if (!apiKey) throw invalidCredential(label);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const { url, headers } = credentialValidationRequest({ ...input, apiKey });
      const response = await fetch(url, {
        method: "GET",
        headers: { ...headers, "cache-control": "no-store" },
        signal: controller.signal,
        redirect: "error",
      });
      if ([401, 402, 403, 429].includes(response.status)) await response.body?.cancel();
      if (response.status === 401) throw invalidCredential(label);
      if (response.status === 403)
        throw providerException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "AI_PROVIDER_ACCESS_DENIED",
          `${label} não autorizou a validação desta chave. Confira as permissões da API Key.`,
        );
      if (response.status === 429)
        throw providerException(
          HttpStatus.TOO_MANY_REQUESTS,
          "AI_PROVIDER_RATE_LIMITED",
          `${label} limitou as consultas. Aguarde e tente validar a conexão novamente.`,
        );
      if (response.status === 402)
        throw providerException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "AI_PROVIDER_CREDITS_UNAVAILABLE",
          `${label} informou uma pendência de créditos ou faturamento. Não foi possível validar a conexão.`,
        );
      const payload = await readCredentialValidationBody(response);
      if (
        input.provider === AiProvider.GEMINI &&
        response.status === 400 &&
        hasInvalidGoogleKeyReason(payload)
      ) {
        throw invalidCredential(label);
      }
      if (!response.ok || !validCredentialMetadata(input.provider, payload))
        throw credentialValidationUnavailable(label);
    } catch (error) {
      if (controller.signal.aborted)
        throw providerException(
          HttpStatus.GATEWAY_TIMEOUT,
          "AI_PROVIDER_TIMEOUT",
          `${label} demorou para responder. Não foi possível validar a conexão; tente novamente.`,
        );
      if (error instanceof HttpException) throw error;
      throw credentialValidationUnavailable(label);
    } finally {
      clearTimeout(timeout);
    }
  }
  async generate(input: {
    provider: AiProvider;
    model: string;
    apiKey: string;
    organization?: string | null;
    prompt: string;
    images: AiImageInput[];
  }): Promise<unknown> {
    if (!PROVIDER_MODELS[input.provider].includes(input.model)) {
      throw new BadRequestException({
        code: "AI_MODEL_NOT_ALLOWED",
        message: `O modelo ${input.model} não é permitido para ${providerLabel(input.provider)}. Selecione outro modelo.`,
      });
    }
    const timeoutMs = boundedNumber(process.env.AI_PROVIDER_TIMEOUT_MS, 30_000, 1_000, 120_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.request(input, controller.signal);
      if (!response.ok) throw await providerHttpException(input, response);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw providerException(
          HttpStatus.BAD_GATEWAY,
          "AI_PROVIDER_RESPONSE_BODY_INVALID",
          `${providerLabel(input.provider)} respondeu, mas o conteúdo recebido não pôde ser lido. Tente novamente.`,
        );
      }
      return extractJson(input.provider, payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new RequestTimeoutException({
          code: "AI_PROVIDER_TIMEOUT",
          message: `${providerLabel(input.provider)} demorou mais que o permitido para responder. Tente novamente.`,
        });
      }
      if (error instanceof HttpException) throw error;
      throw providerConnectionException(input.provider, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private request(
    input: {
      provider: AiProvider;
      model: string;
      apiKey: string;
      organization?: string | null;
      prompt: string;
      images: AiImageInput[];
    },
    signal: AbortSignal,
  ) {
    if (input.provider === AiProvider.GEMINI) {
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
        {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-goog-api-key": input.apiKey },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: input.prompt },
                  ...input.images.map((image) => ({
                    inlineData: { mimeType: image.mimeType, data: image.body.toString("base64") },
                  })),
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        },
      );
    }
    if (input.provider === AiProvider.ANTHROPIC) {
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: 3000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: input.prompt },
                ...input.images.map((image) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mimeType,
                    data: image.body.toString("base64"),
                  },
                })),
              ],
            },
          ],
        }),
      });
    }
    const deepSeek = input.provider === AiProvider.DEEPSEEK;
    const groq = input.provider === AiProvider.GROQ;
    const openRouter = input.provider === AiProvider.OPENROUTER;
    const content =
      deepSeek || groq || input.images.length === 0
        ? input.prompt
        : [
            { type: "text", text: input.prompt },
            ...input.images.map((image) => ({
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.body.toString("base64")}` },
            })),
          ];
    return fetch(
      deepSeek
        ? "https://api.deepseek.com/chat/completions"
        : groq
          ? "https://api.groq.com/openai/v1/chat/completions"
          : openRouter
            ? "https://openrouter.ai/api/v1/chat/completions"
            : "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
          ...(input.provider === AiProvider.OPENAI && input.organization
            ? { "OpenAI-Organization": input.organization }
            : {}),
        },
        body: JSON.stringify({
          model: input.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          ...(openRouter ? { provider: { require_parameters: true } } : {}),
          messages: [{ role: "user", content }],
        }),
      },
    );
  }
}

function extractJson(provider: AiProvider, payload: unknown) {
  const root = record(payload);
  let text: unknown;
  if (provider === AiProvider.GEMINI) {
    text = record(recordArray(root.candidates)[0]).content;
    text = recordArray(record(text).parts)[0];
    text = record(text).text;
  } else if (provider === AiProvider.ANTHROPIC) {
    text = record(recordArray(root.content)[0]).text;
  } else {
    text = record(record(recordArray(root.choices)[0]).message).content;
  }
  const label = providerLabel(provider);
  if (typeof text !== "string" || !text.trim()) {
    throw providerException(
      HttpStatus.BAD_GATEWAY,
      "AI_PROVIDER_RESPONSE_EMPTY",
      `${label} não retornou conteúdo para esta solicitação. Tente novamente.`,
    );
  }
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw providerException(
      HttpStatus.BAD_GATEWAY,
      "AI_MODEL_OUTPUT_INVALID_JSON",
      `${label} retornou uma resposta fora do formato esperado. Tente novamente.`,
    );
  }
}

async function providerHttpException(
  input: { provider: AiProvider; model: string },
  response: Response,
) {
  const label = providerLabel(input.provider);
  const status = response.status;
  if (status === 400) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_REQUEST_INVALID",
      `${label} rejeitou os dados enviados. Revise o modelo, o prompt e os anexos.`,
    );
  }
  if (status === 401) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_CREDENTIAL_INVALID",
      `A API Key configurada para ${label} é inválida ou foi revogada. Atualize a conexão de IA.`,
    );
  }
  if (status === 402) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_CREDITS_UNAVAILABLE",
      `A conta de ${label} está sem créditos ou com faturamento pendente. Verifique o plano e os créditos da conta.`,
    );
  }
  if (status === 403) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_ACCESS_DENIED",
      `A API Key de ${label} não possui permissão para usar o modelo ${input.model}. Verifique o projeto e as permissões da conexão.`,
    );
  }
  if (status === 404) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_MODEL_NOT_FOUND",
      `O modelo ${input.model} não está disponível para esta conexão de ${label}. Edite o agente e selecione outro modelo habilitado para esta API Key.`,
    );
  }
  if (status === 408 || status === 504) {
    return providerException(
      HttpStatus.GATEWAY_TIMEOUT,
      "AI_PROVIDER_TIMEOUT",
      `${label} demorou mais que o permitido para responder. Tente novamente.`,
    );
  }
  if (status === 409) {
    return providerException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "AI_PROVIDER_CONFLICT",
      `${label} não conseguiu processar a solicitação neste momento. Aguarde alguns instantes e tente novamente.`,
    );
  }
  if (status === 413) {
    return providerException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      "AI_PROVIDER_PAYLOAD_TOO_LARGE",
      `O texto ou os anexos enviados excedem o limite de ${label}. Reduza o conteúdo e tente novamente.`,
    );
  }
  if (status === 415) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_MEDIA_UNSUPPORTED",
      `${label} não aceita o formato de um dos anexos enviados. Remova ou substitua o anexo.`,
    );
  }
  if (status === 422) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "AI_PROVIDER_CONTENT_REJECTED",
      `${label} não conseguiu processar o conteúdo enviado. Revise o prompt e os anexos.`,
    );
  }
  if (status === 429) {
    const limit = await providerLimitKind(response);
    if (limit === "quota") {
      return providerException(
        HttpStatus.TOO_MANY_REQUESTS,
        "AI_PROVIDER_QUOTA_EXCEEDED",
        `A cota ou os créditos da conta de ${label} foram esgotados. Verifique os limites e o faturamento da conta.`,
      );
    }
    if (limit === "rate") {
      return providerException(
        HttpStatus.TOO_MANY_REQUESTS,
        "AI_PROVIDER_RATE_LIMITED",
        `${label} recebeu muitas solicitações em pouco tempo. Aguarde alguns instantes e tente novamente.`,
      );
    }
    return providerException(
      HttpStatus.TOO_MANY_REQUESTS,
      "AI_PROVIDER_LIMIT_REACHED",
      `${label} atingiu a cota ou o limite de requisições. Verifique os créditos e limites da conta antes de tentar novamente.`,
    );
  }
  if (status === 500) {
    return providerException(
      HttpStatus.BAD_GATEWAY,
      "AI_PROVIDER_INTERNAL_ERROR",
      `${label} apresentou uma falha interna. Aguarde alguns instantes e tente novamente.`,
    );
  }
  if (status === 502) {
    return providerException(
      HttpStatus.BAD_GATEWAY,
      "AI_PROVIDER_BAD_GATEWAY",
      `${label} recebeu uma resposta inválida de seus próprios serviços. Tente novamente em alguns instantes.`,
    );
  }
  if (status === 503) {
    return providerException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "AI_PROVIDER_UNAVAILABLE",
      `${label} está temporariamente indisponível ou sobrecarregada. Tente novamente mais tarde.`,
    );
  }
  if (status >= 400 && status < 500) {
    return providerException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `AI_PROVIDER_HTTP_${status}`,
      `${label} recusou a solicitação com o código HTTP ${status}. Revise a configuração da conexão e do modelo.`,
    );
  }
  if (status >= 500) {
    return providerException(
      HttpStatus.BAD_GATEWAY,
      `AI_PROVIDER_HTTP_${status}`,
      `${label} apresentou uma falha temporária com o código HTTP ${status}. Tente novamente mais tarde.`,
    );
  }
  return providerException(
    HttpStatus.BAD_GATEWAY,
    `AI_PROVIDER_HTTP_${status}`,
    `${label} retornou o código HTTP inesperado ${status}. Verifique a configuração da conexão.`,
  );
}

async function providerLimitKind(response: Response): Promise<"quota" | "rate" | "unknown"> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return "unknown";
  }
  const error = record(record(payload).error);
  const markers = [error.code, error.type, error.status, record(payload).status]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/(insufficient_quota|quota_exceeded|billing|credit|balance)/.test(markers)) return "quota";
  if (/(rate_limit|too_many_requests|resource_exhausted)/.test(markers)) return "rate";
  return "unknown";
}

function providerConnectionException(provider: AiProvider, error: unknown) {
  const label = providerLabel(provider);
  const code = nestedErrorCode(error);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return providerException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "AI_PROVIDER_DNS_FAILED",
      `O endereço de ${label} não pôde ser localizado. Verifique a conexão de rede do servidor.`,
    );
  }
  if (code === "ECONNREFUSED") {
    return providerException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "AI_PROVIDER_CONNECTION_REFUSED",
      `${label} recusou a conexão. Verifique a disponibilidade do provedor e tente novamente.`,
    );
  }
  if (code === "ECONNRESET") {
    return providerException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "AI_PROVIDER_CONNECTION_RESET",
      `A conexão com ${label} foi interrompida antes da resposta. Tente novamente.`,
    );
  }
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return providerException(
      HttpStatus.GATEWAY_TIMEOUT,
      "AI_PROVIDER_CONNECTION_TIMEOUT",
      `A conexão com ${label} expirou antes de receber uma resposta. Tente novamente.`,
    );
  }
  if (code?.includes("CERT") || code?.startsWith("ERR_TLS")) {
    return providerException(
      HttpStatus.BAD_GATEWAY,
      "AI_PROVIDER_TLS_FAILED",
      `Não foi possível estabelecer uma conexão segura com ${label}. Verifique os certificados e a rede do servidor.`,
    );
  }
  return providerException(
    HttpStatus.SERVICE_UNAVAILABLE,
    "AI_PROVIDER_NETWORK_ERROR",
    `A comunicação com ${label} falhou antes de receber uma resposta. Verifique a rede do servidor e tente novamente.`,
  );
}

function providerException(status: number, code: string, message: string) {
  return new HttpException({ code, message }, status);
}

function providerLabel(provider: AiProvider) {
  return {
    [AiProvider.OPENAI]: "OpenAI",
    [AiProvider.GEMINI]: "Gemini",
    [AiProvider.ANTHROPIC]: "Claude",
    [AiProvider.DEEPSEEK]: "DeepSeek",
    [AiProvider.GROQ]: "Groq",
    [AiProvider.OPENROUTER]: "OpenRouter",
  }[provider];
}

function nestedErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = "code" in error && typeof error.code === "string" ? error.code : undefined;
  if (direct) return direct;
  return "cause" in error ? nestedErrorCode(error.cause) : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function invalidCredential(label: string) {
  return providerException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    "AI_PROVIDER_CREDENTIAL_INVALID",
    `Chave inválida ou revogada em ${label}. Revise a API Key e tente novamente.`,
  );
}

function credentialValidationUnavailable(label: string) {
  return providerException(
    HttpStatus.SERVICE_UNAVAILABLE,
    "AI_CREDENTIAL_VALIDATION_UNAVAILABLE",
    `Não foi possível validar a conexão com ${label}. Tente novamente em instantes.`,
  );
}

function credentialValidationRequest(input: {
  provider: AiProvider;
  apiKey: string;
  organization?: string | null;
}): { url: string; headers: Record<string, string> } {
  const bearer = { authorization: `Bearer ${input.apiKey}` };
  switch (input.provider) {
    case AiProvider.OPENAI:
      return {
        url: "https://api.openai.com/v1/models",
        headers: {
          ...bearer,
          ...(input.organization?.trim()
            ? { "OpenAI-Organization": input.organization.trim() }
            : {}),
        },
      };
    case AiProvider.GEMINI:
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        headers: { "x-goog-api-key": input.apiKey },
      };
    case AiProvider.ANTHROPIC:
      return {
        url: "https://api.anthropic.com/v1/models?limit=1",
        headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" },
      };
    case AiProvider.DEEPSEEK:
      return { url: "https://api.deepseek.com/models", headers: bearer };
    case AiProvider.GROQ:
      return { url: "https://api.groq.com/openai/v1/models", headers: bearer };
    case AiProvider.OPENROUTER:
      return { url: "https://openrouter.ai/api/v1/key", headers: bearer };
    default:
      throw new BadRequestException({
        code: "AI_PROVIDER_NOT_ALLOWED",
        message: "Provedor de IA inválido.",
      });
  }
}

async function readCredentialValidationBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262_144) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function validCredentialMetadata(provider: AiProvider, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || "error" in payload)
    return false;
  const data = payload as Record<string, unknown>;
  if (provider === AiProvider.GEMINI) return Array.isArray(data.models);
  if (provider === AiProvider.OPENROUTER)
    return (
      !!data.data &&
      typeof data.data === "object" &&
      !Array.isArray(data.data) &&
      "label" in data.data &&
      typeof data.data.label === "string"
    );
  return Array.isArray(data.data);
}

function hasInvalidGoogleKeyReason(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return false;
  const error = payload.error;
  if (!error || typeof error !== "object" || !("details" in error) || !Array.isArray(error.details))
    return false;
  return error.details.some(
    (detail: unknown) =>
      !!detail &&
      typeof detail === "object" &&
      "reason" in detail &&
      ["API_KEY_INVALID", "API_KEY_EXPIRED"].includes(String(detail.reason)),
  );
}
