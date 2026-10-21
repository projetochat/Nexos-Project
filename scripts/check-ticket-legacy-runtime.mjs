import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chamados = readFileSync(resolve(root, "src/routes/chamados.tsx"), "utf8");
const inbox = readFileSync(resolve(root, "src/routes/inbox.$conversationId.tsx"), "utf8");
const api = readFileSync(resolve(root, "src/lib/trixus-api.ts"), "utf8");
const editor = readFileSync(resolve(root, "src/components/ticket-rich-text-editor.tsx"), "utf8");
const content = readFileSync(resolve(root, "src/components/ticket-rich-text-content.tsx"), "utf8");

const forbidden = [
  { pattern: /@\/lib\/mvp/, label: "@/lib/mvp" },
  { pattern: /integrations\/supabase|supabase\b/, label: "Supabase" },
  { pattern: /@\/lib\/mock|mock\/store|mock\/saas/, label: "mock store" },
  { pattern: /contentEditable/, label: "contentEditable" },
  { pattern: /\.innerHTML|dangerouslySetInnerHTML|insertHTML/, label: "unsafe HTML rendering" },
  { pattern: /FileReader|readAsDataURL|data:image\/|base64,/, label: "data URL inline asset" },
  { pattern: /contentBase64|arrayBufferToBase64/, label: "base64 attachment upload" },
];

const failures = forbidden.filter(({ pattern }) => pattern.test(chamados));
// Rich editing is isolated behind tested DOM sanitization. Do not permit raw
// HTML sinks to return in the editor when the page delegates to this component.
if (/\.innerHTML|dangerouslySetInnerHTML|insertHTML/.test(editor)) {
  failures.push({ label: "raw HTML access in ticket editor" });
}
if (/\.innerHTML|dangerouslySetInnerHTML|insertHTML/.test(content)) {
  failures.push({ label: "raw HTML access in ticket content" });
}
for (const boundary of [
  "writeTicketEditorHtml",
  "normalizeTicketEditorHtml",
  "ticketEditorClipboardHtml",
  "insertTicketEditorHtml",
  "onPaste",
  "onDrop",
]) {
  if (!editor.includes(boundary)) failures.push({ label: `missing editor boundary: ${boundary}` });
}
if (!chamados.includes("TicketRichTextContent") || !content.includes("writeTicketEditorHtml")) {
  failures.push({ label: "missing sanitized ticket content boundary" });
}
if (
  /attachments\/init|attachments\/[^"`']+\/complete|contentBase64|arrayBufferToBase64/.test(api)
) {
  failures.push({ label: "legacy attachment API flow" });
}
if (/Geracao de chamados pela Inbox|API oficial de Chamados|window\.alert/.test(inbox)) {
  failures.push({ label: "Inbox ticket placeholder" });
}
if (failures.length) {
  console.error(
    `Ticket legacy runtime dependency check failed: ${failures.map((item) => item.label).join(", ")}`,
  );
  process.exit(1);
}

console.log("Ticket legacy runtime dependency check passed.");
