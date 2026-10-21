import { Prisma } from "../generated/prisma";

type DepartmentLockClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function lockActiveDepartmentForConversation(
  tx: DepartmentLockClient,
  input: { tenantId: string; departmentId: string; connectionId: string },
) {
  const departments = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT d.id
      FROM "departments" d
      WHERE d.id = ${input.departmentId}
        AND d."tenantId" = ${input.tenantId}
        AND d.active = true
        AND EXISTS (
          SELECT 1
          FROM "department_messaging_connections" dc
          WHERE dc."tenantId" = d."tenantId"
            AND dc."departmentId" = d.id
            AND dc."connectionId" = ${input.connectionId}
        )
      FOR SHARE
    `,
  );
  return departments.length > 0;
}
