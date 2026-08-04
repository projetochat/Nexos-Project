import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = [
  "src/routes/admin.index.tsx",
  "src/routes/admin.empresas.tsx",
  "src/routes/admin.empresas.$tenantId.tsx",
  "src/routes/admin.planos.tsx",
  "src/routes/admin.assinaturas.tsx",
  "src/routes/admin.financeiro.tsx",
  "src/routes/admin.auditoria.tsx",
  "src/routes/admin.logs.tsx",
  "src/routes/admin.monitoramento.tsx",
  "src/routes/admin.licencas.tsx",
  "src/routes/admin.suporte.tsx",
  "src/routes/admin.configuracoes.tsx",
];

const forbidden = [
  /@\/lib\/mock/gi,
  /lib\/mock/gi,
  /mock\/saas/gi,
  /supabase/gi,
  /setTimeout\s*\(/gi,
  /localStorage\.(?:setItem|getItem).*imperson/gi,
  /fake|falso|simulado/gi,
  /\b(?:alert|confirm|prompt)\s*\(/gi,
];

const failures = [];
for (const file of files) {
  const path = resolve(root, file);
  const content = readFileSync(path, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) failures.push(`${file}: ${pattern}`);
    pattern.lastIndex = 0;
  }
}

if (failures.length) {
  console.error("Platform admin legacy runtime check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("platform admin legacy runtime check passed");
