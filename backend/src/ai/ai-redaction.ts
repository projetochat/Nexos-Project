const SECRET_FIELDS = /^(api[-_]?key|authorization|token|secret|credential)$/i;

export function redactAiSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAiSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_FIELDS.test(key) ? "[redacted]" : redactAiSecrets(item),
      ]),
    );
  }
  if (typeof value === "string") {
    return value.replace(
      /(api[-_]?key|authorization|token|secret|credential)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    );
  }
  return value;
}

export function safeProviderError(error: unknown) {
  const canonicalCode = httpExceptionCode(error);
  if (canonicalCode) return { code: canonicalCode };
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
  return { code: status ? `AI_PROVIDER_${status}` : "AI_PROVIDER_FAILED" };
}

function httpExceptionCode(error: unknown) {
  if (!error || typeof error !== "object" || !("getResponse" in error)) return undefined;
  const getResponse = error.getResponse;
  if (typeof getResponse !== "function") return undefined;
  let response: unknown;
  try {
    response = getResponse.call(error);
  } catch {
    return undefined;
  }
  const code =
    response && typeof response === "object" && "code" in response ? response.code : undefined;
  return typeof code === "string" && /^AI_[A-Z0-9_]+$/.test(code) ? code : undefined;
}
