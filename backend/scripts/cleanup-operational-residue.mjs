import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const tenantSlug = readArg("--tenant-slug") ?? "homologacao";

try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    console.log(JSON.stringify({ ok: false, tenant: tenantSlug, error: "tenant_not_found" }));
    process.exitCode = 1;
  } else {
    const audit = await auditTenant(tenant.id);
    const plan = await buildPlan(tenant.id);
    console.log(
      JSON.stringify(
        {
          event: "operations.cleanup.audit",
          mode: confirm ? "confirm" : "dry-run",
          tenant: tenant.slug,
          audit,
          planned: plan.planned,
        },
        null,
        2,
      ),
    );
    if (confirm) await applyPlan(tenant.id, plan);
    const after = await auditTenant(tenant.id);
    console.log(
      JSON.stringify(
        {
          event: "operations.cleanup.result",
          tenant: tenant.slug,
          applied: confirm,
          after,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await prisma.$disconnect();
}

async function buildPlan(tenantId) {
  const ghostDepartments = await prisma.department.findMany({
    where: { tenantId, name: { equals: "Teste", mode: "insensitive" } },
    select: { id: true, name: true, active: true },
  });
  const archivedConnections = await prisma.messagingConnection.findMany({
    where: {
      tenantId,
      OR: [{ archivedAt: { not: null } }, { status: "REMOVED" }],
      conversations: { none: {} },
      messages: { none: {} },
    },
    select: { id: true },
  });
  const closedStatusWithoutClosedAt = await prisma.conversation.findMany({
    where: { tenantId, status: "FECHADA", closedAt: null, archivedAt: null },
    select: { id: true, updatedAt: true },
  });
  const closedAtWithoutClosedStatus = await prisma.conversation.findMany({
    where: { tenantId, status: { not: "FECHADA" }, closedAt: { not: null }, archivedAt: null },
    select: { id: true },
  });
  return {
    planned: {
      ghostDepartments: ghostDepartments.length,
      archivedConnectionsWithoutHistory: archivedConnections.length,
      closedStatusWithoutClosedAt: closedStatusWithoutClosedAt.length,
      closedAtWithoutClosedStatus: closedAtWithoutClosedStatus.length,
    },
    ids: {
      ghostDepartments: ghostDepartments.map((item) => item.id),
      archivedConnections: archivedConnections.map((item) => item.id),
      closedStatusWithoutClosedAt: closedStatusWithoutClosedAt.map((item) => ({
        id: item.id,
        closedAt: item.updatedAt,
      })),
      closedAtWithoutClosedStatus: closedAtWithoutClosedStatus.map((item) => item.id),
    },
  };
}

async function applyPlan(tenantId, plan) {
  await prisma.$transaction(async (tx) => {
    const departmentIds = plan.ids.ghostDepartments;
    if (departmentIds.length) {
      await tx.departmentMembership.deleteMany({
        where: { tenantId, departmentId: { in: departmentIds } },
      });
      await tx.contact.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.conversation.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.lead.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.ticket.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.notification.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.quickReply.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.automationRule.updateMany({
        where: { tenantId, departmentId: { in: departmentIds } },
        data: { departmentId: null },
      });
      await tx.department.deleteMany({ where: { tenantId, id: { in: departmentIds } } });
    }
    await tx.messagingConnection.deleteMany({
      where: {
        tenantId,
        id: { in: plan.ids.archivedConnections },
        conversations: { none: {} },
        messages: { none: {} },
      },
    });
    for (const item of plan.ids.closedStatusWithoutClosedAt) {
      await tx.conversation.update({
        where: { id: item.id },
        data: { closedAt: item.closedAt },
      });
    }
    await tx.conversation.updateMany({
      where: { tenantId, id: { in: plan.ids.closedAtWithoutClosedStatus } },
      data: { status: "FECHADA" },
    });
  });
}

async function auditTenant(tenantId) {
  const [
    departmentTeste,
    inactiveDepartments,
    archivedConnections,
    activeDepartments,
    closedStatusWithoutClosedAt,
    closedAtWithoutClosedStatus,
    orphanAudit,
  ] = await Promise.all([
    prisma.department.count({
      where: { tenantId, name: { equals: "Teste", mode: "insensitive" } },
    }),
    prisma.department.count({ where: { tenantId, active: false } }),
    prisma.messagingConnection.count({
      where: { tenantId, OR: [{ archivedAt: { not: null } }, { status: "REMOVED" }] },
    }),
    prisma.department.count({ where: { tenantId, active: true } }),
    prisma.conversation.count({ where: { tenantId, status: "FECHADA", closedAt: null } }),
    prisma.conversation.count({
      where: { tenantId, status: { not: "FECHADA" }, closedAt: { not: null } },
    }),
    orphanCounts(tenantId),
  ]);
  return {
    departmentTeste,
    inactiveDepartments,
    activeDepartments,
    archivedConnections,
    closedStatusWithoutClosedAt,
    closedAtWithoutClosedStatus,
    orphanAudit,
  };
}

async function orphanCounts(tenantId) {
  return {
    departmentsWithoutTenant:
      await countRaw`SELECT count(*)::int FROM departments d LEFT JOIN tenants t ON t.id = d."tenantId" WHERE d."tenantId" = ${tenantId} AND t.id IS NULL`,
    contactsWithoutTenant:
      await countRaw`SELECT count(*)::int FROM contacts c LEFT JOIN tenants t ON t.id = c."tenantId" WHERE c."tenantId" = ${tenantId} AND t.id IS NULL`,
    conversationsWithoutContact:
      await countRaw`SELECT count(*)::int FROM conversations c LEFT JOIN contacts ct ON ct.id = c."contactId" WHERE c."tenantId" = ${tenantId} AND ct.id IS NULL`,
    leadsWithoutConversation:
      await countRaw`SELECT count(*)::int FROM leads l LEFT JOIN conversations c ON c.id = l."conversationId" WHERE l."tenantId" = ${tenantId} AND c.id IS NULL`,
    membershipsWithoutUser:
      await countRaw`SELECT count(*)::int FROM tenant_memberships tm LEFT JOIN users u ON u.id = tm."userId" WHERE tm."tenantId" = ${tenantId} AND u.id IS NULL`,
    tagsWithoutTenant:
      await countRaw`SELECT count(*)::int FROM tags tg LEFT JOIN tenants t ON t.id = tg."tenantId" WHERE tg."tenantId" = ${tenantId} AND t.id IS NULL`,
    customersWithoutTenant:
      await countRaw`SELECT count(*)::int FROM customers cu LEFT JOIN tenants t ON t.id = cu."tenantId" WHERE cu."tenantId" = ${tenantId} AND t.id IS NULL`,
    automationsWithoutTenant:
      await countRaw`SELECT count(*)::int FROM automation_rules ar LEFT JOIN tenants t ON t.id = ar."tenantId" WHERE ar."tenantId" = ${tenantId} AND t.id IS NULL`,
    notificationsWithoutTenant:
      await countRaw`SELECT count(*)::int FROM notifications n LEFT JOIN tenants t ON t.id = n."tenantId" WHERE n."tenantId" = ${tenantId} AND t.id IS NULL`,
  };
}

async function countRaw(strings, ...values) {
  const rows = await prisma.$queryRaw(strings, ...values);
  return Number(rows[0]?.count ?? 0);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
