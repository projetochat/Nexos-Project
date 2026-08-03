import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/index.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(backendDir, "..");

const FORBIDDEN_DATABASES = new Set(["nexos", "postgres", "production", "prod"]);
const EXPLICIT_DATABASES = new Set(["nexos_0802", "nexos_homolog", "nexos_test"]);

export function databaseNameFromUrl(value) {
  const url = new URL(value);
  return url.pathname.replace(/^\//, "");
}

export function isAllowedHomologationDatabase(databaseName) {
  if (!databaseName || FORBIDDEN_DATABASES.has(databaseName)) return false;
  return (
    EXPLICIT_DATABASES.has(databaseName) ||
    databaseName.startsWith("nexos_08") ||
    databaseName.startsWith("nexos_homolog")
  );
}

export function assertSafeResetTarget(input) {
  if (!input.confirm) {
    throw new Error("RESET_CONFIRM_REQUIRED: use --confirm para resetar homologacao.");
  }
  if (input.nodeEnv === "production") {
    throw new Error("RESET_PRODUCTION_BLOCKED: NODE_ENV=production.");
  }

  const url = new URL(input.databaseUrl);
  const databaseName = databaseNameFromUrl(input.databaseUrl);
  const host = url.hostname.toLowerCase();
  if (host.includes("prod") || host.includes("render") || host.includes("supabase")) {
    throw new Error("RESET_PRODUCTION_HOST_BLOCKED: host nao permitido.");
  }
  if (!isAllowedHomologationDatabase(databaseName)) {
    throw new Error(`RESET_DATABASE_NOT_ALLOWED: ${databaseName}`);
  }
  return { databaseName, host };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ausente.");

  const target = assertSafeResetTarget({
    databaseUrl,
    nodeEnv: process.env.NODE_ENV,
    confirm,
  });

  console.log(
    JSON.stringify(
      {
        event: "homologation.reset.plan",
        database: target.databaseName,
        host: target.host,
        steps: ["drop", "create", "migrate", "generate", "seed", "validate"],
      },
      null,
      2,
    ),
  );

  run("docker", [
    "exec",
    "nexos-postgres",
    "psql",
    "-U",
    "nexos",
    "-d",
    "postgres",
    "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target.databaseName}';`,
  ]);
  run("docker", [
    "exec",
    "nexos-postgres",
    "dropdb",
    "-U",
    "nexos",
    "--if-exists",
    target.databaseName,
  ]);
  run("docker", ["exec", "nexos-postgres", "createdb", "-U", "nexos", target.databaseName]);
  run("bun", [
    "--cwd",
    "backend",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);
  run("bun", ["run", "backend:prisma:generate"]);
  const env = { ...process.env };
  delete env.SEED_DEMO_DATA;
  env.SEED_MODE = "homologation";
  run("bun", ["--cwd", "backend", "prisma", "db", "seed"], { env });

  const counts = await validateCounts(databaseUrl);
  console.log(
    JSON.stringify(
      { event: "homologation.reset.pass", database: target.databaseName, counts },
      null,
      2,
    ),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(`RESET_STEP_FAILED: ${command} ${args.join(" ")}`);
  }
}

async function validateCounts(databaseUrl) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "homologacao" } });
    const counts = {
      tenants: await prisma.tenant.count(),
      users: await prisma.user.count({ where: { memberships: { some: { tenantId: tenant.id } } } }),
      memberships: await prisma.tenantMembership.count({ where: { tenantId: tenant.id } }),
      departments: await prisma.department.count({ where: { tenantId: tenant.id } }),
      contacts: await prisma.contact.count({ where: { tenantId: tenant.id } }),
      conversations: await prisma.conversation.count({ where: { tenantId: tenant.id } }),
      messages: await prisma.message.count({ where: { tenantId: tenant.id } }),
      messagingConnections: await prisma.messagingConnection.count({
        where: { tenantId: tenant.id },
      }),
      outboxEvents: await prisma.outboxEvent.count({ where: { tenantId: tenant.id } }),
    };
    if (
      counts.tenants !== 1 ||
      counts.users !== 1 ||
      counts.memberships !== 1 ||
      counts.departments !== 1 ||
      counts.contacts !== 0 ||
      counts.conversations !== 0 ||
      counts.messages !== 0 ||
      counts.messagingConnections !== 0 ||
      counts.outboxEvents !== 0
    ) {
      throw new Error(`RESET_COUNT_VALIDATION_FAILED: ${JSON.stringify(counts)}`);
    }
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}
