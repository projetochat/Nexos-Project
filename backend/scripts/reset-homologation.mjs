import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PlatformRole, PrismaClient } from "../src/generated/prisma/index.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(backendDir, "..");

const FORBIDDEN_DATABASES = new Set(["trixus", "postgres", "production", "prod"]);
const EXPLICIT_DATABASES = new Set(["trixus_0802", "trixus_homolog", "trixus_test"]);

export function databaseNameFromUrl(value) {
  const url = new URL(value);
  return url.pathname.replace(/^\//, "");
}

export function isAllowedHomologationDatabase(databaseName) {
  if (!databaseName || FORBIDDEN_DATABASES.has(databaseName)) return false;
  return (
    EXPLICIT_DATABASES.has(databaseName) ||
    databaseName.startsWith("trixus_08") ||
    databaseName.startsWith("trixus_homolog")
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
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "trixus",
    "-d",
    "postgres",
    "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target.databaseName}';`,
  ]);
  run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "dropdb",
    "-U",
    "trixus",
    "--if-exists",
    target.databaseName,
  ]);
  run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "createdb",
    "-U",
    "trixus",
    target.databaseName,
  ]);
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
  env.TRIXUS_ENVIRONMENT = "homologation";
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
    const counts = {
      tenants: await prisma.tenant.count(),
      users: await prisma.user.count(),
      platformAdmins: await prisma.user.count({
        where: { platformRole: PlatformRole.ADMIN },
      }),
      memberships: await prisma.tenantMembership.count(),
      departments: await prisma.department.count(),
      tags: await prisma.tag.count(),
      customers: await prisma.customer.count(),
      contactDepartments: await prisma.contactDepartment.count(),
      contactProfiles: await prisma.contactProfile.count(),
      quickReplies: await prisma.quickReply.count(),
      contacts: await prisma.contact.count(),
      conversations: await prisma.conversation.count(),
      messages: await prisma.message.count(),
      messagingConnections: await prisma.messagingConnection.count(),
      outboxEvents: await prisma.outboxEvent.count(),
    };
    if (
      counts.tenants !== 0 ||
      counts.users !== 1 ||
      counts.platformAdmins !== 1 ||
      counts.memberships !== 0 ||
      counts.departments !== 0 ||
      counts.tags !== 0 ||
      counts.customers !== 0 ||
      counts.contactDepartments !== 0 ||
      counts.contactProfiles !== 0 ||
      counts.quickReplies !== 0 ||
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
