import { MessagingErrorCode, MessagingProviderError } from "../messaging.contracts";

export type EvolutionProviderErrorInput = {
  status?: number | null;
  statusText?: string | null;
  data?: unknown;
  code?: string | null;
  cause?: unknown;
  endpointPath?: string | null;
  method?: string | null;
  timeout?: boolean;
};

const RETRYABLE_NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const PERMANENT_HTTP = new Set([400, 401, 403, 404, 422]);

export function classifyEvolutionProviderError(input: EvolutionProviderErrorInput) {
  const validationErrors = validationErrorsFromData(input.data);
  const providerCode = validationErrors.length
    ? "VALIDATION_ERROR"
    : sanitizeToken(input.code ?? providerCodeFromData(input.data));
  const providerMessage = sanitizeProviderMessage(input.data, input.statusText, input.code);
  const status = input.status ?? undefined;
  const networkCode = sanitizeToken(input.code);
  const unknownOutcome =
    !!input.timeout || networkCode === "ECONNRESET" || networkCode === "ETIMEDOUT";

  if (input.timeout) {
    return providerError(
      MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      "Evolution API request timed out.",
      true,
      status,
      providerCode,
      input,
      unknownOutcome,
    );
  }
  if (networkCode && RETRYABLE_NETWORK_CODES.has(networkCode)) {
    return providerError(
      MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      providerMessage || "Evolution API network failure.",
      true,
      status,
      providerCode ?? networkCode,
      input,
      unknownOutcome,
    );
  }
  if (status === 401 || status === 403) {
    return providerError(
      MessagingErrorCode.AUTHENTICATION_FAILURE,
      providerMessage || "Evolution authentication failed.",
      false,
      status,
      providerCode,
      input,
    );
  }
  if (validationErrors.length) {
    return providerError(
      MessagingErrorCode.INVALID_PROVIDER_PAYLOAD,
      validationErrors.join(", "),
      false,
      status,
      providerCode,
      input,
    );
  }
  if (status === 400 || status === 422) {
    return providerError(
      looksLikeInvalidRecipient(providerMessage)
        ? MessagingErrorCode.INVALID_RECIPIENT
        : MessagingErrorCode.INVALID_PROVIDER_PAYLOAD,
      providerMessage || "Evolution rejected the outbound payload.",
      false,
      status,
      providerCode,
      input,
    );
  }
  if (status === 404) {
    return providerError(
      MessagingErrorCode.PROVIDER_UNAVAILABLE,
      providerMessage || "Evolution instance or endpoint was not found.",
      false,
      status,
      providerCode,
      input,
    );
  }
  if (status === 429) {
    return providerError(
      MessagingErrorCode.RATE_LIMITED,
      providerMessage || "Evolution rate limit reached.",
      true,
      status,
      providerCode,
      input,
    );
  }
  if (status && RETRYABLE_HTTP.has(status)) {
    return providerError(
      MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
      providerMessage || "Evolution API temporary failure.",
      true,
      status,
      providerCode,
      input,
    );
  }
  if (status && PERMANENT_HTTP.has(status)) {
    return providerError(
      MessagingErrorCode.DELIVERY_REJECTED,
      providerMessage || "Evolution rejected the request.",
      false,
      status,
      providerCode,
      input,
    );
  }
  return providerError(
    MessagingErrorCode.PROVIDER_UNAVAILABLE,
    providerMessage || "Evolution API is unavailable.",
    true,
    status,
    providerCode,
    input,
    unknownOutcome,
  );
}

function providerError(
  code: MessagingErrorCode,
  message: string,
  retryable: boolean,
  status: number | undefined,
  providerCode: string | null,
  input: EvolutionProviderErrorInput,
  unknownOutcome = false,
) {
  return new MessagingProviderError(
    code,
    sanitizeProviderText(message),
    retryable,
    status,
    providerCode,
    input.endpointPath,
    input.method,
    unknownOutcome,
  );
}

function providerCodeFromData(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const value = (data as { code?: unknown; error?: unknown; statusCode?: unknown }).code;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function sanitizeProviderMessage(data: unknown, statusText?: string | null, code?: string | null) {
  const raw =
    messageFromData(data) ??
    (typeof statusText === "string" && statusText ? statusText : null) ??
    (typeof code === "string" && code ? code : null);
  return raw ? sanitizeProviderText(raw) : null;
}

function messageFromData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value =
    (data as { message?: unknown; error?: unknown }).message ?? (data as { error?: unknown }).error;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const nested = (value as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  return null;
}

function validationErrorsFromData(data: unknown) {
  if (!data || typeof data !== "object") return [];
  const value = (data as { message?: unknown; error?: unknown }).message;
  const error = (data as { error?: unknown }).error;
  const items: unknown[] = Array.isArray(value) ? value : Array.isArray(error) ? error : [];
  return items
    .map((item) => sanitizeProviderText(String(item)))
    .filter((item) => item.toLowerCase().includes("requires property"));
}

function looksLikeInvalidRecipient(message: string | null) {
  return /recipient|number|jid|whatsapp|not exists|invalid.*phone/i.test(message ?? "");
}

export function sanitizeProviderText(value: string) {
  return value
    .replace(/(apikey|api_key|secret|token|authorization|jwt_key)=\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=_-]+/g, "data:[redacted]")
    .slice(0, 500);
}

function sanitizeToken(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || null;
}
