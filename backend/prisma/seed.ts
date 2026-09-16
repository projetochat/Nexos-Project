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

const HOMOLOGATION_DEPARTMENTS = [
  { name: "COMPRAS", color: "#2563EB", description: "Compras e fornecedores." },
  { name: "LOGÍSTICA", color: "#16A34A", description: "Logística e operações." },
  { name: "FINANCEIRO", color: "#F59E0B", description: "Demandas financeiras." },
  { name: "COMERCIAL", color: "#7C3AED", description: "Oportunidades comerciais." },
  { name: "TI", color: "#0891B2", description: "Tecnologia da informação." },
  { name: "DIRETORIA", color: "#DC2626", description: "Diretoria." },
] as const;

const HOMOLOGATION_TAGS = [
  { name: "ASS. TÉCNICA", color: "#2563EB" },
  { name: "COMPRAS", color: "#16A34A" },
  { name: "LOGÍSTICA", color: "#F59E0B" },
  { name: "FINANCEIRO", color: "#7C3AED" },
  { name: "COMERCIAL", color: "#0891B2" },
  { name: "TI", color: "#DC2626" },
  { name: "DIRETORIA", color: "#475569" },
  { name: "VIP", color: "#7C3AED" },
  { name: "CEO", color: "#0F172A" },
  { name: "CAMPANHA NATAL", color: "#DC2626" },
  { name: "CAMPANHA PÁSCOA", color: "#A855F7" },
  { name: "CAMPANHA FÉRIAS", color: "#F97316" },
  { name: "CAMPANHA MÊS 10 C/ 10%", color: "#059669" },
] as const;

const HOMOLOGATION_CUSTOMERS = [
  "AGROCONTAR",
  "DIPS",
  "DINACO",
  "QRIAR",
  "VOCICAL",
  "SDE",
  "NORDESTE",
  "PESSOAL",
  "SOLUTI",
  "GOLDTEK",
  "AC ADVOGADOS",
  "ÍNTEGRA",
] as const;

const HOMOLOGATION_CONTACT_PROFILES = [
  "Proprietário",
  "Dietor",
  "Gestor Dpto",
  "Supervisor",
  "Colaborador",
] as const;

const HOMOLOGATION_STAFF = [
  { name: "Douglas Flow iD", email: "douglas@flowid.com.br", role: "supervisor" },
  { name: "Natã Flow iD", email: "nata.rabelo@flowid.com.br", role: "supervisor" },
  { name: "Rafael Flow iD", email: "rafael.nunes@flowid.com.br", role: "agent" },
  { name: "Rafaella Flow iD", email: "rafaella.camargo@flowid.com.br", role: "agent" },
] as const;

const HOMOLOGATION_QUICK_REPLIES = [
  {
    title: "Bom dia",
    shortcut: "bd",
    content: "Bom dia, *{{nome}}*,\nTudo bem?\n\n## Em que podemos te ajudar?",
    closeOnSend: false,
  },
  {
    title: "Boa tarde",
    shortcut: "bt",
    content: "Boa tarde, *{{nome}}*,\nTudo bem?\n\n## Em que podemos te ajudar?",
    closeOnSend: false,
  },
  {
    title: "Boa noite",
    shortcut: "bn",
    content: "Boa noite, *{{nome}}*,\nTudo bem?\n\n## Em que podemos te ajudar?",
    closeOnSend: false,
  },
  {
    title: "Finalizar atendimento",
    shortcut: "f",
    content:
      "Seu atendimento será finalizado.\nEspero ter ajudado!\nCaso precise de um novo atendimento, basta nos acionar novamente.\n\nUm abraço!\n*Equipe Trixus* ✅",
    closeOnSend: true,
  },
  {
    title: "Finalizar por inatividade",
    shortcut: "fi",
    content:
      "Este atendimento será encerrado por falta de interação. Se ainda precisar de atendimento, basta nos acionar novamente.\n\n*Equipe Trixus* ✅",
    closeOnSend: true,
  },
  {
    title: "Atendimento inicial",
    shortcut: "ola",
    content:
      "{{cumprimento}} *{{nome}}*,\nTudo bem?\n\nBem vindo ao atendimento inicial do *Suporte Trixus*.\n\nNosso horário de funcionamento é de Segunda a Sexta:\n\n- 08:00h às 12:00h\n- 13:30h às 18:00h\n- Fuso horário de São Paulo (GMT-3)\n\nComo deseja o atendimento?",
    closeOnSend: false,
  },
] as const;
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
  await seedPlatformPlans();
  await seedPlatformAdmin();
  const seedMode =
    process.env.SEED_MODE ?? (process.env.SEED_DEMO_DATA === "true" ? "demo" : "homologation");
  if (seedMode === "demo") {
    await seedDemoData();
    return;
  }
  if (seedMode === "production") {
    await seedProductionStaging();
    return;
  }
  if (seedMode !== "homologation") {
    throw new Error(`SEED_MODE invalido: ${seedMode}`);
  }
  await seedHomologationMinimum();
}

async function seedPlatformPlans() {
  await Promise.all([
    prisma.plan.upsert({
      where: { code: "starter" },
      update: {
        name: "Starter",
        status: "ACTIVE",
        features: starterFeatures(),
        limits: starterLimits(),
      },
      create: {
        id: "plan_starter_homologation",
        code: "starter",
        name: "Starter",
        description: "Plano de homologacao para tenants pequenos.",
        status: "ACTIVE",
        billingPeriod: "MANUAL",
        features: starterFeatures(),
        limits: starterLimits(),
      },
    }),
    prisma.plan.upsert({
      where: { code: "professional" },
      update: {
        name: "Professional",
        status: "ACTIVE",
        features: professionalFeatures(),
        limits: professionalLimits(),
      },
      create: {
        id: "plan_professional_homologation",
        code: "professional",
        name: "Professional",
        description: "Plano de homologacao para operacao completa.",
        status: "ACTIVE",
        billingPeriod: "MANUAL",
        features: professionalFeatures(),
        limits: professionalLimits(),
      },
    }),
  ]);
}

async function seedPlatformAdmin() {
  const [admin, support, readonly] = await Promise.all([
    seedPlatformUser({
      email: seedPlatformEmail("TRIXUS_PLATFORM_ADMIN_EMAIL"),
      name: "Platform Admin",
      password: process.env.TRIXUS_PLATFORM_ADMIN_PASSWORD,
      passwordKey: "TRIXUS_PLATFORM_ADMIN_PASSWORD",
      platformRole: PlatformRole.ADMIN,
    }),
    seedPlatformUser({
      email: seedPlatformEmail("TRIXUS_PLATFORM_SUPPORT_EMAIL"),
      name: "Platform Support",
      password: process.env.TRIXUS_PLATFORM_SUPPORT_PASSWORD,
      passwordKey: "TRIXUS_PLATFORM_SUPPORT_PASSWORD",
      platformRole: PlatformRole.SUPPORT,
    }),
    seedPlatformUser({
      email: seedPlatformEmail("TRIXUS_PLATFORM_READONLY_EMAIL"),
      name: "Platform Readonly",
      password: process.env.TRIXUS_PLATFORM_READONLY_PASSWORD,
      passwordKey: "TRIXUS_PLATFORM_READONLY_PASSWORD",
      platformRole: PlatformRole.READONLY,
    }),
  ]);
  console.info(`platformAdminEmail=${admin.email}`);
  console.info(`platformSupportEmail=${support.email}`);
  console.info(`platformReadonlyEmail=${readonly.email}`);
  console.info("passwordSource=environment");
  console.info(
    `seedResult=${summarizePlatformSeed([admin.result, support.result, readonly.result])}`,
  );
}

async function seedHomologationMinimum() {
  const adminEmail = seedAdminEmail();
  const adminPassword = seedAdminPassword();
  const tenant = await prisma.tenant.upsert({
    where: { slug: "homologacao" },
    update: { name: "Homologacao Trixus", status: "ACTIVE" },
    create: {
      name: "Homologacao Trixus",
      slug: "homologacao",
      status: "ACTIVE",
      legalName: "Homologacao Trixus",
      displayName: "Homologacao Trixus",
      activatedAt: new Date(),
    },
  });
  const roles = await seedRoles(tenant.id);
  const departments = await seedHomologationCatalog(prisma, tenant.id);
  const passwordHash = await hash(adminPassword, 12);
  const admin = await seedUser(adminEmail, "Admin Homologacao", passwordHash);
  await seedMembership(
    tenant.id,
    admin.id,
    roles.tenant_admin.id,
    departments.map(({ id }) => id),
  );
  await seedHomologationOperationalData(prisma, tenant.id, roles, departments);
  await seedTenantSubscription(tenant.id, "plan_professional_homologation");
}

async function seedProductionStaging() {
  const tenantName = productionStagingTenantName();
  const tenantSlug = productionStagingTenantSlug();
  const adminEmail = productionStagingAdminEmail();
  const adminPassword = productionStagingAdminPassword();
  const planCode = process.env.STAGING_PLAN_CODE?.trim() || "professional";
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || plan.status !== "ACTIVE") {
    throw new Error(`STAGING_PLAN_CODE invalido ou inativo: ${planCode}`);
  }

  const passwordHash = await hash(adminPassword, 12);
  const staffPasswordHash = await hash(seedStaffPassword(), 12);
  const tenant = await prisma.$transaction(async (tx) => {
    const savedTenant = await tx.tenant.upsert({
      where: { slug: tenantSlug },
      update: {
        name: tenantName,
        legalName: tenantName,
        displayName: tenantName,
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        activatedAt: new Date(),
        suspendedAt: null,
        terminatedAt: null,
        suspensionReason: null,
      },
      create: {
        name: tenantName,
        slug: tenantSlug,
        legalName: tenantName,
        displayName: tenantName,
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        activatedAt: new Date(),
      },
    });
    const roles = await seedRolesWithClient(tx, savedTenant.id);
    const departments = await seedHomologationCatalog(tx, savedTenant.id);
    const user = await tx.user.upsert({
      where: { email: adminEmail },
      update: {
        name: "Administrador Staging",
        passwordHash,
        status: "ACTIVE",
        platformRole: PlatformRole.USER,
      },
      create: {
        email: adminEmail,
        name: "Administrador Staging",
        passwordHash,
        status: "ACTIVE",
        platformRole: PlatformRole.USER,
      },
    });
    const membership = await tx.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: savedTenant.id, userId: user.id } },
      update: { roleId: roles.tenant_admin.id, status: "ACTIVE" },
      create: {
        tenantId: savedTenant.id,
        userId: user.id,
        roleId: roles.tenant_admin.id,
        status: "ACTIVE",
      },
    });
    await Promise.all(
      departments.map((department) =>
        tx.departmentMembership.upsert({
          where: {
            departmentId_membershipId: {
              departmentId: department.id,
              membershipId: membership.id,
            },
          },
          update: {},
          create: {
            tenantId: savedTenant.id,
            departmentId: department.id,
            membershipId: membership.id,
          },
        }),
      ),
    );
    await seedHomologationOperationalData(
      tx,
      savedTenant.id,
      roles,
      departments,
      staffPasswordHash,
    );
    const subscription = await tx.tenantSubscription.findFirst({
      where: {
        tenantId: savedTenant.id,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] },
      },
    });
    if (subscription) {
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: {
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodEnd: addDays(new Date(), 30),
          limitsSnapshot: plan.limits ?? professionalLimits(),
          featuresSnapshot: plan.features ?? professionalFeatures(),
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      });
    } else {
      await tx.tenantSubscription.create({
        data: {
          tenantId: savedTenant.id,
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodEnd: addDays(new Date(), 30),
          limitsSnapshot: plan.limits ?? professionalLimits(),
          featuresSnapshot: plan.features ?? professionalFeatures(),
        },
      });
    }
    return savedTenant;
  });

  console.info(`productionStagingTenant=${tenant.slug}`);
  console.info(`productionStagingName=${tenant.name}`);
  console.info(`productionStagingAdminEmail=${adminEmail}`);
  console.info("productionStagingSeed=upserted");
}

async function seedDemoData() {
  const [acme, orbit] = await Promise.all([
    prisma.tenant.upsert({
      where: { slug: "acme" },
      update: { name: "Acme Corp", status: "ACTIVE" },
      create: {
        name: "Acme Corp",
        slug: "acme",
        status: "ACTIVE",
        legalName: "Acme Corp",
        displayName: "Acme Corp",
        activatedAt: new Date(),
      },
    }),
    prisma.tenant.upsert({
      where: { slug: "orbit" },
      update: { name: "Orbit Labs", status: "ACTIVE" },
      create: {
        name: "Orbit Labs",
        slug: "orbit",
        status: "ACTIVE",
        legalName: "Orbit Labs",
        displayName: "Orbit Labs",
        activatedAt: new Date(),
      },
    }),
  ]);
  await Promise.all([
    seedTenantSubscription(acme.id, "plan_professional_homologation"),
    seedTenantSubscription(orbit.id, "plan_professional_homologation"),
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
    seedUser("admin@trixus.app", "Ana Ribeiro", passwordHash),
    seedUser("supervisor@trixus.app", "Pedro Camargo", passwordHash),
    seedUser("atendente@trixus.app", "Camila Duarte", passwordHash),
    seedUser("admin-orbit@trixus.app", "Bruna Martins", passwordHash),
    seedUser("agent-orbit@trixus.app", "Otavio Silva", passwordHash),
    seedUser("platform@trixus.app", "Paula Plataforma", passwordHash, PlatformRole.ADMIN),
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

async function seedRolesWithClient(
  tx: Pick<PrismaClient, "permission" | "role" | "rolePermission">,
  tenantId: string,
) {
  const permissionIds = [...new Set(SYSTEM_ROLES.flatMap((role) => role.permissions))];
  await Promise.all(
    permissionIds.map((permissionId) =>
      tx.permission.upsert({
        where: { id: permissionId },
        update: { description: permissionDescription(permissionId) },
        create: { id: permissionId, description: permissionDescription(permissionId) },
      }),
    ),
  );

  const entries = await Promise.all(
    SYSTEM_ROLES.map(async (role) => {
      const saved = await tx.role.upsert({
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
      await tx.rolePermission.deleteMany({ where: { roleId: saved.id } });
      await tx.rolePermission.createMany({
        data: role.permissions.map((permissionId) => ({ roleId: saved.id, permissionId })),
        skipDuplicates: true,
      });
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

async function seedHomologationCatalog(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  primaryDepartmentName = "COMPRAS",
) {
  const normalizedPrimaryName = normalizeSeedCatalogName(primaryDepartmentName);
  const departments = [
    {
      ...HOMOLOGATION_DEPARTMENTS[0],
      name: primaryDepartmentName,
      description: "Departamento principal da homologacao.",
    },
    ...HOMOLOGATION_DEPARTMENTS.slice(1).filter(
      (department) => normalizeSeedCatalogName(department.name) !== normalizedPrimaryName,
    ),
  ];

  const savedDepartments = await Promise.all(
    departments.map(({ name, color, description }) =>
      client.department.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: { color, description, active: true },
        create: { tenantId, name, color, description, active: true },
      }),
    ),
  );

  await Promise.all(
    HOMOLOGATION_TAGS.map(({ name, color }) => {
      const normalizedName = normalizeSeedCatalogName(name);
      return client.tag.upsert({
        where: { tenantId_normalizedName: { tenantId, normalizedName } },
        update: { name, color, archivedAt: null },
        create: { tenantId, name, normalizedName, color },
      });
    }),
  );

  return savedDepartments;
}

async function seedHomologationOperationalData(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  roles: Record<(typeof SYSTEM_ROLES)[number]["key"], { id: string }>,
  departments: { id: string; name: string }[],
  passwordHash?: string,
) {
  const staffPasswordHash = passwordHash ?? (await hash(seedStaffPassword(), 12));
  const departmentIds = departments.map(({ id }) => id);

  await Promise.all(
    HOMOLOGATION_CUSTOMERS.map((name, index) =>
      client.customer.upsert({
        where: { tenantId_id: { tenantId, id: `seed-customer-${normalizeSeedCatalogName(name)}` } },
        update: {
          name,
          archivedAt: null,
          color: HOMOLOGATION_TAGS[index % HOMOLOGATION_TAGS.length].color,
        },
        create: {
          id: `seed-customer-${normalizeSeedCatalogName(name)}`,
          tenantId,
          name,
          color: HOMOLOGATION_TAGS[index % HOMOLOGATION_TAGS.length].color,
        },
      }),
    ),
  );

  await Promise.all(
    HOMOLOGATION_DEPARTMENTS.map(({ name, color }) => {
      const normalizedName = normalizeSeedCatalogName(name);
      return client.contactDepartment.upsert({
        where: { tenantId_normalizedName: { tenantId, normalizedName } },
        update: { name, color, archivedAt: null },
        create: { tenantId, name, normalizedName, color },
      });
    }),
  );

  await Promise.all(
    HOMOLOGATION_CONTACT_PROFILES.map((name, index) => {
      const normalizedName = normalizeSeedCatalogName(name);
      return client.contactProfile.upsert({
        where: { tenantId_normalizedName: { tenantId, normalizedName } },
        update: { name, color: HOMOLOGATION_TAGS[index].color, archivedAt: null },
        create: { tenantId, name, normalizedName, color: HOMOLOGATION_TAGS[index].color },
      });
    }),
  );

  for (const reply of HOMOLOGATION_QUICK_REPLIES) {
    const normalizedShortcut = reply.shortcut.toLowerCase();
    const existing = await client.quickReply.findFirst({
      where: { tenantId, departmentId: null, normalizedShortcut },
      select: { id: true },
    });
    const data = {
      title: reply.title,
      shortcut: reply.shortcut,
      normalizedShortcut,
      content: reply.content,
      closeOnSend: reply.closeOnSend,
      archivedAt: null,
    };
    if (existing) {
      await client.quickReply.update({ where: { id: existing.id }, data });
    } else {
      await client.quickReply.create({ data: { tenantId, departmentId: null, ...data } });
    }
  }

  for (const staff of HOMOLOGATION_STAFF) {
    const user = await client.user.upsert({
      where: { email: staff.email },
      update: {
        name: staff.name,
        passwordHash: staffPasswordHash,
        status: "ACTIVE",
        platformRole: PlatformRole.USER,
      },
      create: {
        email: staff.email,
        name: staff.name,
        passwordHash: staffPasswordHash,
        status: "ACTIVE",
        platformRole: PlatformRole.USER,
      },
    });
    await seedMembershipWithClient(client, tenantId, user.id, roles[staff.role].id, departmentIds);
  }
}

function normalizeSeedCatalogName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

async function seedPlatformUser(input: {
  email: string;
  name: string;
  password?: string;
  passwordKey: string;
  platformRole: PlatformRole;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (!existing && !input.password) {
    throw new Error(`${input.passwordKey} must be configured to create ${input.email}.`);
  }
  const passwordHash = input.password ? await hash(input.password, 12) : undefined;
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: passwordHash!,
        status: "ACTIVE",
        platformRole: input.platformRole,
      },
    });
    return { email: user.email, result: "created" as const };
  }
  const needsProfileUpdate =
    existing.name !== input.name ||
    existing.status !== "ACTIVE" ||
    existing.platformRole !== input.platformRole;
  if (!needsProfileUpdate && !passwordHash) {
    return { email: existing.email, result: "unchanged" as const };
  }
  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      status: "ACTIVE",
      platformRole: input.platformRole,
      passwordHash,
    },
  });
  return { email: user.email, result: "updated" as const };
}

async function seedMembership(
  tenantId: string,
  userId: string,
  roleId: string,
  departmentIds: string[],
) {
  return seedMembershipWithClient(prisma, tenantId, userId, roleId, departmentIds);
}

async function seedMembershipWithClient(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  roleId: string,
  departmentIds: string[],
) {
  const membership = await client.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { roleId, status: "ACTIVE" },
    create: { tenantId, userId, roleId, status: "ACTIVE" },
  });
  await client.departmentMembership.deleteMany({
    where: { tenantId, membershipId: membership.id },
  });
  await client.departmentMembership.createMany({
    data: departmentIds.map((departmentId) => ({
      tenantId,
      membershipId: membership.id,
      departmentId,
    })),
    skipDuplicates: true,
  });
  return membership;
}

async function seedTenantSubscription(tenantId: string, planId: string) {
  const existing = await prisma.tenantSubscription.findFirst({
    where: { tenantId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] } },
  });
  if (existing) return existing;
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  return prisma.tenantSubscription.create({
    data: {
      id: `sub_${tenantId}`,
      tenantId,
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      limitsSnapshot: plan.limits ?? professionalLimits(),
      featuresSnapshot: plan.features ?? professionalFeatures(),
    },
  });
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
        name: isOrbit ? "Orbit Energia" : "Trixus Cafe",
        responsibleContactName: isOrbit ? "Bruna Martins" : "Ana Ribeiro",
        color: isOrbit ? "#0891b2" : "#2563eb",
        archivedAt: null,
      },
      create: {
        id: palette.customerA,
        tenantId,
        name: isOrbit ? "Orbit Energia" : "Trixus Cafe",
        email: isOrbit ? "contato@orbitenergia.example" : "contato@trixuscafe.example",
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
      where: { tenantId_normalizedName: { tenantId, normalizedName: "vip" } },
      update: { name: "VIP", color: "#f59e0b", archivedAt: null },
      create: {
        id: palette.tagVip,
        tenantId,
        name: "VIP",
        normalizedName: "vip",
        color: "#f59e0b",
      },
    }),
    prisma.tag.upsert({
      where: { tenantId_normalizedName: { tenantId, normalizedName: "lead" } },
      update: { name: "Lead", color: "#16a34a", archivedAt: null },
      create: {
        id: palette.tagLead,
        tenantId,
        name: "Lead",
        normalizedName: "lead",
        color: "#16a34a",
      },
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
        email: isOrbit ? "marina@orbitenergia.example" : "marina@trixuscafe.example",
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
        email: isOrbit ? "marina@orbitenergia.example" : "marina@trixuscafe.example",
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

function seedAdminEmail() {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (email) return email.toLowerCase().trim();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_ADMIN_EMAIL must be configured in production.");
  }
  return "admin@trixus.app";
}

function seedAdminPassword() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_ADMIN_PASSWORD must be configured in production.");
  }
  return "demo1234";
}

function seedAgentEmail() {
  const email = process.env.SEED_AGENT_EMAIL;
  if (email) return email.toLowerCase().trim();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_AGENT_EMAIL must be configured in production.");
  }
  return "atendente@trixus.app";
}

function seedAgentPassword() {
  const password = process.env.SEED_AGENT_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_AGENT_PASSWORD must be configured in production.");
  }
  return "demo1234";
}

function seedStaffPassword() {
  const password = process.env.SEED_STAFF_PASSWORD ?? process.env.SEED_AGENT_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_STAFF_PASSWORD must be configured in production.");
  }
  return "demo1234";
}

function productionStagingTenantName() {
  return process.env.STAGING_TENANT_NAME?.trim() || "Empresa Teste";
}

function productionStagingTenantSlug() {
  return normalizeSlug(process.env.STAGING_TENANT_SLUG?.trim() || "staging");
}

function productionStagingAdminEmail() {
  return (process.env.STAGING_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@trixus.app")
    .toLowerCase()
    .trim();
}

function productionStagingAdminPassword() {
  const password = process.env.STAGING_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("STAGING_ADMIN_PASSWORD must be configured for SEED_MODE=production.");
  }
  return password;
}

function seedPlatformEmail(key: string) {
  const email = process.env[key];
  if (!email?.trim()) throw new Error(`${key} must be configured.`);
  return email.toLowerCase().trim();
}

function summarizePlatformSeed(results: Array<"created" | "updated" | "unchanged">) {
  if (results.includes("created")) return "created";
  if (results.includes("updated")) return "updated";
  return "unchanged";
}

function starterFeatures() {
  return {
    campaigns: false,
    tickets: true,
    multipleConnections: false,
    storage: true,
    realtime: true,
  };
}

function professionalFeatures() {
  return {
    campaigns: true,
    tickets: true,
    multipleConnections: true,
    storage: true,
    realtime: true,
  };
}

function starterLimits() {
  return {
    maxUsers: 3,
    maxDepartments: 2,
    maxConnections: 1,
    maxContacts: 1000,
    maxCampaignRecipients: 0,
    maxStorageBytes: 50 * 1024 * 1024,
  };
}

function professionalLimits() {
  return {
    maxUsers: 20,
    maxDepartments: 10,
    maxConnections: 5,
    maxContacts: 10000,
    maxCampaignRecipients: 500,
    maxStorageBytes: 512 * 1024 * 1024,
  };
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
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
