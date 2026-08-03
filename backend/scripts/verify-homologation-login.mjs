#!/usr/bin/env node

const apiUrl = (
  process.env.VITE_NEXOS_API_URL ??
  process.env.NEXOS_API_URL ??
  "http://localhost:3001/api"
).replace(/\/$/, "");
const accounts = [
  {
    email: (process.env.SEED_ADMIN_EMAIL ?? "admin@nexo.app").trim(),
    password: process.env.SEED_ADMIN_PASSWORD ?? "demo1234",
    role: "tenant_admin",
  },
  {
    email: (process.env.SEED_AGENT_EMAIL ?? "atendente@nexo.app").trim(),
    password: process.env.SEED_AGENT_PASSWORD ?? "demo1234",
    role: "agent",
  },
];

async function main() {
  const health = await requestJson(`${apiUrl}/health`, { method: "GET" });
  if (!health.ok || health.database !== "up") {
    fail("HEALTH_NOT_READY", { apiUrl, health });
  }

  const results = [];
  for (const account of accounts) {
    const email = account.email.toLowerCase();
    const login = await requestJson(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });

    if (!login.accessToken || !login.refreshToken) fail("TOKENS_MISSING", { email });
    if (login.user?.email !== email) fail("USER_MISMATCH", { email });
    if (login.tenant?.slug !== "homologacao")
      fail("TENANT_MISMATCH", { email, tenant: login.tenant });
    if (login.membership?.role !== account.role) {
      fail("MEMBERSHIP_ROLE_MISMATCH", { email, membership: login.membership });
    }

    const me = await requestJson(`${apiUrl}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${login.accessToken}` },
    });
    if (me.user?.email !== email) fail("ME_USER_MISMATCH", { email });
    if (me.tenant?.slug !== "homologacao") fail("ME_TENANT_MISMATCH", { email, tenant: me.tenant });
    if (me.membership?.role !== account.role)
      fail("ME_ROLE_MISMATCH", { email, membership: me.membership });
    results.push({
      user: email,
      tenant: me.tenant.slug,
      membershipRole: me.membership.role,
    });
  }

  console.info(
    JSON.stringify(
      {
        event: "homologation.login.pass",
        apiUrl,
        accounts: results,
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
