const FORBIDDEN_DATABASES = new Set(["trixus", "postgres", "production", "prod"]);
const EXPLICIT_DATABASES = new Set(["trixus_0802", "trixus_homolog", "trixus_test"]);

export function databaseNameFromUrl(value: string) {
  const url = new URL(value);
  return url.pathname.replace(/^\//, "");
}

export function isAllowedHomologationDatabase(databaseName: string) {
  if (!databaseName || FORBIDDEN_DATABASES.has(databaseName)) return false;
  return (
    EXPLICIT_DATABASES.has(databaseName) ||
    databaseName.startsWith("trixus_08") ||
    databaseName.startsWith("trixus_homolog")
  );
}

export function assertSafeResetTarget(input: {
  databaseUrl: string;
  nodeEnv?: string;
  confirm: boolean;
}) {
  if (!input.confirm) {
    throw new Error("RESET_CONFIRM_REQUIRED: use --confirm para resetar homologacao.");
  }
  if (input.nodeEnv === "production") {
    throw new Error("RESET_PRODUCTION_BLOCKED: NODE_ENV=production.");
  }

  const url = new URL(input.databaseUrl);
  const databaseName = databaseNameFromUrl(input.databaseUrl);
  const host = url.hostname.toLowerCase();
  if (host.includes("prod") || host.includes("render") || host.includes("supabase")) {
    throw new Error("RESET_PRODUCTION_HOST_BLOCKED: host nao permitido.");
  }
  if (!isAllowedHomologationDatabase(databaseName)) {
    throw new Error(`RESET_DATABASE_NOT_ALLOWED: ${databaseName}`);
  }
  return { databaseName, host };
}
