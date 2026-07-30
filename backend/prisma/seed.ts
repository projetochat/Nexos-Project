import { hash } from "bcryptjs";
import {
  ContactCompanyRole,
  ConversationStatus,
  MessageDirection,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  Prisma,
  PrismaClient,
  PlatformRole,
} from "../src/generated/prisma";
import {
  AGENT_PERMISSIONS,
  PERMISSIONS,
  SUPERVISOR_PERMISSIONS,
  TENANT_ADMIN_PERMISSIONS,
  type PermissionKey,
} from "../src/auth/permissions.constants";

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  {
    key: "tenant_admin",
    name: "Administrador",
    description: "Administra usuarios, departamentos e perfis do tenant.",
    permissions: TENANT_ADMIN_PERMISSIONS,
  },
  {
    key: "supervisor",
    name: "Supervisor",
    description: "Supervisiona operacao e departamentos do tenant.",
    permissions: SUPERVISOR_PERMISSIONS,
  },
  {
    key: "agent",
    name: "Atendente",
    description: "Atende clientes nos departamentos permitidos.",
    permissions: AGENT_PERMISSIONS,
  },
] as const;

async function main() {
  await seedPermissionCatalog();

  const [acme, orbit] = await Promise.all([
    prisma.tenant.upsert({
      where: { slug: "acme" },
      update: { name: "Acme Corp" },
      create: { name: "Acme Corp", slug: "acme" },
    }),
    prisma.tenant.upsert({
      where: { slug: "orbit" },
      update: { name: "Orbit Labs" },
      create: { name: "Orbit Labs", slug: "orbit" },
    }),
  ]);

  const acmeRoles = await seedRoles(acme.id);
  const orbitRoles = await seedRoles(orbit.id);

  const acmeDepartments = await Promise.all([
    seedDepartment(acme.id, "Suporte", "#2563eb", "Atendimento operacional ao cliente."),
    seedDepartment(acme.id, "Comercial", "#16a34a", "Triagem e oportunidades comerciais."),
    seedDepartment(acme.id, "Financeiro", "#f59e0b", "Demandas financeiras e administrativas."),
  ]);
  const orbitDepartments = await Promise.all([
    seedDepartment(orbit.id, "Suporte Orbit", "#7c3aed", "Atendimento do tenant Orbit."),
    seedDepartment(orbit.id, "Operacoes Orbit", "#0891b2", "Backoffice operacional Orbit."),
  ]);

  const passwordHash = await hash("demo1234", 12);
  const [adminA, supervisorA, agentA, adminB, agentB, platformAdmin] = await Promise.all([
    seedUser("admin@nexo.app", "Ana Ribeiro", passwordHash),
    seedUser("supervisor@nexo.app", "Pedro Camargo", passwordHash),
    seedUser("atendente@nexo.app", "Camila Duarte", passwordHash),
    seedUser("admin-orbit@nexo.app", "Bruna Martins", passwordHash),
    seedUser("agent-orbit@nexo.app", "Otavio Silva", passwordHash),
    seedUser("platform@nexo.app", "Paula Plataforma", passwordHash, PlatformRole.ADMIN),
  ]);

  await Promise.all([
    seedMembership(
      acme.id,
      adminA.id,
      acmeRoles.tenant_admin.id,
      acmeDepartments.map((d) => d.id),
    ),
    seedMembership(acme.id, supervisorA.id, acmeRoles.supervisor.id, [acmeDepartments[0].id]),
    seedMembership(acme.id, agentA.id, acmeRoles.agent.id, [acmeDepartments[0].id]),
    seedMembership(
      orbit.id,
      adminB.id,
      orbitRoles.tenant_admin.id,
      orbitDepartments.map((d) => d.id),
    ),
    seedMembership(orbit.id, agentB.id, orbitRoles.agent.id, [orbitDepartments[0].id]),
    seedMembership(acme.id, platformAdmin.id, acmeRoles.agent.id, [acmeDepartments[0].id]),
  ]);

  await Promise.all([seedCrm(acme.id, acmeDepartments), seedCrm(orbit.id, orbitDepartments)]);
  await Promise.all([
    seedMessagingConnection(acme.id, "FLOWID"),
    seedMessagingConnection(orbit.id, "ORBIT"),
  ]);
  await Promise.all([
    seedConversations(acme.id, acmeDepartments),
    seedConversations(orbit.id, orbitDepartments),
  ]);
}

async function seedMessagingConnection(tenantId: string, externalReference: string) {
  return prisma.messagingConnection.upsert({
    where: {
      tenantId_providerType_externalReference: {
        tenantId,
        providerType: MessagingProviderType.DEVELOPMENT,
        externalReference,
      },
    },
    update: {
      name: `Development ${externalReference}`,
      status: MessagingConnectionStatus.CONNECTED,
    },
    create: {
      tenantId,
      name: `Development ${externalReference}`,
      providerType: MessagingProviderType.DEVELOPMENT,
      status: MessagingConnectionStatus.CONNECTED,
      externalReference,
    },
  });
}

async function seedPermissionCatalog() {
  await Promise.all(
    PERMISSIONS.map((id) =>
      prisma.permission.upsert({
        where: { id },
        update: { description: permissionDescription(id) },
        create: { id, description: permissionDescription(id) },
      }),
    ),
  );
}

async function seedRoles(tenantId: string) {
  const entries = await Promise.all(
    SYSTEM_ROLES.map(async (role) => {
      const saved = await prisma.role.upsert({
        where: { tenantId_key: { tenantId, key: role.key } },
        update: {
          name: role.name,
          description: role.description,
          system: true,
        },
        create: {
          id: `${tenantId}:${role.key}`,
          tenantId,
          key: role.key,
          name: role.name,
          description: role.description,
          system: true,
        },
      });
      await replaceRolePermissions(saved.id, role.permissions);
      return [role.key, saved] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Record<
    (typeof SYSTEM_ROLES)[number]["key"],
    { id: string }
  >;
}

async function replaceRolePermissions(roleId: string, permissions: readonly PermissionKey[]) {
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

async function seedDepartment(tenantId: string, name: string, color: string, description: string) {
  return prisma.department.upsert({
    where: { tenantId_name: { tenantId, name } },
    update: { color, description, active: true },
    create: { tenantId, name, color, description },
  });
}

async function seedUser(
  email: string,
  name: string,
  passwordHash: string,
  platformRole: PlatformRole = PlatformRole.USER,
) {
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, status: "ACTIVE", platformRole },
    create: { email, name, passwordHash, platformRole },
  });
}

async function seedMembership(
  tenantId: string,
  userId: string,
  roleId: string,
  departmentIds: string[],
) {
  const membership = await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { roleId, status: "ACTIVE" },
    create: { tenantId, userId, roleId, status: "ACTIVE" },
  });
  await prisma.departmentMembership.deleteMany({
    where: { tenantId, membershipId: membership.id },
  });
  await prisma.departmentMembership.createMany({
    data: departmentIds.map((departmentId) => ({
      tenantId,
      membershipId: membership.id,
      departmentId,
    })),
    skipDuplicates: true,
  });
  return membership;
}

async function seedCrm(tenantId: string, departments: { id: string; name: string }[]) {
  const isOrbit = departments.some((department) => department.name.includes("Orbit"));
  const palette = isOrbit
    ? {
        customerA: "77777777-7777-4777-8777-777777777771",
        customerB: "77777777-7777-4777-8777-777777777772",
        contactA: "88888888-8888-4888-8888-888888888881",
        contactB: "88888888-8888-4888-8888-888888888882",
        tagVip: "99999999-9999-4999-8999-999999999981",
        tagLead: "99999999-9999-4999-8999-999999999982",
      }
    : {
        customerA: "11111111-1111-4111-8111-111111111111",
        customerB: "11111111-1111-4111-8111-111111111112",
        contactA: "22222222-2222-4222-8222-222222222221",
        contactB: "22222222-2222-4222-8222-222222222222",
        tagVip: "33333333-3333-4333-8333-333333333331",
        tagLead: "33333333-3333-4333-8333-333333333332",
      };

  const [customerA, customerB, tagVip, tagLead] = await Promise.all([
    prisma.customer.upsert({
      where: { id: palette.customerA },
      update: {
        tenantId,
        name: isOrbit ? "Orbit Energia" : "Nexos Cafe",
        responsibleContactName: isOrbit ? "Bruna Martins" : "Ana Ribeiro",
        color: isOrbit ? "#0891b2" : "#2563eb",
        archivedAt: null,
      },
      create: {
        id: palette.customerA,
        tenantId,
        name: isOrbit ? "Orbit Energia" : "Nexos Cafe",
        email: isOrbit ? "contato@orbitenergia.example" : "contato@nexoscafe.example",
        phone: isOrbit ? "(31) 4002-1000" : "(11) 4002-9000",
        notes: "Cliente seed do contrato funcional de CRM.",
        responsibleContactName: isOrbit ? "Bruna Martins" : "Ana Ribeiro",
        color: isOrbit ? "#0891b2" : "#2563eb",
      },
    }),
    prisma.customer.upsert({
      where: { id: palette.customerB },
      update: {
        tenantId,
        name: isOrbit ? "Orbit Varejo" : "Acme Varejo",
        responsibleContactName: isOrbit ? "Otavio Silva" : "Pedro Camargo",
        color: isOrbit ? "#7c3aed" : "#16a34a",
        archivedAt: null,
      },
      create: {
        id: palette.customerB,
        tenantId,
        name: isOrbit ? "Orbit Varejo" : "Acme Varejo",
        email: isOrbit ? "ops@orbitvarejo.example" : "ops@acmevarejo.example",
        phone: isOrbit ? "(31) 4002-2000" : "(11) 4002-8000",
        notes: "Cliente com contato vinculado para smoke da Sprint 03.",
        responsibleContactName: isOrbit ? "Otavio Silva" : "Pedro Camargo",
        color: isOrbit ? "#7c3aed" : "#16a34a",
      },
    }),
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId, name: "VIP" } },
      update: { color: "#f59e0b" },
      create: { id: palette.tagVip, tenantId, name: "VIP", color: "#f59e0b" },
    }),
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId, name: "Lead" } },
      update: { color: "#16a34a" },
      create: { id: palette.tagLead, tenantId, name: "Lead", color: "#16a34a" },
    }),
  ]);

  const department = departments[0];
  const [contactA, contactB] = await Promise.all([
    prisma.contact.upsert({
      where: {
        tenantId_normalizedPhone: {
          tenantId,
          normalizedPhone: isOrbit ? "+5531998765001" : "+5511998765001",
        },
      },
      update: {
        name: isOrbit ? "Marina Orbit" : "Marina Lopes",
        phone: isOrbit ? "(31) 99876-5001" : "(11) 99876-5001",
        email: isOrbit ? "marina@orbitenergia.example" : "marina@nexoscafe.example",
        customerId: customerA.id,
        departmentId: department.id,
        departmentName: department.name,
        companyRole: ContactCompanyRole.GERENTE,
        instance: isOrbit ? "ORBIT" : "FLOWID",
        archivedAt: null,
      },
      create: {
        id: palette.contactA,
        tenantId,
        name: isOrbit ? "Marina Orbit" : "Marina Lopes",
        phone: isOrbit ? "(31) 99876-5001" : "(11) 99876-5001",
        normalizedPhone: isOrbit ? "+5531998765001" : "+5511998765001",
        email: isOrbit ? "marina@orbitenergia.example" : "marina@nexoscafe.example",
        customerId: customerA.id,
        departmentId: department.id,
        departmentName: department.name,
        companyRole: ContactCompanyRole.GERENTE,
        instance: isOrbit ? "ORBIT" : "FLOWID",
      },
    }),
    prisma.contact.upsert({
      where: {
        tenantId_normalizedPhone: {
          tenantId,
          normalizedPhone: isOrbit ? "+5531998765002" : "+5511998765002",
        },
      },
      update: {
        name: isOrbit ? "Rafael Orbit" : "Rafael Souza",
        phone: isOrbit ? "(31) 99876-5002" : "(11) 99876-5002",
        email: isOrbit ? "rafael@orbitvarejo.example" : "rafael@acmevarejo.example",
        customerId: customerB.id,
        departmentId: departments[1]?.id ?? department.id,
        departmentName: departments[1]?.name ?? department.name,
        companyRole: ContactCompanyRole.SUPERVISOR,
        instance: isOrbit ? "ORBIT" : "ZYVO",
        archivedAt: null,
      },
      create: {
        id: palette.contactB,
        tenantId,
        name: isOrbit ? "Rafael Orbit" : "Rafael Souza",
        phone: isOrbit ? "(31) 99876-5002" : "(11) 99876-5002",
        normalizedPhone: isOrbit ? "+5531998765002" : "+5511998765002",
        email: isOrbit ? "rafael@orbitvarejo.example" : "rafael@acmevarejo.example",
        customerId: customerB.id,
        departmentId: departments[1]?.id ?? department.id,
        departmentName: departments[1]?.name ?? department.name,
        companyRole: ContactCompanyRole.SUPERVISOR,
        instance: isOrbit ? "ORBIT" : "ZYVO",
      },
    }),
  ]);

  await prisma.contactTag.deleteMany({
    where: { tenantId, contactId: { in: [contactA.id, contactB.id] } },
  });
  await prisma.contactTag.createMany({
    data: [
      { tenantId, contactId: contactA.id, tagId: tagVip.id },
      { tenantId, contactId: contactB.id, tagId: tagLead.id },
    ],
    skipDuplicates: true,
  });
}

async function seedConversations(tenantId: string, departments: { id: string; name: string }[]) {
  const isOrbit = departments.some((department) => department.name.includes("Orbit"));
  const palette = isOrbit
    ? {
        contactA: "88888888-8888-4888-8888-888888888881",
        contactB: "88888888-8888-4888-8888-888888888882",
        active: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        standby: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        queue: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
        lead: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      }
    : {
        contactA: "22222222-2222-4222-8222-222222222221",
        contactB: "22222222-2222-4222-8222-222222222222",
        active: "44444444-4444-4444-8444-444444444441",
        standby: "44444444-4444-4444-8444-444444444442",
        queue: "44444444-4444-4444-8444-444444444443",
        lead: "44444444-4444-4444-8444-444444444444",
        closed: "44444444-4444-4444-8444-444444444445",
        finance: "44444444-4444-4444-8444-444444444446",
      };

  const [admin, supervisor, agent] = await Promise.all([
    prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId, role: { key: "tenant_admin" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenantMembership.findFirst({
      where: { tenantId, role: { key: "supervisor" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenantMembership.findFirst({
      where: { tenantId, role: { key: "agent" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const support = departments[0];
  const sales = departments[1] ?? support;
  const finance = departments[2] ?? support;
  const connection = await prisma.messagingConnection.findFirstOrThrow({
    where: { tenantId, providerType: MessagingProviderType.DEVELOPMENT },
    orderBy: { createdAt: "asc" },
  });
  const now = Date.now();

  const minimumCounter = isOrbit ? 3 : 5;
  const currentMaxProtocol = await maxConversationProtocolNumber(tenantId);
  await prisma.conversationProtocolCounter.upsert({
    where: { tenantId },
    update: { lastNumber: Math.max(minimumCounter, currentMaxProtocol) },
    create: { tenantId, lastNumber: Math.max(minimumCounter, currentMaxProtocol) },
  });

  await Promise.all([
    seedConversation({
      id: palette.active,
      tenantId,
      contactId: palette.contactA,
      departmentId: support.id,
      assignedMembershipId: agent?.id ?? admin.id,
      status: ConversationStatus.EM_ANDAMENTO,
      protocol: "000001",
      unreadCount: 2,
      lastMessagePreview: isOrbit
        ? "Preciso acompanhar a entrega Orbit."
        : "Preciso acompanhar meu pedido.",
      lastMessageAt: new Date(now - 5 * 60_000),
      authorMembershipId: agent?.id ?? admin.id,
      connectionId: connection.id,
    }),
    seedConversation({
      id: palette.standby,
      tenantId,
      contactId: palette.contactA,
      departmentId: support.id,
      assignedMembershipId: supervisor?.id ?? admin.id,
      status: ConversationStatus.AGUARDANDO,
      protocol: "000002",
      unreadCount: 0,
      lastMessagePreview: "Cliente em espera para retorno.",
      lastMessageAt: new Date(now - 40 * 60_000),
      authorMembershipId: supervisor?.id ?? admin.id,
      connectionId: connection.id,
    }),
    seedConversation({
      id: palette.queue,
      tenantId,
      contactId: palette.contactB,
      departmentId: support.id,
      assignedMembershipId: null,
      status: ConversationStatus.ABERTA,
      protocol: "000003",
      unreadCount: 1,
      lastMessagePreview: "Novo atendimento aguardando na fila.",
      lastMessageAt: new Date(now - 70 * 60_000),
      authorMembershipId: admin.id,
      connectionId: connection.id,
    }),
    seedConversation({
      id: palette.lead,
      tenantId,
      contactId: palette.contactB,
      departmentId: support.id,
      assignedMembershipId: null,
      status: ConversationStatus.ABERTA,
      protocol: null,
      unreadCount: 1,
      lastMessagePreview: "Lead recebido pelo canal digital.",
      lastMessageAt: new Date(now - 95 * 60_000),
      authorMembershipId: admin.id,
      connectionId: connection.id,
    }),
  ]);

  if (!isOrbit) {
    const closedId = palette.closed;
    const financeId = palette.finance;
    if (!closedId || !financeId) throw new Error("Paleta Acme de conversas incompleta.");
    await Promise.all([
      seedConversation({
        id: closedId,
        tenantId,
        contactId: palette.contactB,
        departmentId: sales.id,
        assignedMembershipId: admin.id,
        status: ConversationStatus.FECHADA,
        protocol: "000004",
        unreadCount: 0,
        lastMessagePreview: "Atendimento encerrado com sucesso.",
        lastMessageAt: new Date(now - 24 * 60 * 60_000),
        closedAt: new Date(now - 23 * 60 * 60_000),
        authorMembershipId: admin.id,
        connectionId: connection.id,
      }),
      seedConversation({
        id: financeId,
        tenantId,
        contactId: palette.contactB,
        departmentId: finance.id,
        assignedMembershipId: admin.id,
        status: ConversationStatus.EM_ANDAMENTO,
        protocol: "000005",
        unreadCount: 0,
        lastMessagePreview: "Demanda financeira restrita ao departamento.",
        lastMessageAt: new Date(now - 15 * 60_000),
        authorMembershipId: admin.id,
        connectionId: connection.id,
      }),
    ]);
  }
}

async function seedConversation(input: {
  id: string;
  tenantId: string;
  contactId: string;
  departmentId: string;
  assignedMembershipId: string | null;
  status: ConversationStatus;
  protocol: string | null;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: Date;
  authorMembershipId: string;
  connectionId: string;
  closedAt?: Date;
}) {
  await prisma.conversation.upsert({
    where: { id: input.id },
    update: {
      tenantId: input.tenantId,
      contactId: input.contactId,
      departmentId: input.departmentId,
      assignedMembershipId: input.assignedMembershipId,
      connectionId: input.connectionId,
      status: input.status,
      protocol: input.protocol,
      unreadCount: input.unreadCount,
      lastMessagePreview: input.lastMessagePreview,
      lastMessageAt: input.lastMessageAt,
      closedAt: input.closedAt ?? null,
      archivedAt: null,
    },
    create: {
      id: input.id,
      tenantId: input.tenantId,
      contactId: input.contactId,
      departmentId: input.departmentId,
      assignedMembershipId: input.assignedMembershipId,
      connectionId: input.connectionId,
      status: input.status,
      protocol: input.protocol,
      unreadCount: input.unreadCount,
      lastMessagePreview: input.lastMessagePreview,
      lastMessageAt: input.lastMessageAt,
      closedAt: input.closedAt ?? null,
    },
  });
  await seedConversationMessages(input);
}

async function seedConversationMessages(input: {
  id: string;
  tenantId: string;
  protocol: string | null;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: Date;
  authorMembershipId: string;
  connectionId: string;
  closedAt?: Date;
}) {
  await prisma.message.deleteMany({
    where: { tenantId: input.tenantId, conversationId: input.id },
  });
  const introAt = new Date(input.lastMessageAt.getTime() - 20 * 60_000);
  const previousAt = new Date(input.lastMessageAt.getTime() - 10 * 60_000);
  const rows: Prisma.MessageCreateManyInput[] = [
    {
      tenantId: input.tenantId,
      conversationId: input.id,
      connectionId: input.connectionId,
      direction: MessageDirection.SYSTEM,
      type: MessageType.SYSTEM,
      authorMembershipId: input.authorMembershipId,
      content: input.protocol
        ? `Conversa iniciada - protocolo ${input.protocol}.`
        : "Novo lead recebido.",
      createdAt: introAt,
    },
  ];

  if (input.unreadCount > 1) {
    rows.push({
      tenantId: input.tenantId,
      conversationId: input.id,
      connectionId: input.connectionId,
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      authorMembershipId: null,
      content: "Pode verificar essa solicitacao?",
      createdAt: previousAt,
    });
  }

  rows.push({
    tenantId: input.tenantId,
    conversationId: input.id,
    connectionId: input.connectionId,
    direction: input.unreadCount > 0 ? MessageDirection.INBOUND : MessageDirection.OUTBOUND,
    type: MessageType.TEXT,
    authorMembershipId: input.unreadCount > 0 ? null : input.authorMembershipId,
    content: input.lastMessagePreview,
    createdAt: input.lastMessageAt,
  });

  await prisma.message.createMany({ data: rows });
}

async function maxConversationProtocolNumber(tenantId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { tenantId, protocol: { not: null } },
    select: { protocol: true },
  });
  return conversations.reduce((max, conversation) => {
    const value = Number(conversation.protocol);
    return Number.isInteger(value) ? Math.max(max, value) : max;
  }, 0);
}

function permissionDescription(permission: PermissionKey) {
  return permission;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
