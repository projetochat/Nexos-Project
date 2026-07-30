import { hash } from "bcryptjs";
import { PrismaClient, PlatformRole } from "../src/generated/prisma";
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
