import { Prisma } from "../generated/prisma";

export async function initializeTenantOnboarding(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$executeRaw(
    Prisma.sql`
      INSERT INTO "tenant_onboarding_states" (
        "tenantId",
        "status",
        "currentStep",
        "maxCompletedStep",
        "version",
        "startedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (${tenantId}, 'PENDING', 1, 0, 1, NOW(), NOW(), NOW())
      ON CONFLICT ("tenantId") DO NOTHING
    `,
  );
}
