import { readFileSync } from "node:fs";

const checks = [];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

const platformController = read("backend/src/platform/platform.controller.ts");
const platformService = read("backend/src/platform/platform.service.ts");
const platformGuard = read("backend/src/platform/platform-auth.guard.ts");
const platformApi = read("src/lib/nexos-api.ts");
const appShell = read("src/components/app-shell.tsx");
const tenantDetailRoute = read("src/routes/admin.empresas.$tenantId.tsx");
const platformAdminDoc = read("docs/PLATFORM_ADMIN.md");
const impersonationDoc = read("docs/IMPERSONATION.md");
const plansDoc = read("docs/PLANS_AND_SUBSCRIPTIONS.md");

check(
  "platform controller exposes tenants, plans, subscriptions, invoices, audit, health and impersonation",
  includesAll(platformController, [
    '@Get("dashboard")',
    '@Get("health")',
    '@Get("tenants")',
    '@Get("plans")',
    '@Get("subscriptions")',
    '@Get("invoices")',
    '@Get("audit-logs")',
    '@Post("impersonation/start")',
    '@Get("impersonation/current")',
  ]),
);

check(
  "frontend platform API mirrors the platform control-plane routes",
  includesAll(platformApi, [
    "dashboard: ()",
    "health: ()",
    "tenants: (params",
    "tenant: (id",
    "suspendTenant:",
    "reactivateTenant:",
    "terminateTenant:",
    "plans: (params",
    "plan: (id",
    "subscriptions: (params",
    "subscription: (id",
    "invoices: (params",
    "invoice: (id",
    "auditLogs: (params",
    "auditLog: (id",
    "startImpersonation:",
    "stopImpersonation:",
    "currentImpersonation:",
  ]),
);

check(
  "impersonation banner is visible in operational shells and can restore the platform session",
  includesAll(appShell, [
    "function ImpersonationBanner()",
    "stopStoredPlatformImpersonation",
    "Ator real",
    "actorEmail",
    "expiresAt",
    "Encerrar acesso",
  ]) && (appShell.match(/<ImpersonationBanner \/>/g) ?? []).length >= 2,
);

check(
  "tenant detail starts impersonation through Platform API only",
  includesAll(tenantDetailRoute, [
    "platformApi.startImpersonation",
    "activatePlatformImpersonation",
    "impersonationReason",
    "O banner permanente mostra tenant",
  ]),
);

check(
  "platform guard keeps roles server-side and blocks high-risk actions during impersonation",
  includesAll(platformGuard, [
    "ADMIN",
    "SUPPORT",
    "READONLY",
    "highRiskPermissions",
    "IMPERSONATION_HIGH_RISK_ACTION_BLOCKED",
    "platform.subscriptions.update",
    "platform.tenants.terminate",
  ]),
);

check(
  "platform service audits lifecycle, billing and impersonation actions",
  includesAll(platformService, [
    "tenant.created",
    "tenant.suspended",
    "tenant.reactivated",
    "tenant.terminated",
    "plan.created",
    "plan.updated",
    "subscription.created",
    "subscription.changed",
    "subscription.cancelled",
    "invoice.created",
    "invoice.status.changed",
    "impersonation.started",
    "impersonation.stopped",
  ]),
);

check(
  "plan downgrade validates current usage before changing subscription",
  includesAll(platformService, [
    "assertDowngradeAllowed",
    "this.entitlements.getUsage",
    "PLAN_DOWNGRADE_LIMIT_EXCEEDED",
    "maxUsers",
    "maxDepartments",
    "maxConnections",
    "maxContacts",
    "maxCampaignRecipients",
    "maxStorageBytes",
  ]),
);

check(
  "official docs describe PRC-06 platform admin final gate",
  [platformAdminDoc, impersonationDoc, plansDoc].every((doc) => doc.includes("PRC-06")) &&
    includesAll(platformAdminDoc, [
      "tenants",
      "planos",
      "assinaturas",
      "financeiro manual",
      "auditoria",
      "impersonation",
      "limites por plano",
    ]),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
}

if (failed.length) {
  console.error(`\nPRC-06 platform admin final contract failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("\nPRC-06 platform admin final contract passed.");
