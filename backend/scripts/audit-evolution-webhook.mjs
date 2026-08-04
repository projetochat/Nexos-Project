#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, "..");
const repoRoot = resolve(backendDir, "..");

loadEnvFile(resolve(repoRoot, ".env"));
loadEnvFile(resolve(backendDir, ".env"));

const args = new Set(process.argv.slice(2));
const instanceName =
  process.env.EVOLUTION_INSTANCE_NAME ??
  process.argv.find((arg) => arg.startsWith("--instance="))?.slice("--instance=".length);
const ensure = args.has("--ensure");
const checkContainerHealth = args.has("--container-health");
const containerName = process.env.EVOLUTION_CONTAINER_NAME ?? "nexos-evolution-api";

const baseUrl = trimTrailingSlash(
  process.env.EVOLUTION_BASE_URL ?? process.env.EVOLUTION_API_URL ?? "",
);
const apiKey = normalizeSecret(process.env.EVOLUTION_API_KEY);
const webhookUrl = trimTrailingSlash(process.env.EVOLUTION_WEBHOOK_PUBLIC_URL ?? "");
const webhookSecret = normalizeSecret(process.env.EVOLUTION_WEBHOOK_SECRET);

if (checkContainerHealth) {
  const health = spawnSync(
    "docker",
    [
      "exec",
      containerName,
      "sh",
      "-lc",
      "wget -q -S -O - http://host.docker.internal:3001/api/health",
    ],
    { encoding: "utf8" },
  );
  const output = `${health.stdout}\n${health.stderr}`;
  const ok = health.status === 0 && /HTTP\/.* 200|HTTP\/.* 200 OK/.test(output);
  console.log(JSON.stringify({ event: "evolution.container.backend_health", containerName, ok }));
  if (!ok) process.exit(1);
}

if (!instanceName) fail("INSTANCE_REQUIRED");
if (!baseUrl || !apiKey) fail("EVOLUTION_API_NOT_CONFIGURED");

const instance = await fetchInstance(instanceName);
if (!instance) fail("INSTANCE_NOT_FOUND", { instanceName });

if (ensure) {
  if (!webhookUrl || !webhookSecret) fail("WEBHOOK_ENV_NOT_CONFIGURED");
  await setWebhook(instanceName);
}

const refreshed = ensure ? await fetchInstance(instanceName) : instance;
const webhook = refreshed?.Webhook ?? {};
const headers = webhook.headers ?? {};
const evolutionSecret = normalizeSecret(headers.jwt_key);

console.log(
  JSON.stringify(
    {
      event: "evolution.webhook.audit",
      instanceName,
      urlCorrect: webhook.url === webhookUrl,
      messagesUpsertPresent: Array.isArray(webhook.events)
        ? webhook.events.includes("MESSAGES_UPSERT")
        : false,
      secretBackendConfigured: !!webhookSecret,
      secretEvolutionConfigured: !!evolutionSecret,
      secretMatch: !!webhookSecret && !!evolutionSecret && webhookSecret === evolutionSecret,
      headerJwtKeyPresent: !!evolutionSecret,
    },
    null,
    2,
  ),
);

async function fetchInstance(name) {
  const response = await request(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
  );
  const items = Array.isArray(response) ? response : (response?.value ?? []);
  return items.find((item) => item.name === name || item.instanceName === name) ?? null;
}

async function setWebhook(name) {
  await request(`/webhook/set/${encodeURIComponent(name)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers: { jwt_key: webhookSecret },
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "SEND_MESSAGE_UPDATE",
          "QRCODE_UPDATED",
          "CONNECTION_UPDATE",
        ],
      },
    },
  });
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok)
    fail("EVOLUTION_HTTP_ERROR", { status: response.status, body: sanitizeBody(body) });
  return body;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(index + 1).trim();
  }
}

function trimTrailingSlash(value) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeSecret(value) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const clone = { ...body };
  delete clone.apikey;
  delete clone.jwt_key;
  delete clone.secret;
  return clone;
}

function fail(code, detail = {}) {
  console.error(
    JSON.stringify({ event: "evolution.webhook.audit_failed", code, ...detail }, null, 2),
  );
  process.exit(1);
}
