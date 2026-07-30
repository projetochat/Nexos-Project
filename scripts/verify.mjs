import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public",
  JWT_SECRET: process.env.JWT_SECRET ?? "local-access-secret-minimum-32-chars",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "local-refresh-secret-minimum-32-chars",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bunAvailable = hasCommand(bun());
const gates = bunAvailable
  ? [
      ["frontend:typecheck", bunx(), ["tsc", "--noEmit"]],
      ["frontend:lint-baseline", bun(), ["run", "lint"]],
      ["frontend:build", bun(), ["run", "build"]],
      ["backend:build", bun(), ["run", "backend:build"]],
      ["backend:test", bun(), ["run", "backend:test"]],
      ["security:xss", bun(), ["run", "test:security"]],
    ]
  : [
      ["frontend:typecheck", bin("tsc"), ["--noEmit"]],
      ["frontend:lint-baseline", process.execPath, ["scripts/check-eslint-baseline.mjs"]],
      ["frontend:build", bin("vite"), ["build"]],
      ["backend:build:tsc", backendBin("tsc"), ["-p", "backend/tsconfig.build.json"]],
      ["backend:build:copy-prisma", process.execPath, ["backend/scripts/copy-prisma-client.mjs"]],
      ["backend:test", backendBin("vitest"), ["run"], { cwd: resolve(root, "backend") }],
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
