#!/usr/bin/env node

const apiUrl = (
  process.env.VITE_NEXOS_API_URL ??
  process.env.NEXOS_API_URL ??
  "http://localhost:3001/api"
).replace(/\/$/, "");
const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@nexo.app").trim();
const password = process.env.SEED_ADMIN_PASSWORD ?? "demo1234";

async function main() {
  const health = await requestJson(`${apiUrl}/health`, { method: "GET" });
  if (!health.ok || health.database !== "up") {
    fail("HEALTH_NOT_READY", { apiUrl, health });
  }

  const login = await requestJson(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!login.accessToken || !login.refreshToken) fail("TOKENS_MISSING");
  if (login.user?.email !== email.toLowerCase()) fail("USER_MISMATCH");
  if (login.tenant?.slug !== "homologacao") fail("TENANT_MISMATCH", { tenant: login.tenant });
  if (login.membership?.role !== "tenant_admin") {
    fail("MEMBERSHIP_ROLE_MISMATCH", { membership: login.membership });
  }

  const me = await requestJson(`${apiUrl}/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  if (me.user?.email !== email.toLowerCase()) fail("ME_USER_MISMATCH");
  if (me.tenant?.slug !== "homologacao") fail("ME_TENANT_MISMATCH", { tenant: me.tenant });
  if (me.membership?.role !== "tenant_admin")
    fail("ME_ROLE_MISMATCH", { membership: me.membership });

  console.info(
    JSON.stringify(
      {
        event: "homologation.login.pass",
        apiUrl,
        user: email.toLowerCase(),
        tenant: me.tenant.slug,
        membershipRole: me.membership.role,
      },
      null,
      2,
    ),
  );
}

async function requestJson(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    fail("API_UNREACHABLE", { url, error: error.message });
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) fail("HTTP_ERROR", { url, status: response.status, body });
  return body;
}

function fail(code, detail = {}) {
  console.error(JSON.stringify({ event: "homologation.login.fail", code, ...detail }, null, 2));
  process.exit(1);
}

main().catch((error) => {
  fail("UNEXPECTED_ERROR", { error: error.message });
});
