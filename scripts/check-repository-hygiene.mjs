import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maximumTrackedBytes = 5 * 1024 * 1024;
const allowedEnvironmentExamples = new Set([
  ".env.example",
  ".env.vps.example",
  "backend/.env.example",
]);
const allowedSqlRoots = ["backend/prisma/migrations/", "supabase/migrations/"];
// Reviewed fixtures/examples with intentional dummy credentials. Any content change invalidates the exception.
const credentialFixtureHashes = new Map([
  [".env.example", "3634fde45f8ce9e74e069638305085e5e0c3981da04071b6efa5552c31a9a86d"],
  [".env.vps.example", "404675c714baa0e8c63bbdd55cd52c36609c8e977c9a26878183de7c24ce3632"],
  ["backend/.env.example", "7ef2394a2c0e02e4c1c78c178f8f37b5da8b1a8d21b9d63d64b5f0f2b0075dec"],
  [
    "backend/src/auth/auth-session.spec.ts",
    "6bd059b6b89541dec2b2190442e4ac1810c8f347999d7f4f07607025632e2c9d",
  ],
  [
    "backend/src/auth/auth.service.spec.ts",
    "e30c97aa584bd5fd18cedf0b6c03c6de9df68c5baaa9bb92af4d4ba8a3f88d5e",
  ],
  [
    "backend/src/config/environment.spec.ts",
    "c5ab7b09033b7efbad163e3fc64597e780cd7498349fb6bcbab6c28892c2eb70",
  ],
  [
    "backend/src/homologation/reset-safety.spec.ts",
    "f810de0d1664b3b9af14695bbdf25a45c6a525e1cbf5cc21b8ab883f07259a7e",
  ],
  [
    "backend/src/messaging/evolution/evolution-webhook.translator.spec.ts",
    "0fc71c22089ac2dcffb81c89a64988fdf1b5f798fd11f8353f3ec5b96e7fcb01",
  ],
  [
    "backend/src/messaging/evolution/evolution-webhook.controller.spec.ts",
    "b0b1ca23a657e74c5b96a00f7bc73c4b6473df7ea6b192bd32ff2fe2f113fc15",
  ],
  [
    "backend/src/messaging/evolution/evolution.client.spec.ts",
    "3e867971bc7d31e2644eb3a1472d7d11ef7bf6936d7d48183c286a8866bd38d2",
  ],
  [
    "backend/src/messaging/evolution/evolution.config.spec.ts",
    "5a1065e8ebd99db75ea0ae86d7483955813c351657e64e38f59e2d71621d7bff",
  ],
  [
    "backend/src/messaging/media/remote-media-downloader.spec.ts",
    "812c56d2f4e35273eeb68fe13fd95811ed94dc7049d5cb5297ed9fbfecbdc715",
  ],
  [
    "backend/src/messaging/messaging-connections.service.spec.ts",
    "033da1d3950db0e54338b05676959a36c4b2444f0bbc6dd3c2d9fa19c080186f",
  ],
  [
    "backend/test/app.e2e-spec.ts",
    "93005a0885040854b47247498a5e3c7fd6d507981393ca4e09b7a238532c4f83",
  ],
  [
    "src/lib/trixus-api.test.ts",
    "86ffd31bd1547c1a13b6d344ca7757ebc841b48da9cbeb09a03da6bedd98b310",
  ],
  [
    "backend/src/platform/platform.service.spec.ts",
    "e2360b17d0448d7b2f77dfc4fa470aaf2710904e36efb0163526b19604a340ca",
  ],
  [
    "backend/src/users/administrator-credentials.spec.ts",
    "f94973e7fafc577a3f74b4150ed30080716821deafbd5793cf61269bf787fb1c",
  ],
  ["docker-compose.yml", "e1b7487a4272318be6ab9d37615eac4b0d1bfaa534071b8b59f21def6e6906f5"],
  ["docs/DATABASE.md", "b606076dfc202187f1e3887106852f736092db94ec72d65f52ee30cff06435d6"],
  ["docs/DEPLOY.md", "810da5b2a8701079191a0666b342ed1e3914cff73ac509bd0b46d80884742f7c"],
  ["docs/README.md", "77b5ec84df1ce6457804f9eb4bfe319cb090a0efc998509d091d9dad85590752"],
  [
    "scripts/production/test_preflight.py",
    "3629b57e429603e7f01225c9ab321428daaccc8bced2931bea71cc6947c2fe78",
  ],
  [
    "scripts/production/install.sh",
    "7a290c786aa9c8dca63fdea55f0223393d373044b406a7a53e1fbe2b725eeb01",
  ],
  ["scripts/verify.mjs", "9ecf2161c8c55d0bf5c960441506578b04fda142d696e5b5747b833b64f2f2dc"],
  [
    "sprints/rc-sprint-15-2/hotfix-outbound-worker/RELATORIO.md",
    "107325f260e4bf882e8368af0cefb295191bfd30399091482e0a7453ccbc9ea1",
  ],
  [
    "sprints/sprint-02/RELATORIO.md",
    "98cae692790cf136b05e59858059f030139c8cd67116c6a0fc15efaf07da1c6a",
  ],
  [
    "sprints/sprint-08.01/RELATORIO.md",
    "4548c2f70f08a5c3b29c0c42003cda3874df65adf6031885e6b2863a33a58ad6",
  ],
  [
    "sprints/sprint-08.02/RELATORIO.md",
    "80d085dfb2f2c16d6cbd11e7a2796653015d0208b0caff5e824b3cf5bd5ce453",
  ],
  [
    "sprints/sprint-13/RELATORIO.md",
    "3b101e5d8834c89bdbdce092c2bc10658c46f1401fef44984699246e11c6fa84",
  ],
]);
const generatedDirectoryPattern =
  /(^|\/)(\.output|dist|dist-ssr|coverage|build|logs|tmp|\.tmp|\.nyc_output)(\/|$)/;
const dumpPattern = /\.(dump|bak|backup|sqlite(?:3)?|db|sql\.gz)$/i;
const credentialPatterns = [
  { label: "chave privada PEM", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "token AWS", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "token GitHub", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { label: "chave OpenAI", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "token Slack", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];
const literalCredentialPattern =
  /\b[A-Za-z0-9_]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*(?:"([^"\r\n]{12,})"|'([^'\r\n]{12,})')/gi;
const unquotedEnvironmentCredentialPattern =
  /\b[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|API_KEY|ACCESS_TOKEN|PRIVATE_KEY)\b\s*[:=]\s*([A-Za-z0-9_!@%^&*+=:/?-]{12,})/g;
const credentialUrlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:([^\s/@]+)@/gi;
const documentedPlaceholderPattern =
  /^(?:change-?me|example(?:-value)?|placeholder(?:-value)?|dummy(?:-value)?|fake(?:-value)?|mock(?:-value)?|invalid(?:-value)?|ci-only(?:-password)?)$/i;

function gitOutput(argumentsList, encoding = "utf8") {
  return execFileSync("git", argumentsList, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function listFiles(mode) {
  const output =
    mode === "staged"
      ? gitOutput(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
      : gitOutput(["ls-files", "-z"]);
  return output
    .split("\0")
    .filter(Boolean)
    .map((name) => name.replaceAll("\\", "/"));
}

function stagedContent(filePath) {
  return gitOutput(["show", `:${filePath}`], null);
}

function workingTreeContent(filePath) {
  return readFileSync(path.join(repositoryRoot, filePath));
}

function contentSize(mode, filePath) {
  if (mode === "staged") {
    const value = Number.parseInt(gitOutput(["cat-file", "-s", `:${filePath}`]).trim(), 10);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Tamanho invalido: ${filePath}`);
    return value;
  }
  return statSync(path.join(repositoryRoot, filePath)).size;
}

function isProbablyText(buffer) {
  if (!buffer || buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  return !sample.includes(0);
}

function isForbiddenEnvironmentPath(filePath) {
  const name = path.posix.basename(filePath);
  return (name === ".env" || name.startsWith(".env.")) && !allowedEnvironmentExamples.has(filePath);
}

function isForbiddenSql(filePath) {
  return (
    filePath.toLowerCase().endsWith(".sql") &&
    !allowedSqlRoots.some((root) => filePath.startsWith(root))
  );
}

function containsUndocumentedCredential(text, pattern) {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match.slice(1).find((candidate) => candidate !== undefined);
    if (!documentedPlaceholderPattern.test(value)) return true;
  }
  return false;
}

function matchesKnownCredentialFixture(filePath, content) {
  const expectedHash = credentialFixtureHashes.get(filePath);
  if (!expectedHash) return false;
  return createHash("sha256").update(content).digest("hex") === expectedHash;
}

const modeArgument = process.argv[2] ?? "--staged";
if (!new Set(["--staged", "--tracked"]).has(modeArgument) || process.argv.length > 3) {
  console.error("Uso: node scripts/check-repository-hygiene.mjs [--staged|--tracked]");
  process.exit(2);
}
const mode = modeArgument.slice(2);
const violations = [];
for (const filePath of listFiles(mode)) {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".log")) violations.push([filePath, "arquivo de log"]);
  if (generatedDirectoryPattern.test(filePath)) violations.push([filePath, "artefato gerado"]);
  if (isForbiddenEnvironmentPath(filePath)) violations.push([filePath, "arquivo de ambiente"]);
  if (dumpPattern.test(lowerPath) || isForbiddenSql(filePath))
    violations.push([filePath, "dump ou banco local"]);

  const size = contentSize(mode, filePath);
  if (size > maximumTrackedBytes) {
    violations.push([filePath, `arquivo maior que ${maximumTrackedBytes} bytes`]);
    continue;
  }
  const content = mode === "staged" ? stagedContent(filePath) : workingTreeContent(filePath);
  if (content.length !== size) throw new Error(`Leitura incompleta: ${filePath}`);
  if (!isProbablyText(content)) continue;
  if (matchesKnownCredentialFixture(filePath, content)) continue;
  const text = content.toString("utf8");
  for (const rule of credentialPatterns) {
    if (rule.pattern.test(text)) violations.push([filePath, rule.label]);
  }
  if (containsUndocumentedCredential(text, literalCredentialPattern)) {
    violations.push([filePath, "credencial literal"]);
  }
  if (containsUndocumentedCredential(text, unquotedEnvironmentCredentialPattern)) {
    violations.push([filePath, "credencial de ambiente nao cotada"]);
  }
  if (containsUndocumentedCredential(text, credentialUrlPattern)) {
    violations.push([filePath, "URL com credencial"]);
  }
}

const uniqueViolations = [
  ...new Map(
    violations.map(([filePath, reason]) => [`${filePath}\0${reason}`, [filePath, reason]]),
  ).values(),
];
if (uniqueViolations.length > 0) {
  console.error("Verificacao de higiene recusou os seguintes arquivos:");
  for (const [filePath, reason] of uniqueViolations) console.error(`- ${filePath}: ${reason}`);
  console.error("Nenhum valor potencialmente sensivel foi exibido.");
  process.exit(1);
}
console.log(
  `Verificacao de higiene aprovada: ${listFiles(mode).length} arquivo(s) ${mode === "staged" ? "staged" : "rastreados"}.`,
);
