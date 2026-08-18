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

const controller = read("backend/src/operations/operations.controller.ts");
const service = read("backend/src/operations/operations.service.ts");
const metrics = read("backend/src/operations/operations-metrics.service.ts");
const api = read("src/lib/nexos-api.ts");
const dashboard = read("src/routes/index.tsx");
const history = read("src/routes/historico.tsx");
const reports = read("src/routes/relatorios.tsx");
const queues = read("src/routes/filas.tsx");
const filters = read("src/components/report-filters.tsx");
const docs = read("docs/OPERATIONS.md");
const normalizedDocs = docs.toLowerCase();

check(
  "operations controller exposes dashboard, history, timeline, attendance export and queues",
  includesAll(controller, [
    '@Get("dashboard")',
    '@Get("history/conversations")',
    '@Get("history/conversations/:id/timeline")',
    '@Get("reports/attendance")',
    '@Get("reports/attendance/export")',
    '@Get("queues")',
    '@RequirePermissions("conversations.read")',
    '@RequirePermissions("chat.leads.read")',
  ]),
);

check(
  "operations service calculates KPIs, filters real conversation data and logs queries",
  includesAll(service, [
    "operations.dashboard.query",
    "operations.history.query",
    "operations.report.query",
    "periodRange(query",
    "conversationWhere",
    "serializeConversation",
    "recentConversations",
    "MessageDirection.INBOUND",
    "MessageDirection.OUTBOUND",
  ]),
);

check(
  "metrics service documents SLA and excludes archived or ghost operational rows",
  includesAll(metrics, [
    "sla: percentage",
    "closedConversationWhere",
    "archivedAt: null",
    "leadsAtivos",
    "conversationMetricScope",
    "leadMetricScope",
  ]),
);

check(
  "exports support CSV, true XLSX and PDF response contracts",
  includesAll(service, [
    'format === "pdf"',
    'format === "xlsx"',
    "text/csv; charset=utf-8",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "nexos-atendimento.xlsx",
    "zipStore",
    "crc32",
    "%PDF-1.4",
  ]),
);

check(
  "frontend uses Operations API for dashboard, history, reports, export and queues",
  includesAll(api, [
    "dashboard: (params",
    "history: (params",
    "timeline: (conversationId",
    "report: (params",
    "exportAttendance: async",
    "queues: (params",
  ]) &&
    dashboard.includes("operationsApi.dashboard") &&
    history.includes("operationsApi.history") &&
    history.includes("operationsApi.timeline") &&
    reports.includes("operationsApi.report") &&
    reports.includes("operationsApi.exportAttendance") &&
    queues.includes("operationsApi.queues"),
);

check(
  "operational UI provides filters and realtime invalidation without legacy mock store",
  includesAll(filters, ["Periodo", "Status", "Cliente", "Departamento", "Busca"]) &&
    includesAll(`${dashboard}\n${history}\n${reports}\n${queues}`, [
      "onRealtimeEvent",
      "queryClient.invalidateQueries",
    ]) &&
    !`${dashboard}\n${history}\n${reports}\n${queues}`.includes("@/lib/mock"),
);

check(
  "official operations docs include PRC-07 gate",
  includesAll(normalizedDocs, [
    "prc-07",
    "indicadores",
    "filtros",
    "mensagens reais",
    "csv",
    "xlsx",
    "pdf",
    "filas",
    "sla",
  ]),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
}

if (failed.length) {
  console.error(`\nPRC-07 reports and operations contract failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("\nPRC-07 reports and operations contract passed.");
