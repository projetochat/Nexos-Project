import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chamados = readFileSync(resolve(root, "src/routes/chamados.tsx"), "utf8");
const inbox = readFileSync(resolve(root, "src/routes/inbox.$conversationId.tsx"), "utf8");
const api = readFileSync(resolve(root, "src/lib/nexos-api.ts"), "utf8");

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
