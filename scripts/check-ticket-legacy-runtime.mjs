import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const route = resolve(root, "src/routes/chamados.tsx");
const source = readFileSync(route, "utf8");

const forbidden = [
  { pattern: /@\/lib\/mvp/, label: "@/lib/mvp" },
  { pattern: /integrations\/supabase|supabase\b/, label: "Supabase" },
  { pattern: /@\/lib\/mock|mock\/store|mock\/saas/, label: "mock store" },
  { pattern: /contentEditable/, label: "contentEditable" },
  { pattern: /\.innerHTML|dangerouslySetInnerHTML|insertHTML/, label: "unsafe HTML rendering" },
  { pattern: /FileReader|readAsDataURL|data:image\/|base64,/, label: "data URL inline asset" },
];

const failures = forbidden.filter(({ pattern }) => pattern.test(source));
if (failures.length) {
  console.error(
    `Ticket legacy runtime dependency check failed: ${failures.map((item) => item.label).join(", ")}`,
  );
  process.exit(1);
}

console.log("Ticket legacy runtime dependency check passed.");
