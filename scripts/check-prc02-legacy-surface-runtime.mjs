import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const removedFiles = ["src/lib/api/index.ts"];
const redirectOnlyRoutes = [
  "src/routes/empresas.tsx",
  "src/routes/atendimento.clientes.tsx",
  "src/routes/atendimento.favoritos.tsx",
  "src/routes/atendimento.historico.tsx",
  "src/routes/atendimento.perfil.tsx",
];
const operationalFiles = [
  ...redirectOnlyRoutes,
  "src/routes/atendentes.tsx",
  "src/components/operator-shell.tsx",
];

const forbidden = [
  { pattern: /@\/lib\/mock/, label: "@/lib/mock" },
  { pattern: /mock\/store/, label: "mock/store" },
  { pattern: /mock\/types/, label: "mock/types" },
  { pattern: /useStore\s*\(/, label: "useStore(" },
  { pattern: /@\/lib\/api/, label: "@/lib/api" },
];

const failures = [];

for (const file of removedFiles) {
  if (existsSync(resolve(root, file))) failures.push(`${file}: legacy API facade still exists`);
}

for (const file of operationalFiles) {
  const content = readFileSync(resolve(root, file), "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) failures.push(`${file}: ${rule.label}`);
  }
}

for (const file of redirectOnlyRoutes) {
  const content = readFileSync(resolve(root, file), "utf8");
  if (!/throw redirect\(\{ to:/.test(content)) {
    failures.push(`${file}: expected explicit redirect`);
  }
}

const operatorShell = readFileSync(resolve(root, "src/components/operator-shell.tsx"), "utf8");
for (const legacyPath of [
  "/atendimento/clientes",
  "/atendimento/favoritos",
  "/atendimento/historico",
  "/atendimento/perfil",
]) {
  if (operatorShell.includes(legacyPath)) {
    failures.push(`src/components/operator-shell.tsx: legacy nav path ${legacyPath}`);
  }
}

if (failures.length) {
  console.error("PRC-02 legacy surface runtime check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PRC-02 legacy surface runtime check passed.");
