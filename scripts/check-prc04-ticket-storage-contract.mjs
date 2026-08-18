import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  api: "src/lib/nexos-api.ts",
  page: "src/routes/chamados.tsx",
  controller: "backend/src/tickets/tickets.controller.ts",
  service: "backend/src/tickets/tickets.service.ts",
  ticketingDoc: "docs/TICKETING.md",
  apiDoc: "docs/API.md",
  storageDoc: "docs/STORAGE.md",
  deployDoc: "docs/DEPLOY.md",
};

const contents = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readFileSync(resolve(root, file), "utf8")]),
);

const failures = [];

expectAbsent("docs/TICKETING.md", contents.ticketingDoc, [
  [/attachments\/init/, "legacy attachment init endpoint"],
  [/attachments\/:attachmentId\/complete/, "legacy attachment complete endpoint"],
  [/Base64 pode trafegar/, "legacy local complete/base64 wording"],
]);

expectAbsent("docs/API.md", contents.apiDoc, [
  [/init\/complete/, "legacy init/complete wording"],
  [/contentBase64|arrayBufferToBase64/, "legacy base64 contract"],
]);

expectAbsent("runtime ticket API/page", `${contents.api}\n${contents.page}`, [
  [/attachments\/init/, "legacy attachment init runtime path"],
  [/attachments\/[^"`']+\/complete/, "legacy attachment complete runtime path"],
  [/contentBase64|arrayBufferToBase64/, "legacy base64 upload runtime"],
]);

expectPresent("backend controller", contents.controller, [
  [/@Post\(":id\/attachments"\)/, "binary attachment upload endpoint"],
  [/tickets\.attachments\.upload/, "upload permission enforcement"],
  [/@Get\(":id\/attachments\/:attachmentId\/inline"\)/, "inline preview endpoint"],
  [/@Get\(":id\/attachments\/:attachmentId\/download"\)/, "download endpoint"],
  [/@Delete\(":id\/attachments\/:attachmentId"\)/, "delete endpoint"],
  [/tickets\.attachments\.delete/, "delete permission enforcement"],
]);

expectPresent("backend service", contents.service, [
  [/ATTACHMENT_OBJECT_MISSING/, "missing private object guard"],
  [/ATTACHMENT_MIME_NOT_ALLOWED/, "MIME allowlist guard"],
  [/ATTACHMENT_TOO_LARGE/, "size limit guard"],
]);

expectPresent("docs/TICKETING.md", contents.ticketingDoc, [
  [/POST \/api\/tickets\/:id\/attachments/, "binary upload contract"],
  [/GET \/api\/tickets\/:id\/attachments\/:attachmentId\/inline/, "inline preview contract"],
  [/GET \/api\/tickets\/:id\/attachments\/:attachmentId\/download/, "download contract"],
]);

expectPresent("docs/STORAGE.md", contents.storageDoc, [
  [/Decisao PRC-04/, "PRC-04 storage decision"],
  [/storage privado local/, "local storage decision"],
  [/R2StorageProvider.*ainda nao e provider funcional/, "R2 boundary warning"],
  [/base64 nao faz parte do contrato publico de Tickets/, "no base64 public contract"],
]);

expectPresent("docs/DEPLOY.md", contents.deployDoc, [
  [/NEXOS_STORAGE_PROVIDER=local/, "local provider deploy command"],
  [/R2\/S3-compatible antes de habilitar anexos de tickets/, "production storage blocker"],
]);

if (failures.length > 0) {
  console.error("PRC-04 ticket/storage contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PRC-04 ticket/storage contract passed");

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
