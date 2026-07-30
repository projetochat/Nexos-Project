import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public",
  JWT_SECRET: process.env.JWT_SECRET ?? "local-access-secret-minimum-32-chars",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "local-refresh-secret-minimum-32-chars",
};

const gates = [
  ["frontend:typecheck", bunx(), ["tsc", "--noEmit"]],
  ["frontend:lint-baseline", bun(), ["run", "lint"]],
  ["frontend:build", bun(), ["run", "build"]],
  ["backend:build", bun(), ["run", "backend:build"]],
  ["backend:test", bun(), ["run", "backend:test"]],
  ["security:xss", bun(), ["run", "test:security"]],
];

for (const [name, command, args] of gates) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, args, {
    env,
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
