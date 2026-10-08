import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDisposableVerifyDatabase,
  assertDisposableVerifyRedis,
} from "./verify-resource-safety.mjs";

const testDatabase = assertDisposableVerifyDatabase({
  databaseUrl: process.env.TRIXUS_TEST_DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  confirmation: process.env.TRIXUS_VERIFY_DISPOSABLE_DATABASE,
});
const testRedis = assertDisposableVerifyRedis({
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV,
  confirmation: process.env.TRIXUS_VERIFY_DISPOSABLE_REDIS,
});

const env = {
  ...process.env,
  DATABASE_URL: testDatabase.databaseUrl,
  TRIXUS_TEST_DATABASE_URL: testDatabase.databaseUrl,
  REDIS_URL: testRedis.redisUrl,
  JWT_SECRET: process.env.JWT_SECRET ?? "local-access-secret-minimum-32-chars",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "local-refresh-secret-minimum-32-chars",
  TRIXUS_PLATFORM_ADMIN_EMAIL: process.env.TRIXUS_PLATFORM_ADMIN_EMAIL ?? "platform@trixus.app",
  TRIXUS_PLATFORM_ADMIN_PASSWORD: process.env.TRIXUS_PLATFORM_ADMIN_PASSWORD ?? "demo1234",
  TRIXUS_ENVIRONMENT: "staging",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bunAvailable = hasCommand(bun());
const gates = bunAvailable
  ? [
      ["repository:hygiene", bun(), ["run", "hygiene:check:tracked"]],
      ["frontend:typecheck", bunx(), ["tsc", "--noEmit"]],
      ["frontend:lint-baseline", bun(), ["run", "lint"]],
      ["frontend:test", bun(), ["run", "test:frontend"]],
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
      [
        "backend:test-db:migrate",
        bun(),
        ["run", "--cwd", "backend", "prisma:migrate:deploy"],
        { env: { ...env, DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL } },
      ],
      [
        "backend:test-db:seed",
        bun(),
        ["run", "--cwd", "backend", "prisma:seed:test-fixtures"],
        {
          env: {
            ...env,
            DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL,
            TRIXUS_TEST_FIXTURE_MODE: "demo",
          },
        },
      ],
      [
        "backend:test",
        bun(),
        ["run", "backend:test"],
        { env: { ...env, DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL } },
      ],
      ["redis:queue-smoke", bun(), ["backend/scripts/verify-redis-queue.mjs"]],
      ["security:xss", bun(), ["run", "test:security"]],
    ]
  : [
      [
        "repository:hygiene",
        process.execPath,
        ["scripts/check-repository-hygiene.mjs", "--tracked"],
      ],
      ["frontend:typecheck", bin("tsc"), ["--noEmit"]],
      ["frontend:lint-baseline", process.execPath, ["scripts/check-eslint-baseline.mjs"]],
      [
        "frontend:test",
        bin("vitest"),
        [
          "run",
          "--exclude",
          ".continuity/**",
          "--exclude",
          ".codex-backups/**",
          "--exclude",
          ".task-backups/**",
          "--exclude",
          "tmp/**",
          "--exclude",
          "backups/**",
          "--exclude",
          "backend/**",
        ],
      ],
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
      [
        "backend:test-db:migrate",
        process.execPath,
        ["scripts/migrate-deploy-safe.mjs"],
        {
          cwd: resolve(root, "backend"),
          env: { ...env, DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL },
        },
      ],
      [
        "backend:test-db:seed",
        process.execPath,
        ["backend/node_modules/tsx/dist/cli.mjs", "backend/prisma/test-fixtures.ts"],
        {
          env: {
            ...env,
            DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL,
            TRIXUS_TEST_FIXTURE_MODE: "demo",
          },
        },
      ],
      [
        "backend:test",
        backendBin("vitest"),
        ["run"],
        {
          cwd: resolve(root, "backend"),
          env: { ...env, DATABASE_URL: env.TRIXUS_TEST_DATABASE_URL },
        },
      ],
      ["redis:queue-smoke", process.execPath, ["backend/scripts/verify-redis-queue.mjs"]],
      [
        "security:xss",
        bin("vitest"),
        [
          "run",
          "src/lib/sanitize-html.test.ts",
          "src/lib/ticket-editor-dom.test.ts",
          "src/components/ticket-rich-text-editor.test.tsx",
          "--environment",
          "jsdom",
        ],
      ],
    ];

for (const [name, command, args, options = {}] of gates) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    env: options.env ?? env,
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
