import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "../generated/prisma";
import type { PrismaService } from "../prisma/prisma.service";

export const LOGIN_METRIC_V1 = "LOGIN_METRIC_V1";
const EVENT_PATH = "/api/login-metrics/v1/events";
const COUNT_PATH = "/api/login-metrics/v1/counts";
const ENVIRONMENTS = ["local", "homologation", "production"] as const;
type Environment = (typeof ENVIRONMENTS)[number];
type Config = Pick<ConfigService, "get">;
type Db = Prisma.TransactionClient;
type Tenant = { id: string; name: string };
type Descriptor = { id: string; key: string };
type Peer = { key: string; environment: Environment; tenantKeys: string[]; startAt: string };
type Settings = {
  sourceId: string;
  environment: Environment;
  key: string;
  startAt: string;
  collector: boolean;
  centralUrl?: string;
  peers: Record<string, Peer>;
  freshnessMs: number;
};
type Event = { eventId: string; tenantId: string; tenantKey: string; occurredAt: string };
export type LoginMetricCount = {
  tenantId: string;
  local: number | null;
  homologation: number | null;
  production: number | null;
  total: number | null;
};
export type UnifiedLoginCounts = {
  status: "disabled" | "available" | "unavailable" | "ambiguous";
  countsByTenant: LoginMetricCount[];
  updatedAt?: string;
};
export type MetricHeaders = Record<string, string | undefined>;

export function tenantMetricKey(name: string) {
  return (name.normalize("NFKD").replace(/\p{M}/gu, "").trim().split(/\s+/)[0] ?? "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{1,191}$/.test(value);
}
function iso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function enabled(config: Config) {
  return config.get<string>("TRIXUS_LOGIN_METRICS_ENABLED") === "true";
}
export function loginMetricSettings(config: Config): Settings | null {
  if (!enabled(config)) return null;
  const get = (key: string) => config.get<string>(`TRIXUS_LOGIN_METRICS_${key}`) ?? "";
  const sourceId = get("SOURCE_ID"),
    environment = get("ENVIRONMENT") as Environment,
    key = get("KEY"),
    startAt = get("START_AT");
  const collector = get("COLLECTOR") === "true";
  if (
    !identifier(sourceId) ||
    !ENVIRONMENTS.includes(environment) ||
    key.length < 32 ||
    !iso(startAt)
  )
    throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
  const centralUrl = get("CENTRAL_URL");
  if (!collector) {
    let url: URL;
    try {
      url = new URL(centralUrl);
    } catch {
      throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
  }
  let peers: Record<string, Peer> = {};
  if (collector) {
    try {
      peers = JSON.parse(get("PEERS_JSON"));
    } catch {
      throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
    }
    if (!peers || typeof peers !== "object" || Array.isArray(peers))
      throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
    for (const [id, peer] of Object.entries(peers)) {
      if (
        !identifier(id) ||
        !peer ||
        typeof peer.key !== "string" ||
        peer.key.length < 32 ||
        !ENVIRONMENTS.includes(peer.environment) ||
        !iso(peer.startAt) ||
        !Array.isArray(peer.tenantKeys) ||
        peer.tenantKeys.length > 500 ||
        peer.tenantKeys.some((k) => !identifier(k) || tenantMetricKey(k) !== k)
      )
        throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
    }
    const self = peers[sourceId];
    if (!self || self.key !== key || self.environment !== environment || self.startAt !== startAt)
      throw new Error("LOGIN_METRIC_CONFIGURATION_INVALID");
  }
  return { sourceId, environment, key, startAt, collector, centralUrl, peers, freshnessMs: 300000 };
}
function canonical(value: unknown, depth = 0): string {
  if (depth > 12) throw new UnauthorizedException("LOGIN_METRIC_BODY_INVALID");
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, depth + 1)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function signature(
  key: string,
  source: string,
  path: string,
  time: string,
  nonce: string,
  body: unknown,
) {
  return createHmac("sha256", key)
    .update(
      [
        "POST",
        path,
        source,
        time,
        nonce,
        createHash("sha256").update(canonical(body)).digest("hex"),
      ].join("\n"),
    )
    .digest("hex");
}
export function signLoginMetricRequest(
  settings: Pick<Settings, "key" | "sourceId">,
  path: string,
  body: unknown,
  now = Date.now(),
): MetricHeaders {
  const time = String(now),
    nonce = randomUUID();
  return {
    "x-login-source": settings.sourceId,
    "x-login-time": time,
    "x-login-nonce": nonce,
    "x-login-signature": signature(settings.key, settings.sourceId, path, time, nonce, body),
  };
}
function ambiguous(): never {
  throw new ConflictException({ code: "LOGIN_METRIC_AMBIGUOUS" });
}
function descriptors(value: unknown): Descriptor[] {
  if (!Array.isArray(value) || value.length > 500) ambiguous();
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const d of value as Descriptor[]) {
    if (
      !d ||
      !identifier(d.id) ||
      !identifier(d.key) ||
      tenantMetricKey(d.key) !== d.key ||
      ids.has(d.id) ||
      keys.has(d.key)
    )
      ambiguous();
    ids.add(d.id);
    keys.add(d.key);
  }
  return value as Descriptor[];
}
function authenticate(settings: Settings, path: string, body: unknown, headers: MetricHeaders) {
  if (!settings.collector) throw new NotFoundException();
  const source = headers["x-login-source"] ?? "",
    time = headers["x-login-time"] ?? "",
    nonce = headers["x-login-nonce"] ?? "",
    mac = headers["x-login-signature"] ?? "";
  if ([source, time, nonce, mac].some((value) => typeof value !== "string"))
    throw new UnauthorizedException("LOGIN_METRIC_AUTH_INVALID");
  const peer = Object.hasOwn(settings.peers, source) ? settings.peers[source] : undefined;
  if (
    !peer ||
    !/^\d{13}$/.test(time) ||
    Math.abs(Date.now() - Number(time)) > 90000 ||
    !identifier(nonce) ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    Buffer.byteLength(canonical(body)) > 262144
  )
    throw new UnauthorizedException("LOGIN_METRIC_AUTH_INVALID");
  const expected = signature(peer.key, source, path, time, nonce, body);
  if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex")))
    throw new UnauthorizedException("LOGIN_METRIC_AUTH_INVALID");
  return { source, peer, nonce };
}
async function reserveNonce(tx: Db, source: string, nonce: string) {
  await tx.$executeRaw`DELETE FROM "login_metric_nonces" WHERE "expires_at" < NOW()`;
  const inserted = await tx.$queryRaw<
    Array<{ nonce: string }>
  >`INSERT INTO "login_metric_nonces" ("source_id", "nonce", "expires_at") VALUES (${source}, ${nonce}, NOW() + INTERVAL '5 minutes') ON CONFLICT DO NOTHING RETURNING "nonce"`;
  if (!inserted.length) throw new UnauthorizedException("LOGIN_METRIC_REPLAY");
}
async function bind(tx: Db, source: string, peer: Peer, requested: Descriptor[]) {
  const central = await tx.tenant.findMany({ select: { id: true, name: true } });
  const bindings = new Map<string, string>();
  for (const local of requested) {
    if (!peer.tenantKeys.includes(local.key)) continue;
    const existing = await tx.$queryRaw<
      Array<{ canonical_tenant_id: string; tenant_key: string; environment: string }>
    >`SELECT "canonical_tenant_id", "tenant_key", "environment" FROM "login_metric_bindings" WHERE "source_id"=${source} AND "local_tenant_id"=${local.id}`;
    if (existing.length) {
      const b = existing[0];
      if (
        b.tenant_key !== local.key ||
        b.environment !== peer.environment ||
        !central.some((t) => t.id === b.canonical_tenant_id)
      )
        ambiguous();
      bindings.set(local.id, b.canonical_tenant_id);
      continue;
    }
    const matches = central.filter((t) => tenantMetricKey(t.name) === local.key);
    if (matches.length !== 1) ambiguous();
    await tx.$executeRaw`INSERT INTO "login_metric_bindings" ("source_id","local_tenant_id","tenant_key","canonical_tenant_id","environment") VALUES (${source},${local.id},${local.key},${matches[0].id},${peer.environment}) ON CONFLICT DO NOTHING`;
    const confirmed = await tx.$queryRaw<
      Array<{ canonical_tenant_id: string; tenant_key: string; environment: string }>
    >`SELECT "canonical_tenant_id", "tenant_key", "environment" FROM "login_metric_bindings" WHERE "source_id"=${source} AND "local_tenant_id"=${local.id}`;
    if (
      confirmed.length !== 1 ||
      confirmed[0].canonical_tenant_id !== matches[0].id ||
      confirmed[0].tenant_key !== local.key ||
      confirmed[0].environment !== peer.environment
    )
      ambiguous();
    bindings.set(local.id, matches[0].id);
  }
  return bindings;
}
export function loginMetricProvenance(config: Config) {
  const settings = loginMetricSettings(config);
  return settings
    ? { loginMetricOrigin: { sourceId: settings.sourceId, environment: settings.environment } }
    : undefined;
}
export async function enqueueLoginMetric(
  tx: Db,
  audit: { id: string; createdAt: Date },
  tenant: Tenant,
  config: Config,
) {
  const settings = loginMetricSettings(config);
  if (!settings || audit.createdAt < new Date(settings.startAt)) return;
  const payload = {
    version: 1,
    sourceId: settings.sourceId,
    environment: settings.environment,
    eventId: audit.id,
    tenantId: tenant.id,
    tenantKey: tenantMetricKey(tenant.name),
    occurredAt: audit.createdAt.toISOString(),
  };
  await tx.outboxEvent.create({
    data: { tenantId: tenant.id, type: LOGIN_METRIC_V1, aggregateId: audit.id, payload },
  });
}
async function readBoundedResponse(response: Response) {
  const maximum = 262144;
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maximum) throw new Error("LOGIN_METRIC_RESPONSE_INVALID");
  if (!response.body) throw new Error("LOGIN_METRIC_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("LOGIN_METRIC_RESPONSE_INVALID");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8")) as unknown;
}
async function remote(settings: Settings, path: string, body: unknown) {
  const response = await fetch(`${settings.centralUrl}${path}`, {
    method: "POST",
    headers: {
      ...signLoginMetricRequest(settings, path, body),
      "content-type": "application/json",
    } as Record<string, string>,
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 409) ambiguous();
  if (!response.ok) throw new Error("LOGIN_METRIC_CENTRAL_UNAVAILABLE");
  return readBoundedResponse(response);
}
export async function collectLoginMetrics(
  prisma: PrismaService,
  config: Config,
  path: string,
  body: unknown,
  headers: MetricHeaders,
) {
  const settings = loginMetricSettings(config);
  if (!settings) throw new NotFoundException();
  const auth = authenticate(settings, path, body, headers);
  if (!body || typeof body !== "object" || Array.isArray(body)) ambiguous();
  const data = body as {
    tenants: unknown;
    events?: unknown;
    pending?: unknown;
    observedAt?: unknown;
    start?: unknown;
    end?: unknown;
  };
  const tenants = descriptors(data.tenants);
  return prisma.$transaction(async (tx) => {
    await reserveNonce(tx, auth.source, auth.nonce);
    const bindings = await bind(tx, auth.source, auth.peer, tenants);
    if (path === EVENT_PATH) {
      if (
        !Array.isArray(data.events) ||
        data.events.length > 100 ||
        !Number.isSafeInteger(data.pending) ||
        Number(data.pending) < 0 ||
        !iso(data.observedAt) ||
        Date.parse(data.observedAt) > Date.now() + 90000 ||
        Date.now() - Date.parse(data.observedAt) > settings.freshnessMs
      )
        ambiguous();
      for (const event of data.events as Event[]) {
        const descriptor = tenants.find((t) => t.id === event?.tenantId);
        if (
          !event ||
          !identifier(event.eventId) ||
          !iso(event.occurredAt) ||
          !descriptor ||
          event.tenantKey !== descriptor.key ||
          Date.parse(event.occurredAt) < Date.parse(auth.peer.startAt) ||
          Date.parse(event.occurredAt) > Date.now() + 300000
        )
          ambiguous();
        const canonicalId = bindings.get(event.tenantId);
        if (!canonicalId) throw new UnauthorizedException("LOGIN_METRIC_TENANT_DENIED");
        await tx.$executeRaw`INSERT INTO "login_metric_events" ("source_id","event_id","local_tenant_id","canonical_tenant_id","environment","occurred_at") VALUES (${auth.source},${event.eventId},${event.tenantId},${canonicalId},${auth.peer.environment},${new Date(event.occurredAt)}) ON CONFLICT DO NOTHING`;
        const saved = await tx.$queryRaw<
          Array<{
            local_tenant_id: string;
            canonical_tenant_id: string;
            environment: string;
            occurred_at: Date;
          }>
        >`SELECT "local_tenant_id","canonical_tenant_id","environment","occurred_at" FROM "login_metric_events" WHERE "source_id"=${auth.source} AND "event_id"=${event.eventId}`;
        if (
          saved.length !== 1 ||
          saved[0].local_tenant_id !== event.tenantId ||
          saved[0].canonical_tenant_id !== canonicalId ||
          saved[0].environment !== auth.peer.environment ||
          saved[0].occurred_at.toISOString() !== event.occurredAt
        )
          throw new ConflictException({ code: "LOGIN_METRIC_EVENT_CONFLICT" });
      }
      await tx.$executeRaw`INSERT INTO "login_metric_source_states" ("source_id","environment","last_contact_at","observed_at","pending") VALUES (${auth.source},${auth.peer.environment},NOW(),${new Date(data.observedAt as string)},${Number(data.pending)}) ON CONFLICT ("source_id") DO UPDATE SET "last_contact_at"=EXCLUDED."last_contact_at","observed_at"=EXCLUDED."observed_at","pending"=EXCLUDED."pending" WHERE "login_metric_source_states"."environment"=EXCLUDED."environment" AND "login_metric_source_states"."observed_at"<=EXCLUDED."observed_at"`;
      return { accepted: data.events.length };
    }
    if (
      path !== COUNT_PATH ||
      !iso(data.start) ||
      !iso(data.end) ||
      Date.parse(data.start) >= Date.parse(data.end)
    )
      ambiguous();
    const counts: LoginMetricCount[] = [];
    let oldest = Date.now();
    for (const descriptor of tenants) {
      if (!bindings.has(descriptor.id)) return unavailable(tenants);
      const expected = Object.entries(settings.peers).filter(([, p]) =>
        p.tenantKeys.includes(descriptor.key),
      );
      if (ENVIRONMENTS.some((env) => !expected.some(([, p]) => p.environment === env)))
        return unavailable(tenants);
      for (const [source, peer] of expected) {
        const sourceBinding = await tx.$queryRaw<
          Array<{ local_tenant_id: string }>
        >`SELECT "local_tenant_id" FROM "login_metric_bindings" WHERE "source_id"=${source} AND "canonical_tenant_id"=${bindings.get(descriptor.id)!} AND "tenant_key"=${descriptor.key} AND "environment"=${peer.environment}`;
        if (!sourceBinding.length) return unavailable(tenants);
        const state = await tx.$queryRaw<
          Array<{ environment: string; last_contact_at: Date; observed_at: Date; pending: number }>
        >`SELECT "environment","last_contact_at","observed_at","pending" FROM "login_metric_source_states" WHERE "source_id"=${source}`;
        if (
          state.length !== 1 ||
          state[0].environment !== peer.environment ||
          state[0].pending !== 0 ||
          Date.now() -
            Math.min(state[0].last_contact_at.getTime(), state[0].observed_at.getTime()) >
            settings.freshnessMs
        )
          return unavailable(tenants);
        oldest = Math.min(oldest, state[0].observed_at.getTime());
      }
      const rows = await tx.$queryRaw<
        Array<{ environment: Environment; total: bigint }>
      >`SELECT "environment",COUNT(*) AS "total" FROM "login_metric_events" WHERE "canonical_tenant_id"=${bindings.get(descriptor.id)!} AND "occurred_at">=${new Date(data.start)} AND "occurred_at"<${new Date(data.end)} GROUP BY "environment"`;
      const row: LoginMetricCount = {
        tenantId: descriptor.id,
        local: 0,
        homologation: 0,
        production: 0,
        total: 0,
      };
      for (const item of rows) {
        if (!ENVIRONMENTS.includes(item.environment) || !Number.isSafeInteger(Number(item.total)))
          throw new Error("LOGIN_METRIC_COUNT_INVALID");
        row[item.environment] = Number(item.total);
      }
      row.total = row.local! + row.homologation! + row.production!;
      counts.push(row);
    }
    return {
      status: "available" as const,
      countsByTenant: counts,
      updatedAt: new Date(oldest).toISOString(),
    };
  });
}
function unavailable(
  tenants: Array<{ id: string }>,
  status: "unavailable" | "ambiguous" = "unavailable",
): UnifiedLoginCounts {
  return {
    status,
    countsByTenant: tenants.map((t) => ({
      tenantId: t.id,
      local: null,
      homologation: null,
      production: null,
      total: null,
    })),
  };
}
export async function readUnifiedLoginCounts(
  prisma: PrismaService,
  config: Config,
  tenants: Tenant[],
  start: Date,
  end: Date,
): Promise<UnifiedLoginCounts> {
  if (!enabled(config)) return { status: "disabled", countsByTenant: [] };
  try {
    const settings = loginMetricSettings(config)!;
    const body = {
      tenants: descriptors(tenants.map((t) => ({ id: t.id, key: tenantMetricKey(t.name) }))),
      start: start.toISOString(),
      end: end.toISOString(),
    };
    const result = settings.collector
      ? await collectLoginMetrics(
          prisma,
          config,
          COUNT_PATH,
          body,
          signLoginMetricRequest(settings, COUNT_PATH, body),
        )
      : await remote(settings, COUNT_PATH, body);
    const parsed = result as UnifiedLoginCounts;
    if (
      !["available", "unavailable", "ambiguous"].includes(parsed.status) ||
      !Array.isArray(parsed.countsByTenant) ||
      parsed.countsByTenant.length !== tenants.length ||
      new Set(parsed.countsByTenant.map((row) => row.tenantId)).size !== tenants.length ||
      (parsed.status === "available" && !iso(parsed.updatedAt))
    )
      throw new Error("LOGIN_METRIC_RESPONSE_INVALID");
    for (const row of parsed.countsByTenant)
      if (
        !tenants.some((t) => t.id === row.tenantId) ||
        (parsed.status === "available" &&
          [row.local, row.homologation, row.production, row.total].some(
            (n) => !Number.isSafeInteger(n) || n! < 0,
          ))
      )
        throw new Error("LOGIN_METRIC_RESPONSE_INVALID");
    return parsed;
  } catch (error) {
    return unavailable(tenants, error instanceof ConflictException ? "ambiguous" : "unavailable");
  }
}
export async function dispatchLoginMetrics(prisma: PrismaService, config: Config) {
  const settings = loginMetricSettings(config);
  if (!settings) return { status: "disabled" as const, processed: 0 };
  const origin = { sourceId: settings.sourceId, environment: settings.environment };
  const where: Prisma.OutboxEventWhereInput = {
    type: LOGIN_METRIC_V1,
    status: { in: ["PENDING", "FAILED"] },
    AND: [
      { payload: { path: ["sourceId"], equals: origin.sourceId } },
      { payload: { path: ["environment"], equals: origin.environment } },
    ],
  };
  const observedAt = new Date().toISOString();
  const [pending, rows, local] = await prisma.$transaction(
    [
      prisma.outboxEvent.count({ where }),
      prisma.outboxEvent.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      }),
      prisma.tenant.findMany({ select: { id: true, name: true } }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const body = {
    tenants: descriptors(local.map((t) => ({ id: t.id, key: tenantMetricKey(t.name) }))),
    events: rows.map((r) => {
      const p = r.payload as unknown as Event;
      return {
        eventId: p.eventId,
        tenantId: p.tenantId,
        tenantKey: p.tenantKey,
        occurredAt: p.occurredAt,
      };
    }),
    pending: Math.max(0, pending - rows.length),
    observedAt,
  };
  try {
    if (settings.collector)
      await collectLoginMetrics(
        prisma,
        config,
        EVENT_PATH,
        body,
        signLoginMetricRequest(settings, EVENT_PATH, body),
      );
    else await remote(settings, EVENT_PATH, body);
    if (rows.length)
      await prisma.outboxEvent.updateMany({
        where: { ...where, id: { in: rows.map((r) => r.id) } },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lastError: null,
          attempts: { increment: 1 },
        },
      });
    return { status: "available" as const, processed: rows.length };
  } catch {
    if (rows.length)
      await prisma.outboxEvent.updateMany({
        where: { ...where, id: { in: rows.map((r) => r.id) } },
        data: {
          status: "FAILED",
          lastError: "LOGIN_METRIC_EXPORT_FAILED",
          attempts: { increment: 1 },
        },
      });
    return { status: "unavailable" as const, processed: 0 };
  }
}
