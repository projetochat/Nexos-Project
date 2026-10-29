import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectLoginMetrics,
  dispatchLoginMetrics,
  enqueueLoginMetric,
  loginMetricProvenance,
  readUnifiedLoginCounts,
  signLoginMetricRequest,
  tenantMetricKey,
} from "./index";
const now = new Date().toISOString();
const key = "synthetic-only-login-metric-key-at-least32";
const env = {
  TRIXUS_LOGIN_METRICS_ENABLED: "true",
  TRIXUS_LOGIN_METRICS_SOURCE_ID: "local-source",
  TRIXUS_LOGIN_METRICS_ENVIRONMENT: "local",
  TRIXUS_LOGIN_METRICS_KEY: key,
  TRIXUS_LOGIN_METRICS_START_AT: "2026-01-01T00:00:00.000Z",
  TRIXUS_LOGIN_METRICS_COLLECTOR: "true",
  TRIXUS_LOGIN_METRICS_PEERS_JSON: JSON.stringify({
    "local-source": {
      key,
      environment: "local",
      tenantKeys: ["flowid"],
      startAt: "2026-01-01T00:00:00.000Z",
    },
  }),
};
const config = (values: Record<string, string> = env) =>
  ({ get: (name: string) => values[name] }) as never;
afterEach(() => vi.unstubAllGlobals());
describe("login metric federation safety", () => {
  it("is disabled without querying schema or network by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await readUnifiedLoginCounts(
        {} as never,
        config({}),
        [{ id: "tenant-a", name: "Flowid" }],
        new Date(),
        new Date(),
      ),
    ).toEqual({ status: "disabled", countsByTenant: [] });
    expect(await dispatchLoginMetrics({} as never, config({}))).toEqual({
      status: "disabled",
      processed: 0,
    });
    await enqueueLoginMetric({} as never, {} as never, { id: "a", name: "Flowid" }, config({}));
    expect(loginMetricProvenance(config({}))).toBeUndefined();
    await expect(
      collectLoginMetrics({} as never, config({}), "/api/login-metrics/v1/events", {}, {}),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("normalizes only the first token for approved discovery", () => {
    expect(tenantMetricKey("  FlÓwId Matriz São Paulo ")).toBe("flowid");
    expect(tenantMetricKey("FLOWID HML")).toBe("flowid");
    expect(tenantMetricKey("Outra Flowid")).toBe("outra");
  });
  it("fails closed on ambiguous source names before any query or network", async () => {
    const tenants = [
      { id: "a", name: "Flowid Matriz" },
      { id: "b", name: "FLOWID Outra" },
    ];
    expect(
      await readUnifiedLoginCounts(
        {} as never,
        config(),
        tenants,
        new Date("2026-01-01"),
        new Date(),
      ),
    ).toEqual({
      status: "ambiguous",
      countsByTenant: tenants.map((t) => ({
        tenantId: t.id,
        local: null,
        homologation: null,
        production: null,
        total: null,
      })),
    });
  });
  it("rejects wrong source, HMAC, method/path reuse and stale signatures before DB access", async () => {
    const transaction = vi.fn();
    const p = { $transaction: transaction } as never;
    const body = { tenants: [], events: [], pending: 0, observedAt: now };
    const path = "/api/login-metrics/v1/events";
    const signed = signLoginMetricRequest({ sourceId: "local-source", key }, path, body);
    for (const headers of [
      { ...signed, "x-login-source": "foreign" },
      { ...signed, "x-login-source": "__proto__" },
      { ...signed, "x-login-source": "toString" },
      { ...signed, "x-login-signature": "0".repeat(64) },
      signLoginMetricRequest({ sourceId: "local-source", key }, path, body, Date.now() - 100000),
    ]) {
      await expect(collectLoginMetrics(p, config(), path, body, headers)).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(
      collectLoginMetrics(p, config(), "/api/login-metrics/v1/counts", body, signed),
    ).rejects.toMatchObject({ status: 401 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it("records minimal immutable origin in the login outbox without user/session identifiers", async () => {
    const create = vi.fn();
    const tenant = { id: "local-tenant", name: "Flowid Matriz" };
    await enqueueLoginMetric(
      { outboxEvent: { create } } as never,
      { id: "event-a", createdAt: new Date(now) },
      tenant,
      config(),
    );
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        tenantId: tenant.id,
        type: "LOGIN_METRIC_V1",
        aggregateId: "event-a",
        payload: {
          version: 1,
          sourceId: "local-source",
          environment: "local",
          eventId: "event-a",
          tenantId: tenant.id,
          tenantKey: "flowid",
          occurredAt: now,
        },
      },
    });
    expect(loginMetricProvenance(config())).toEqual({
      loginMetricOrigin: { sourceId: "local-source", environment: "local" },
    });
  });
  it("does not export historical audits before source cutover", async () => {
    const create = vi.fn();
    await enqueueLoginMetric(
      { outboxEvent: { create } } as never,
      { id: "legacy", createdAt: new Date("2025-01-01") },
      { id: "a", name: "Flowid" },
      config(),
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects non-HTTPS, credential URLs and redirects as exporter configuration", async () => {
    const credentialUrl = new URL("https://central.invalid");
    credentialUrl.username = "dummy";
    credentialUrl.password = "dummy";
    for (const url of [
      "http://central.invalid",
      credentialUrl.toString(),
      "https://central.invalid/wrong-path",
    ]) {
      const c = config({
        ...env,
        TRIXUS_LOGIN_METRICS_COLLECTOR: "false",
        TRIXUS_LOGIN_METRICS_CENTRAL_URL: url,
      });
      expect(
        (
          await readUnifiedLoginCounts(
            {} as never,
            c,
            [{ id: "a", name: "Flowid" }],
            new Date("2026-01-01"),
            new Date(),
          )
        ).status,
      ).toBe("unavailable");
    }
  });
  it("never converts central failure into zero login counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("synthetic network failure")));
    const c = config({
      ...env,
      TRIXUS_LOGIN_METRICS_COLLECTOR: "false",
      TRIXUS_LOGIN_METRICS_CENTRAL_URL: "https://central.invalid",
    });
    expect(
      await readUnifiedLoginCounts(
        {} as never,
        c,
        [{ id: "a", name: "Flowid" }],
        new Date("2026-01-01"),
        new Date(),
      ),
    ).toEqual({
      status: "unavailable",
      countsByTenant: [
        { tenantId: "a", local: null, homologation: null, production: null, total: null },
      ],
    });
  });
  it("bounds central response bodies without exposing a fabricated zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(262145))));
    const c = config({
      ...env,
      TRIXUS_LOGIN_METRICS_COLLECTOR: "false",
      TRIXUS_LOGIN_METRICS_CENTRAL_URL: "https://central.invalid",
    });
    expect(
      (
        await readUnifiedLoginCounts(
          {} as never,
          c,
          [{ id: "a", name: "Flowid" }],
          new Date("2026-01-01"),
          new Date(),
        )
      ).status,
    ).toBe("unavailable");
  });
});
