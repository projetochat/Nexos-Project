import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inboxFiles = [
  "src/routes/inbox.tsx",
  "src/routes/inbox.index.tsx",
  "src/routes/inbox.$conversationId.tsx",
];

const forbidden = [
  { pattern: /@\/lib\/mvp/, label: "@/lib/mvp" },
  { pattern: /@\/integrations\/supabase/, label: "@/integrations/supabase" },
  { pattern: /\b(CATALOG|CONTACTS|CUSTOMERS|QUICK_REPLIES|TAGS)\b/, label: "legacy MVP aliases" },
];

const failures = [];

for (const file of inboxFiles) {
  const content = readFileSync(resolve(file), "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) failures.push(`${file}: ${rule.label}`);
  }
}

if (failures.length > 0) {
  console.error("Inbox legacy runtime dependency detected:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Inbox legacy runtime dependency check passed.");
