import type { PrismaService } from "../prisma/prisma.service";
import { AGENT_PERMISSIONS, TENANT_ADMIN_PERMISSIONS } from "../auth/permissions.constants";

type Tx = Pick<PrismaService, "department" | "role" | "rolePermission" | "permission">;

const roles = [
  ["tenant_admin", "Administrador", TENANT_ADMIN_PERMISSIONS],
  ["agent", "Atendente", AGENT_PERMISSIONS],
] as const;

export async function seedTenantRoles(tx: Tx, tenantId: string) {
  const department = await tx.department.upsert({
    where: { tenantId_name: { tenantId, name: "Atendimento" } },
    update: { active: true },
    create: {
      id: `${tenantId}:atendimento`,
      tenantId,
      name: "Atendimento",
      description: "Departamento padrão de atendimento.",
      color: "#3B82F6",
      active: true,
    },
  });
  const permissionIds = [...new Set(roles.flatMap(([, , permissions]) => permissions))];
  await Promise.all(
    permissionIds.map((permissionId) =>
      tx.permission.upsert({
        where: { id: permissionId },
        update: {},
        create: { id: permissionId, description: permissionId },
      }),
    ),
  );

  const entries = await Promise.all(
    roles.map(async ([key, name, permissions]) => {
      const role = await tx.role.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: {
          name,
          system: true,
        },
        create: {
          id: `${tenantId}:${key}`,
          tenantId,
          key,
          name,
          system: true,
          ...(key === "agent" ? { metadata: { departmentIds: [department.id] } } : {}),
        },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      return [key, role] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Record<"tenant_admin" | "agent", { id: string }>;
}
