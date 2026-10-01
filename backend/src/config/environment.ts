import { isAbsolute } from "node:path";

type Environment = Record<string, unknown>;

const REQUIRED_PRODUCTION_VALUES = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "FRONTEND_ORIGIN",
  "TRIXUS_PUBLIC_APP_URL",
  "REDIS_URL",
  "RESEND_API_KEY",
  "TRIXUS_EMAIL_FROM",
] as const;

export function validateEnvironment(input: Environment): Environment {
  const environment = normalizedEnvironment(input);
  if (environment.NODE_ENV !== "production") return environment;

  const errors: string[] = [];
  for (const name of REQUIRED_PRODUCTION_VALUES) {
    if (!environment[name]) errors.push(`${name} is required`);
  }

  validateUrl(environment.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"], errors);
  validateHttpsList(environment.FRONTEND_ORIGIN, "FRONTEND_ORIGIN", errors);
  validateUrl(environment.TRIXUS_PUBLIC_APP_URL, "TRIXUS_PUBLIC_APP_URL", ["https:"], errors);
  validateUrl(environment.REDIS_URL, "REDIS_URL", ["redis:", "rediss:"], errors);

  validateSecret(environment.JWT_SECRET, "JWT_SECRET", errors);
  validateSecret(environment.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET", errors);
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
