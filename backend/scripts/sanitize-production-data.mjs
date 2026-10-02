import { PrismaClient, Prisma } from "../src/generated/prisma/index.js";
import { parseSanitizationArgs, verifyBackupArtifact } from "./production-sanitization-safety.mjs";

const prisma = new PrismaClient();
const options = parseSanitizationArgs(process.argv.slice(2));

try {
  if (options.apply) {
    const backup = await verifyBackupArtifact(options.backupReference, options.backupSha256);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('trixus-production-sanitization'))`,
        );
        const plan = await buildPlan(tx);
        const audit = await integrityAudit(tx);
        report("apply", plan, audit, backup.artifactType);
        assertSafe(plan, audit);
        await applyPlan(tx, plan);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 120_000,
      },
    );
    console.log(JSON.stringify({ event: "production-data.sanitization.applied", ok: true }));
  } else {
    const plan = await buildPlan(prisma);
    const audit = await integrityAudit(prisma);
    report("dry-run", plan, audit, null);
  }
} finally {
  await prisma.$disconnect();
}

async function buildPlan(db) {
  const [users, invitations, tenants, clients, customers, contacts] = await Promise.all([
    db.user.findMany({ select: { id: true, email: true } }),
    db.userInvitation.findMany({ select: { id: true, email: true } }),
    db.tenant.findMany({
      select: { id: true, billingEmail: true, technicalEmail: true, responsibleEmail: true },
    }),
    db.platformClient.findMany({ select: { id: true, responsibleEmail: true } }),
    db.customer.findMany({ select: { id: true, email: true } }),
    db.contact.findMany({ select: { id: true, email: true } }),
  ]);

  const userEmailCollisions = normalizedCollisions(users);
  const invalidRequiredEmails = [...users, ...invitations, ...clients].filter(
    (item) => normalizeEmail(item.email ?? item.responsibleEmail) === null,
  ).length;
  const changes = {
    users: changed(users, "email"),
    invitations: changed(invitations, "email"),
    tenants: tenants.flatMap((item) =>
      ["billingEmail", "technicalEmail", "responsibleEmail"].flatMap((field) => {
        const before = item[field];
        const after = normalizeEmail(before);
        return before !== after ? [{ id: item.id, field, value: after }] : [];
      }),
    ),
    clients: changed(clients, "responsibleEmail"),
    customers: changed(customers, "email"),
    contacts: changed(contacts, "email"),
  };
  return {
    changes,
    userEmailCollisions,
    invalidRequiredEmails,
    counts: Object.fromEntries(Object.entries(changes).map(([key, rows]) => [key, rows.length])),
  };
}

async function integrityAudit(db) {
  return {
    contactsWithForeignCustomer: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM contacts c
        JOIN customers customer ON customer.id = c."customerId"
        WHERE c."tenantId" <> customer."tenantId"`,
    ),
    contactsWithForeignDepartment: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM contacts c
        JOIN departments d ON d.id = c."departmentId"
        WHERE c."tenantId" <> d."tenantId"`,
    ),
    quickRepliesWithForeignDepartment: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM quick_replies qr
        JOIN departments d ON d.id = qr."departmentId"
        WHERE qr."tenantId" <> d."tenantId"`,
    ),
    contactTagsAcrossTenants: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM contact_tags ct
        JOIN contacts c ON c.id = ct."contactId"
        JOIN tags t ON t.id = ct."tagId"
        WHERE ct."tenantId" <> c."tenantId" OR ct."tenantId" <> t."tenantId"`,
    ),
    membershipsAcrossTenants: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM department_memberships dm
        JOIN departments d ON d.id = dm."departmentId"
        JOIN tenant_memberships tm ON tm.id = dm."membershipId"
        WHERE dm."tenantId" <> d."tenantId" OR dm."tenantId" <> tm."tenantId"`,
    ),
    duplicateActiveQuickReplyShortcuts: await readCount(
      db,
      Prisma.sql`SELECT count(*)::int AS count FROM (
        SELECT "tenantId", "normalizedShortcut" FROM quick_replies
        WHERE "archivedAt" IS NULL
        GROUP BY "tenantId", "normalizedShortcut" HAVING count(*) > 1
      ) duplicates`,
    ),
  };
}

async function applyPlan(tx, plan) {
  for (const row of plan.changes.users) {
    await tx.user.update({ where: { id: row.id }, data: { email: row.value } });
  }
  for (const row of plan.changes.invitations) {
    await tx.userInvitation.update({ where: { id: row.id }, data: { email: row.value } });
  }
  for (const row of plan.changes.tenants) {
    await tx.tenant.update({ where: { id: row.id }, data: { [row.field]: row.value } });
  }
  for (const row of plan.changes.clients) {
    await tx.platformClient.update({
      where: { id: row.id },
      data: { responsibleEmail: row.value },
    });
  }
  for (const row of plan.changes.customers) {
    await tx.customer.update({ where: { id: row.id }, data: { email: row.value } });
  }
  for (const row of plan.changes.contacts) {
    await tx.contact.update({ where: { id: row.id }, data: { email: row.value } });
  }
}

function assertSafe(plan, audit) {
  const blocked =
    plan.userEmailCollisions.length > 0 ||
    plan.invalidRequiredEmails > 0 ||
    Object.values(audit).some(Boolean);
  if (blocked) {
    throw new Error("Sanitização bloqueada: resolva colisões e violações de isolamento primeiro.");
  }
}

function report(mode, plan, audit, backupArtifactType) {
  console.log(
    JSON.stringify(
      {
        event: "production-data.sanitization",
        mode,
        backupVerified: mode === "apply",
        backupArtifactType,
        planned: plan.counts,
        blockers: {
          normalizedUserEmailCollisions: plan.userEmailCollisions.length,
          invalidRequiredEmails: plan.invalidRequiredEmails,
          tenantIntegrityViolations: audit,
        },
      },
      null,
      2,
    ),
  );
}

function changed(rows, field) {
  return rows.flatMap((row) => {
    const before = row[field];
    const after = normalizeEmail(before);
    return before !== after ? [{ id: row.id, value: after }] : [];
  });
}

function normalizedCollisions(users) {
  const groups = new Map();
  for (const user of users) {
    const normalized = normalizeEmail(user.email);
    const ids = groups.get(normalized) ?? [];
    ids.push(user.id);
    groups.set(normalized, ids);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function normalizeEmail(value) {
  if (value === null || value === undefined) return null;
  return value.trim().toLocaleLowerCase("en-US") || null;
}

async function readCount(db, query) {
  const rows = await db.$queryRaw(query);
  return Number(rows[0]?.count ?? 0);
}
