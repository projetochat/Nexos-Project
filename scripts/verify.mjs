import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://nexos:nexos_dev_password@127.0.0.1:5432/nexos?schema=public",
  NEXOS_TEST_DATABASE_URL:
    process.env.NEXOS_TEST_DATABASE_URL ??
    "postgresql://nexos:nexos_dev_password@127.0.0.1:5432/nexos_1200?schema=public",
  JWT_SECRET: process.env.JWT_SECRET ?? "local-access-secret-minimum-32-chars",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "local-refresh-secret-minimum-32-chars",
  SEED_MODE: "test",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bunAvailable = hasCommand(bun());
const gates = bunAvailable
  ? [
      ["frontend:typecheck", bunx(), ["tsc", "--noEmit"]],
      ["frontend:lint-baseline", bun(), ["run", "lint"]],
      ["frontend:build", bun(), ["run", "build"]],
      ["inbox:legacy-runtime", bun(), ["run", "test:inbox-legacy-runtime"]],
      ["ticket:legacy-runtime", bun(), ["run", "test:ticket-legacy-runtime"]],
      ["campaign:legacy-runtime", bun(), ["run", "test:campaign-legacy-runtime"]],
      ["platform-admin:legacy-runtime", bun(), ["run", "test:platform-admin-legacy-runtime"]],
      ["prc02:legacy-surface-runtime", bun(), ["run", "test:prc02-legacy-surface-runtime"]],
      ["prc04:ticket-storage-contract", bun(), ["run", "test:prc04-ticket-storage-contract"]],
      [
        "prc05:campaign-automation-queue-contract",
        bun(),
        ["run", "test:prc05-campaign-automation-queue-contract"],
      ],
      [
        "prc06:platform-admin-final-contract",
        bun(),
        ["run", "test:prc06-platform-admin-final-contract"],
      ],
      [
        "prc07:reports-operations-contract",
        bun(),
        ["run", "test:prc07-reports-operations-contract"],
      ],
      ["operational:runtime", bun(), ["run", "test:operational-runtime"]],
      ["backend:build", bun(), ["run", "backend:build"]],
      ["backend:test", bun(), ["run", "backend:test"]],
      ["redis:queue-smoke", bun(), ["backend/scripts/verify-redis-queue.mjs"]],
      ["security:xss", bun(), ["run", "test:security"]],
    ]
  : [
      ["frontend:typecheck", bin("tsc"), ["--noEmit"]],
      ["frontend:lint-baseline", process.execPath, ["scripts/check-eslint-baseline.mjs"]],
      ["frontend:build", bin("vite"), ["build"]],
      ["inbox:legacy-runtime", process.execPath, ["scripts/check-inbox-legacy-runtime.mjs"]],
      ["ticket:legacy-runtime", process.execPath, ["scripts/check-ticket-legacy-runtime.mjs"]],
      ["campaign:legacy-runtime", process.execPath, ["scripts/check-campaign-legacy-runtime.mjs"]],
      [
        "platform-admin:legacy-runtime",
        process.execPath,
        ["scripts/check-platform-admin-legacy-runtime.mjs"],
      ],
      [
        "prc02:legacy-surface-runtime",
        process.execPath,
        ["scripts/check-prc02-legacy-surface-runtime.mjs"],
      ],
      [
        "prc04:ticket-storage-contract",
        process.execPath,
        ["scripts/check-prc04-ticket-storage-contract.mjs"],
      ],
      [
        "prc05:campaign-automation-queue-contract",
        process.execPath,
        ["scripts/check-prc05-campaign-automation-queue-contract.mjs"],
      ],
      [
        "prc06:platform-admin-final-contract",
        process.execPath,
        ["scripts/check-prc06-platform-admin-final-contract.mjs"],
      ],
      [
        "prc07:reports-operations-contract",
        process.execPath,
        ["scripts/check-prc07-reports-operations-contract.mjs"],
      ],
      ["operational:runtime", bin("vitest"), ["run", "src/lib/operational-runtime-rules.test.ts"]],
      ["backend:build:tsc", backendBin("tsc"), ["-p", "backend/tsconfig.build.json"]],
      ["backend:build:copy-prisma", process.execPath, ["backend/scripts/copy-prisma-client.mjs"]],
      ["backend:test", backendBin("vitest"), ["run"], { cwd: resolve(root, "backend") }],
      ["redis:queue-smoke", process.execPath, ["backend/scripts/verify-redis-queue.mjs"]],
      [
        "security:xss",
        bin("vitest"),
        ["run", "src/lib/sanitize-html.test.ts", "--environment", "jsdom"],
      ],
    ];

for (const [name, command, args, options = {}] of gates) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    env,
    cwd: options.cwd ?? root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`\nverify failed at ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nverify passed");

function bun() {
  return process.platform === "win32" ? "bun.exe" : "bun";
}

function bunx() {
  return process.platform === "win32" ? "bunx.exe" : "bunx";
}

function bin(name) {
  return resolve(root, `node_modules/.bin/${name}${process.platform === "win32" ? ".exe" : ""}`);
}

function backendBin(name) {
  return resolve(
    root,
    `backend/node_modules/.bin/${name}${process.platform === "win32" ? ".exe" : ""}`,
  );
}

function hasCommand(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}
