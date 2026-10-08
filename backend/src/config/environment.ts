import { isAbsolute } from "node:path";

type Environment = Record<string, unknown>;

const REQUIRED_PRODUCTION_VALUES = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "FRONTEND_ORIGIN",
  "TRIXUS_REALTIME_CORS_ORIGIN",
  "REDIS_URL",
  "RESEND_API_KEY",
  "TRIXUS_EMAIL_FROM",
  "TENANT_ADMIN_PROVISIONING_MODE",
  "TRIXUS_ENVIRONMENT",
] as const;

const TRIXUS_ENVIRONMENTS = ["production", "homologation", "staging"] as const;

export function validateEnvironment(input: Environment): Environment {
  const environment = normalizedEnvironment(input);
  if (environment.NODE_ENV !== "production") return environment;

  const errors: string[] = [];
  for (const name of REQUIRED_PRODUCTION_VALUES) {
    if (!environment[name]) errors.push(`${name} is required`);
  }
  if (
    environment.TRIXUS_ENVIRONMENT &&
    !TRIXUS_ENVIRONMENTS.includes(
      environment.TRIXUS_ENVIRONMENT as (typeof TRIXUS_ENVIRONMENTS)[number],
    )
  ) {
    errors.push("TRIXUS_ENVIRONMENT must be production, homologation or staging");
  }

  validateUrl(environment.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"], errors);
  validateHttpsList(environment.FRONTEND_ORIGIN, "FRONTEND_ORIGIN", errors);
  validateExactOrigins(environment.FRONTEND_ORIGIN, "FRONTEND_ORIGIN", errors);
  validateHttpsList(environment.TRIXUS_REALTIME_CORS_ORIGIN, "TRIXUS_REALTIME_CORS_ORIGIN", errors);
  validateExactOrigins(
    environment.TRIXUS_REALTIME_CORS_ORIGIN,
    "TRIXUS_REALTIME_CORS_ORIGIN",
    errors,
  );
  const legacyPublicAppUrl = environment.TRIXUS_PUBLIC_APP_URL;
  const platformAppUrl = environment.TRIXUS_PLATFORM_APP_URL || legacyPublicAppUrl;
  const tenantAppUrl = environment.TRIXUS_TENANT_APP_URL || legacyPublicAppUrl;
  if (!platformAppUrl) {
    errors.push("TRIXUS_PLATFORM_APP_URL or TRIXUS_PUBLIC_APP_URL is required");
  }
  if (!tenantAppUrl) {
    errors.push("TRIXUS_TENANT_APP_URL or TRIXUS_PUBLIC_APP_URL is required");
  }
  validateUrl(platformAppUrl, "TRIXUS_PLATFORM_APP_URL", ["https:"], errors);
  validateExactOrigins(platformAppUrl, "TRIXUS_PLATFORM_APP_URL", errors);
  validateUrl(tenantAppUrl, "TRIXUS_TENANT_APP_URL", ["https:"], errors);
  validateExactOrigins(tenantAppUrl, "TRIXUS_TENANT_APP_URL", errors);
  validateUrl(environment.REDIS_URL, "REDIS_URL", ["redis:", "rediss:"], errors);
  if (environment.TENANT_ADMIN_PROVISIONING_MODE !== "invitation_email") {
    errors.push("TENANT_ADMIN_PROVISIONING_MODE must be invitation_email in production");
  }

  validateSecret(environment.JWT_SECRET, "JWT_SECRET", errors);
  validateSecret(environment.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET", errors);
  validateNonPlaceholder(environment.RESEND_API_KEY, "RESEND_API_KEY", errors);
  if (environment.TRIXUS_EXPOSE_LOCAL_TOKENS === "true") {
    errors.push("TRIXUS_EXPOSE_LOCAL_TOKENS must not be true in production");
  }
  if (
    environment.JWT_SECRET &&
    environment.JWT_REFRESH_SECRET &&
    environment.JWT_SECRET === environment.JWT_REFRESH_SECRET
  ) {
    errors.push("JWT_SECRET and JWT_REFRESH_SECRET must be different");
  }

  const storageProvider = environment.TRIXUS_STORAGE_PROVIDER || "local";
  if (!["local", "r2"].includes(storageProvider)) {
    errors.push("TRIXUS_STORAGE_PROVIDER must be local or r2");
  }
  if (storageProvider === "local") {
    const storagePath = environment.TRIXUS_STORAGE_LOCAL_PATH;
    if (!storagePath) errors.push("TRIXUS_STORAGE_LOCAL_PATH is required for local storage");
    else if (!isAbsolute(storagePath)) {
      errors.push("TRIXUS_STORAGE_LOCAL_PATH must be an absolute path");
    }
  }

  const messageStorageProvider = environment.TRIXUS_MESSAGE_STORAGE_PROVIDER || "local";
  if (messageStorageProvider !== "local") {
    errors.push("TRIXUS_MESSAGE_STORAGE_PROVIDER must be local in this release");
  } else {
    const messageStoragePath = environment.TRIXUS_MESSAGE_STORAGE_LOCAL_PATH;
    if (!messageStoragePath) {
      errors.push("TRIXUS_MESSAGE_STORAGE_LOCAL_PATH is required for local message storage");
    } else if (!isAbsolute(messageStoragePath)) {
      errors.push("TRIXUS_MESSAGE_STORAGE_LOCAL_PATH must be an absolute path");
    }
  }

  const evolutionValues = [
    "EVOLUTION_BASE_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_WEBHOOK_PUBLIC_URL",
    "EVOLUTION_WEBHOOK_SECRET",
  ] as const;
  if (evolutionValues.some((name) => environment[name])) {
    for (const name of evolutionValues) {
      if (!environment[name]) errors.push(`${name} is required when Evolution is configured`);
    }
    validateNonPlaceholder(environment.EVOLUTION_API_KEY, "EVOLUTION_API_KEY", errors);
    validateNonPlaceholder(
      environment.EVOLUTION_WEBHOOK_SECRET,
      "EVOLUTION_WEBHOOK_SECRET",
      errors,
    );
    validateUrl(environment.EVOLUTION_BASE_URL, "EVOLUTION_BASE_URL", ["http:", "https:"], errors);
    validateUrl(
      environment.EVOLUTION_WEBHOOK_PUBLIC_URL,
      "EVOLUTION_WEBHOOK_PUBLIC_URL",
      ["https:"],
      errors,
    );
  }

  validateExactOrigins(
    environment.TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS,
    "TRIXUS_MEDIA_DOWNLOAD_ALLOWED_ORIGINS",
    errors,
  );
  validateIntegerRange(
    environment.TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS,
    "TRIXUS_MEDIA_DOWNLOAD_TIMEOUT_MS",
    100,
    60_000,
    errors,
  );

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join("; ")}`);
  }
  return environment;
}

function normalizedEnvironment(input: Environment): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => [
      name,
      typeof value === "string" ? value.trim() : "",
    ]),
  );
}

function validateSecret(value: string, name: string, errors: string[]) {
  if (value && value.length < 32) errors.push(`${name} must contain at least 32 characters`);
  validateNonPlaceholder(value, name, errors);
}

function validateNonPlaceholder(value: string, name: string, errors: string[]) {
  if (
    value &&
    (/^<[^>]+>$/.test(value) ||
      value.toLowerCase().startsWith("change-me") ||
      value.toLowerCase().startsWith("trixus-homologation-"))
  ) {
    errors.push(`${name} must not use a known placeholder value`);
  }
}

function validateHttpsList(value: string, name: string, errors: string[]) {
  if (!value) return;
  for (const item of value.split(",").map((part) => part.trim())) {
    validateUrl(item, name, ["https:"], errors);
  }
}

function validateUrl(value: string, name: string, protocols: string[], errors: string[]) {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(`${name} must use ${protocols.join(" or ")}`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

function validateExactOrigins(value: string, name: string, errors: string[]) {
  if (!value) return;
  for (const item of value.split(",").map((part) => part.trim())) {
    try {
      const parsed = new URL(item);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        errors.push(`${name} must contain only exact HTTP(S) origins`);
      }
    } catch {
      errors.push(`${name} must contain only valid HTTP(S) origins`);
    }
  }
}

function validateIntegerRange(
  value: string,
  name: string,
  minimum: number,
  maximum: number,
  errors: string[],
) {
  if (!value) return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}
