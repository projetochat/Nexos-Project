import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["src/routes/campanhas.tsx", "src/lib/nexos-api.ts"].map((file) => ({
  file,
  content: readFileSync(resolve(root, file), "utf8"),
}));

const blocked = [
  { pattern: /@\/lib\/mvp/, reason: "MVP legacy runtime" },
  { pattern: /@\/lib\/mock|useStore\(/, reason: "mock campaign store" },
  { pattern: /supabase/i, reason: "Supabase operational dependency" },
  { pattern: /fake progress|progresso falso/i, reason: "fake progress" },
  { pattern: /setInterval\(/, reason: "setInterval executor" },
  { pattern: /setTimeout\(/, reason: "setTimeout executor" },
  { pattern: /hardcoded recipients|destinatarios hardcoded/i, reason: "hardcoded audience" },
  { pattern: /Campanha\[\]|type Campanha/, reason: "legacy mock campaign type" },
];

const violations = [];
for (const { file, content } of files) {
  for (const rule of blocked) {
    if (rule.pattern.test(content)) {
      violations.push(`${file}: ${rule.reason}`);
    }
  }
}

if (violations.length) {
  console.error("Campaign legacy runtime dependency check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Campaign legacy runtime dependency check passed.");
