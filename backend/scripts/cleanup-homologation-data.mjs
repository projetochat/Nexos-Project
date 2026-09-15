import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const tenantSlug = readArg("--tenant-slug") ?? "homologacao";

const DEMO_CONTACT_IDS = [
  "22222222-2222-4222-8222-222222222221",
  "22222222-2222-4222-8222-222222222222",
  "88888888-8888-4888-8888-888888888881",
  "88888888-8888-4888-8888-888888888882",
];
const DEMO_CONVERSATION_IDS = [
  "44444444-4444-4444-8444-444444444441",
  "44444444-4444-4444-8444-444444444442",
  "44444444-4444-4444-8444-444444444443",
  "44444444-4444-4444-8444-444444444444",
  "44444444-4444-4444-8444-444444444445",
  "44444444-4444-4444-8444-444444444446",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
];
const DEMO_CUSTOMER_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "11111111-1111-4111-8111-111111111112",
  "77777777-7777-4777-8777-777777777771",
  "77777777-7777-4777-8777-777777777772",
];
const DEMO_TAG_IDS = [
  "33333333-3333-4333-8333-333333333331",
  "33333333-3333-4333-8333-333333333332",
  "99999999-9999-4999-8999-999999999981",
  "99999999-9999-4999-8999-999999999982",
];

try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    console.log(JSON.stringify({ ok: false, tenant: tenantSlug, error: "tenant_not_found" }));
    process.exitCode = 1;
  } else {
    const plan = await buildPlan(tenant.id);
    console.log(
      JSON.stringify(
        {
          mode: confirm ? "confirm" : "dry-run",
          tenant: tenant.slug,
          before: plan.before,
          planned: plan.planned,
        },
        null,
        2,
      ),
    );

    if (confirm) {
      await applyPlan(tenant.id, plan);
    }

    const after = await counts(tenant.id);
    console.log(
      JSON.stringify({ tenant: tenant.slug, after, skippedRecords: plan.skippedRecords }, null, 2),
    );
  }
} finally {
  await prisma.$disconnect();
}

async function buildPlan(tenantId) {
  const before = await counts(tenantId);
  const demoConversationIds = await prisma.conversation.findMany({
    where: { tenantId, id: { in: DEMO_CONVERSATION_IDS } },
    select: { id: true },
  });
  const demoContactIds = await prisma.contact.findMany({
    where: { tenantId, id: { in: DEMO_CONTACT_IDS } },
    select: { id: true },
  });
  const demoConnections = await prisma.messagingConnection.findMany({
    where: {
      tenantId,
      OR: [
        { externalReference: { in: ["FLOWID", "ORBIT", "ZYVO"] } },
        { providerType: "DEVELOPMENT" },
      ],
    },
    select: { id: true },
  });
  const outboxEvents = await prisma.outboxEvent.findMany({
    where: {
      tenantId,
      OR: [
        { aggregateId: { in: demoConversationIds.map((item) => item.id) } },
        { aggregateId: { in: demoContactIds.map((item) => item.id) } },
        { payload: { path: ["demo"], equals: true } },
      ],
    },
    select: { id: true },
  });

  return {
    before,
    planned: {
      contacts: demoContactIds.length,
      conversations: demoConversationIds.length,
      messages: await prisma.message.count({
        where: { tenantId, conversationId: { in: demoConversationIds.map((item) => item.id) } },
      }),
      connections: demoConnections.length,
      outboxEvents: outboxEvents.length,
      customers: await prisma.customer.count({
        where: { tenantId, id: { in: DEMO_CUSTOMER_IDS } },
      }),
      tags: await prisma.tag.count({ where: { tenantId, id: { in: DEMO_TAG_IDS } } }),
    },
    ids: {
      conversations: demoConversationIds.map((item) => item.id),
      contacts: demoContactIds.map((item) => item.id),
      connections: demoConnections.map((item) => item.id),
      outboxEvents: outboxEvents.map((item) => item.id),
    },
    skippedRecords: {
      unmarkedContacts: before.contacts - demoContactIds.length,
      unmarkedConversations: before.conversations - demoConversationIds.length,
      protectedUsers: before.users,
      protectedMemberships: before.memberships,
      protectedDepartments: before.departments,
    },
  };
}

async function applyPlan(tenantId, plan) {
  await prisma.$transaction(async (tx) => {
    await tx.outboxEvent.deleteMany({ where: { tenantId, id: { in: plan.ids.outboxEvents } } });
    await tx.message.deleteMany({
      where: { tenantId, conversationId: { in: plan.ids.conversations } },
    });
    await tx.conversation.deleteMany({ where: { tenantId, id: { in: plan.ids.conversations } } });
    await tx.contactTag.deleteMany({ where: { tenantId, contactId: { in: plan.ids.contacts } } });
    await tx.contact.deleteMany({ where: { tenantId, id: { in: plan.ids.contacts } } });
    await tx.customer.deleteMany({ where: { tenantId, id: { in: DEMO_CUSTOMER_IDS } } });
    await tx.tag.deleteMany({ where: { tenantId, id: { in: DEMO_TAG_IDS } } });
    await tx.messagingConnection.deleteMany({
      where: {
        tenantId,
        id: { in: plan.ids.connections },
        conversations: { none: {} },
        messages: { none: {} },
      },
    });
  });
}

async function counts(tenantId) {
  const [
    contacts,
    conversations,
    messages,
    connections,
    outboxEvents,
    users,
    memberships,
    departments,
  ] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.conversation.count({ where: { tenantId } }),
    prisma.message.count({ where: { tenantId } }),
    prisma.messagingConnection.count({ where: { tenantId } }),
    prisma.outboxEvent.count({ where: { tenantId } }),
    prisma.user.count({ where: { memberships: { some: { tenantId } } } }),
    prisma.tenantMembership.count({ where: { tenantId } }),
    prisma.department.count({ where: { tenantId } }),
  ]);
  return {
    contacts,
    conversations,
    messages,
    connections,
    outboxEvents,
    users,
    memberships,
    departments,
  };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
