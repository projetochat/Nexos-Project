import { BadRequestException } from "@nestjs/common";
import { Prisma } from "../generated/prisma";

export const REGISTRATION_CASE_KEYS = [
  "contacts",
  "contactCompanies",
  "contactDepartments",
  "contactProfiles",
  "attendants",
  "accessProfiles",
  "departments",
  "tags",
  "botFlows",
  "automations",
  "aiAgents",
  "ticketTitles",
] as const;

export type RegistrationCaseKey = (typeof REGISTRATION_CASE_KEYS)[number];

type RawClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

const columnByKey: Record<RegistrationCaseKey, string> = {
  contacts: "contacts",
  contactCompanies: "contact_companies",
  contactDepartments: "contact_departments",
  contactProfiles: "contact_profiles",
  attendants: "attendants",
  accessProfiles: "access_profiles",
  departments: "departments",
  tags: "tags",
  botFlows: "bot_flows",
  automations: "automations",
  aiAgents: "ai_agents",
  ticketTitles: "ticket_titles",
};

const countSqlByKey: Record<RegistrationCaseKey, (tenantId: string) => Prisma.Sql> = {
  contacts: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "contacts" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL AND "normalizedPhone" NOT LIKE 'group:%'`,
  contactCompanies: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "customers" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  contactDepartments: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "customer_departments" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  contactProfiles: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "contact_profiles" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  attendants: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "tenant_memberships" tm INNER JOIN "roles" r ON r.id = tm."roleId" AND r."tenantId" = tm."tenantId" WHERE tm."tenantId" = ${tenantId} AND r.key <> 'customer_portal'`,
  accessProfiles: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "roles" WHERE "tenantId" = ${tenantId} AND key <> 'customer_portal'`,
  departments: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "departments" WHERE "tenantId" = ${tenantId} AND active = TRUE`,
  tags: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "tags" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  botFlows: () => Prisma.sql`SELECT 0::int AS count`,
  automations: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "automation_rules" WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  aiAgents: () => Prisma.sql`SELECT 0::int AS count`,
  ticketTitles: (tenantId) =>
    Prisma.sql`SELECT COUNT(*)::int AS count FROM "tickets" WHERE "tenantId" = ${tenantId}`,
};

const conversionSqlByKey: Partial<Record<RegistrationCaseKey, (tenantId: string) => Prisma.Sql>> = {
  contacts: (tenantId) =>
    Prisma.sql`UPDATE "contacts" SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL AND "normalizedPhone" NOT LIKE 'group:%'`,
  contactCompanies: (tenantId) =>
    Prisma.sql`UPDATE "customers" SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  contactDepartments: (tenantId) =>
    Prisma.sql`UPDATE "customer_departments" SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  contactProfiles: (tenantId) =>
    Prisma.sql`UPDATE "contact_profiles" SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  attendants: (tenantId) =>
    Prisma.sql`UPDATE "tenant_memberships" tm SET presentation_name = UPPER(COALESCE(tm.presentation_name, u.name)), "updatedAt" = CURRENT_TIMESTAMP FROM users u, roles r WHERE tm."userId" = u.id AND tm."roleId" = r.id AND r."tenantId" = tm."tenantId" AND tm."tenantId" = ${tenantId} AND r.key <> 'customer_portal'`,
  accessProfiles: (tenantId) =>
    Prisma.sql`UPDATE roles SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND key <> 'customer_portal'`,
  departments: (tenantId) =>
    Prisma.sql`UPDATE departments SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND active = TRUE`,
  tags: (tenantId) =>
    Prisma.sql`UPDATE tags SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  automations: (tenantId) =>
    Prisma.sql`UPDATE automation_rules SET name = UPPER(name), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL`,
  ticketTitles: (tenantId) =>
    Prisma.sql`UPDATE tickets SET title = UPPER(title), "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId}`,
};

export async function registrationCaseEnabled(
  prisma: Pick<RawClient, "$queryRaw">,
  tenantId: string,
  key: RegistrationCaseKey,
) {
  if (typeof prisma.$queryRaw !== "function") return false;
  const column = Prisma.raw(`"${columnByKey[key]}"`);
  const rows = await prisma.$queryRaw<Array<{ enabled: boolean }>>(
    Prisma.sql`SELECT ${column} AS enabled FROM "tenant_registration_case_settings" WHERE "tenantId" = ${tenantId}`,
  );
  return rows?.[0]?.enabled === true;
}

export async function normalizeRegistrationText(
  prisma: Pick<RawClient, "$queryRaw">,
  tenantId: string,
  key: RegistrationCaseKey,
  value: string,
) {
  const trimmed = value.trim();
  return (await registrationCaseEnabled(prisma, tenantId, key))
    ? trimmed.toLocaleUpperCase("pt-BR")
    : trimmed;
}

export async function registrationCaseSnapshot(
  prisma: Pick<RawClient, "$queryRaw">,
  tenantId: string,
) {
  const rows = await prisma.$queryRaw<Array<Record<string, boolean>>>(
    Prisma.sql`SELECT contacts, contact_companies AS "contactCompanies", contact_departments AS "contactDepartments", contact_profiles AS "contactProfiles", attendants, access_profiles AS "accessProfiles", departments, tags, bot_flows AS "botFlows", automations, ai_agents AS "aiAgents", ticket_titles AS "ticketTitles" FROM "tenant_registration_case_settings" WHERE "tenantId" = ${tenantId}`,
  );
  const values = Object.fromEntries(
    REGISTRATION_CASE_KEYS.map((key) => [key, rows[0]?.[key] === true]),
  );
  const counts = Object.fromEntries(
    await Promise.all(
      REGISTRATION_CASE_KEYS.map(async (key) => {
        const countRows = await prisma.$queryRaw<Array<{ count: number }>>(
          countSqlByKey[key](tenantId),
        );
        return [key, Number(countRows[0]?.count ?? 0)];
      }),
    ),
  );
  return { values, counts };
}

export async function updateRegistrationCase(
  prisma: RawClient & { $transaction<T>(callback: (tx: RawClient) => Promise<T>): Promise<T> },
  tenantId: string,
  input: { key: RegistrationCaseKey; enabled: boolean; confirmExistingConversion?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`);
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "tenant_registration_case_settings" ("tenantId") VALUES (${tenantId}) ON CONFLICT ("tenantId") DO NOTHING`,
    );
    const countRows = await tx.$queryRaw<Array<{ count: number }>>(
      countSqlByKey[input.key](tenantId),
    );
    const count = Number(countRows[0]?.count ?? 0);
    if (input.enabled && count > 0 && input.confirmExistingConversion !== true) {
      throw new BadRequestException({
        code: "REGISTRATION_CASE_CONFIRMATION_REQUIRED",
        count,
        message: `Existem ${count} registros que serão convertidos para maiúsculas.`,
      });
    }
    if (input.enabled && input.confirmExistingConversion === true) {
      if (input.key === "departments") {
        const conflicts = await tx.$queryRaw<Array<{ name: string }>>(
          Prisma.sql`SELECT UPPER(name) AS name FROM departments WHERE "tenantId" = ${tenantId} AND active = TRUE GROUP BY UPPER(name) HAVING COUNT(*) > 1 LIMIT 1`,
        );
        if (conflicts.length) {
          throw new BadRequestException(
            `A conversão geraria departamentos duplicados: ${conflicts[0].name}.`,
          );
        }
      }
      if (input.key === "contactDepartments") {
        const conflicts = await tx.$queryRaw<Array<{ customerId: string; name: string }>>(
          Prisma.sql`SELECT "customerId", UPPER(TRIM(name)) AS name FROM customer_departments WHERE "tenantId" = ${tenantId} AND "archivedAt" IS NULL GROUP BY "customerId", UPPER(TRIM(name)) HAVING COUNT(*) > 1 LIMIT 1`,
        );
        if (conflicts.length) {
          throw new BadRequestException(
            `A conversão geraria departamentos duplicados no mesmo cliente: ${conflicts[0].name}.`,
          );
        }
      }
      const conversion = conversionSqlByKey[input.key];
      if (conversion) await tx.$executeRaw(conversion(tenantId));
    }
    const column = Prisma.raw(`"${columnByKey[input.key]}"`);
    await tx.$executeRaw(
      Prisma.sql`UPDATE "tenant_registration_case_settings" SET ${column} = ${input.enabled}, updated_at = CURRENT_TIMESTAMP WHERE "tenantId" = ${tenantId}`,
    );
    return { key: input.key, enabled: input.enabled, converted: input.enabled ? count : 0 };
  });
}
