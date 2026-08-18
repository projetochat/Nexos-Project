import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  campaignPage: "src/routes/campanhas.tsx",
  automationPage: "src/routes/automacoes.tsx",
  api: "src/lib/nexos-api.ts",
  campaignQueue: "backend/src/campaigns/campaign-dispatch.queue.ts",
  campaignWorker: "backend/src/campaigns/campaign-dispatch.worker.ts",
  health: "backend/src/health/health.controller.ts",
  docsCampaigns: "docs/CAMPAIGNS.md",
  docsAutomations: "docs/AUTOMATIONS.md",
  docsOperations: "docs/OPERATIONS.md",
};

const contents = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readFileSync(resolve(root, file), "utf8")]),
);

const failures = [];

expectAbsent("campaign runtime", `${contents.campaignPage}\n${contents.api}`, [
  [/@\/lib\/mvp/, "MVP legacy runtime"],
  [/@\/lib\/mock|useStore\(/, "mock campaign store"],
  [/supabase/i, "Supabase operational dependency"],
  [/fake progress|progresso falso/i, "fake progress"],
  [/setInterval\(|setTimeout\(/, "timer executor"],
  [/hardcoded recipients|destinatarios hardcoded/i, "hardcoded audience"],
]);

expectAbsent("automation runtime", `${contents.automationPage}\n${contents.api}`, [
  [/@\/lib\/mvp/, "MVP legacy runtime"],
  [/@\/lib\/mock|useStore\(/, "mock automation store"],
  [/supabase/i, "Supabase operational dependency"],
]);

expectPresent("campaign API contract", contents.api, [
  [/\/campaigns\/audience-preview/, "audience preview endpoint"],
  [/\/campaigns\/\$\{id\}\/start/, "start endpoint"],
  [/\/campaigns\/\$\{id\}\/schedule/, "schedule endpoint"],
  [/\/campaigns\/\$\{id\}\/cancel/, "cancel endpoint"],
  [/\/campaigns\/\$\{id\}\/duplicate/, "duplicate endpoint"],
  [/\/campaigns\/\$\{id\}\/recipients/, "recipients endpoint"],
  [/\/campaigns\/\$\{id\}\/stats/, "stats endpoint"],
]);

expectPresent("automation UI/API contract", `${contents.automationPage}\n${contents.api}`, [
  [/BOT_REPLY/, "bot reply action"],
  [/ASSIGN_DEPARTMENT/, "assign department action"],
  [/NOTIFY_TEAM/, "notify team action"],
  [/automationApi\.archive/, "automation archive action"],
  [/organizationApi\.listDepartments/, "department-backed assignment UI"],
]);

expectPresent("campaign queue contract", `${contents.campaignQueue}\n${contents.campaignWorker}`, [
  [/CAMPAIGN_DISPATCH_QUEUE = "campaign-dispatch"/, "campaign BullMQ queue name"],
  [/attempts:\s*3/, "retry attempts"],
  [/backoff:\s*\{\s*type:\s*"exponential"/, "exponential retry"],
  [/removeOnFail:\s*false/, "failed jobs retained"],
  [/limiter:\s*\{[\s\S]*messagesPerMinute/, "rate limiter"],
  [/campaign\.job\.failed/, "failure log event"],
  [/reconcileScheduledCampaigns/, "scheduler reconciliation"],
]);

expectPresent("health contract", contents.health, [
  [/campaignQueue/, "campaign queue health"],
  [/campaignWorker/, "campaign worker health"],
  [/campaignScheduler/, "campaign scheduler health"],
]);

expectPresent(
  "docs contract",
  `${contents.docsCampaigns}\n${contents.docsAutomations}\n${contents.docsOperations}`,
  [
    [/PRC-05/, "PRC-05 documentation"],
    [/audiencia/, "audience documentation"],
    [/preview/, "preview documentation"],
    [/agendamento/, "schedule documentation"],
    [/cancelamento/, "cancel documentation"],
    [/retry/, "retry documentation"],
    [/limites de plano/, "plan limits documentation"],
    [/logs operacionais/, "operational logs documentation"],
  ],
);

if (failures.length > 0) {
  console.error("PRC-05 campaign/automation/queue contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PRC-05 campaign/automation/queue contract passed");

function expectAbsent(label, value, checks) {
  for (const [pattern, reason] of checks) {
    if (pattern.test(value)) failures.push(`${label}: found ${reason}`);
  }
}

function expectPresent(label, value, checks) {
  for (const [pattern, reason] of checks) {
    if (!pattern.test(value)) failures.push(`${label}: missing ${reason}`);
  }
}
