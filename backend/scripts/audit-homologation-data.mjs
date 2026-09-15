import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

try {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  const tenantCounts = [];
  for (const tenant of tenants) {
    tenantCounts.push({
      tenant: tenant.slug,
      users: await prisma.user.count({ where: { memberships: { some: { tenantId: tenant.id } } } }),
      memberships: await prisma.tenantMembership.count({ where: { tenantId: tenant.id } }),
      departments: await prisma.department.count({ where: { tenantId: tenant.id } }),
      roles: await prisma.role.count({ where: { tenantId: tenant.id } }),
      contacts: await prisma.contact.count({ where: { tenantId: tenant.id } }),
      contactsArchived: await prisma.contact.count({
        where: { tenantId: tenant.id, archivedAt: { not: null } },
      }),
      conversations: await prisma.conversation.count({ where: { tenantId: tenant.id } }),
      messages: await prisma.message.count({ where: { tenantId: tenant.id } }),
      messagingConnections: await prisma.messagingConnection.count({
        where: { tenantId: tenant.id },
      }),
      outboxEvents: await prisma.outboxEvent.count({ where: { tenantId: tenant.id } }),
    });
  }

  const duplicateNormalizedPhones = await prisma.$queryRaw`
    SELECT "tenantId", "normalizedPhone", count(*)::int AS count
    FROM contacts
    GROUP BY "tenantId", "normalizedPhone"
    HAVING count(*) > 1
  `;
  const orphanAudit = {
    contactsWithoutTenant: await countRaw`
      SELECT count(*)::int FROM contacts c LEFT JOIN tenants t ON t.id = c."tenantId" WHERE t.id IS NULL
    `,
    conversationsWithoutContact: await countRaw`
      SELECT count(*)::int FROM conversations c LEFT JOIN contacts ct ON ct.id = c."contactId" WHERE ct.id IS NULL
    `,
    conversationsWithoutConnection: await countRaw`
      SELECT count(*)::int FROM conversations c WHERE c."connectionId" IS NULL
    `,
    messagesWithoutConversation: await countRaw`
      SELECT count(*)::int FROM messages m LEFT JOIN conversations c ON c.id = m."conversationId" WHERE c.id IS NULL
    `,
    messagesWithoutTenant: await countRaw`
      SELECT count(*)::int FROM messages m LEFT JOIN tenants t ON t.id = m."tenantId" WHERE t.id IS NULL
    `,
    connectionsWithoutTenant: await countRaw`
      SELECT count(*)::int FROM messaging_connections mc LEFT JOIN tenants t ON t.id = mc."tenantId" WHERE t.id IS NULL
    `,
    outboundOutboxWithoutMessage: await countRaw`
      SELECT count(*)::int FROM outbox_events o
      LEFT JOIN messages m ON m.id = o."aggregateId"
      WHERE o.type = 'MESSAGING_OUTBOUND_REQUESTED' AND m.id IS NULL
    `,
  };

  console.log(
    JSON.stringify(
      {
        event: "homologation.audit",
        tenants: tenantCounts,
        permissions: await prisma.permission.count(),
        duplicateNormalizedPhones: duplicateNormalizedPhones.map((item) => ({
          tenantId: item.tenantId,
          normalizedPhoneMasked: maskPhone(item.normalizedPhone),
          count: item.count,
        })),
        orphanAudit,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

async function countRaw(strings, ...values) {
  const rows = await prisma.$queryRaw(strings, ...values);
  return Number(rows[0]?.count ?? 0);
}

function maskPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? `******${digits.slice(-4)}` : null;
}
