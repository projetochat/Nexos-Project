const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DISPOSABLE_DATABASE_PATTERN =
  /^trixus_(?:1200|test(?:_[a-z0-9_-]+)?|ci(?:_[a-z0-9_-]+)?|e2e(?:_[a-z0-9_-]+)?)$/;

export function assertDisposableVerifyDatabase({ databaseUrl, nodeEnv, confirmation }) {
  if (nodeEnv !== "test") {
    throw new Error("VERIFY_DATABASE_BLOCKED: NODE_ENV must be test.");
  }
  if (!databaseUrl) {
    throw new Error("VERIFY_DATABASE_BLOCKED: TRIXUS_TEST_DATABASE_URL is required.");
  }

  const url = parseUrl(databaseUrl, "VERIFY_DATABASE_BLOCKED");
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("VERIFY_DATABASE_BLOCKED: only PostgreSQL URLs are allowed.");
  }
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("VERIFY_DATABASE_BLOCKED: the database host must be local.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName)) {
    throw new Error(
      `VERIFY_DATABASE_BLOCKED: database is not disposable: ${databaseName || "missing"}.`,
    );
  }
  if (confirmation !== databaseName) {
    throw new Error(
      "VERIFY_DATABASE_BLOCKED: TRIXUS_VERIFY_DISPOSABLE_DATABASE must equal the test database name.",
    );
  }

  return { databaseUrl: url.toString(), databaseName };
}

export function assertDisposableVerifyRedis({ redisUrl, nodeEnv, confirmation }) {
  if (nodeEnv !== "test") {
    throw new Error("VERIFY_REDIS_BLOCKED: NODE_ENV must be test.");
  }
  if (!redisUrl) {
    throw new Error("VERIFY_REDIS_BLOCKED: REDIS_URL is required.");
  }

  const url = parseUrl(redisUrl, "VERIFY_REDIS_BLOCKED");
  if (!new Set(["redis:", "rediss:"]).has(url.protocol)) {
    throw new Error("VERIFY_REDIS_BLOCKED: only Redis URLs are allowed.");
  }
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("VERIFY_REDIS_BLOCKED: the Redis host must be local.");
  }
  if (confirmation !== "true") {
    throw new Error("VERIFY_REDIS_BLOCKED: TRIXUS_VERIFY_DISPOSABLE_REDIS must be true.");
  }

  return { redisUrl: url.toString() };
}

function parseUrl(value, prefix) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${prefix}: invalid URL.`);
  }
}
