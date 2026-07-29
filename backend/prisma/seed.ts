import { PrismaClient, Role } from "../src/generated/prisma";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [acme, orbit] = await Promise.all([
    prisma.tenant.upsert({
      where: { slug: "acme" },
      update: {},
      create: { name: "Acme Corp", slug: "acme" },
    }),
    prisma.tenant.upsert({
      where: { slug: "orbit" },
      update: {},
      create: { name: "Orbit Labs", slug: "orbit" },
    }),
  ]);

  const passwordHash = await hash("demo1234", 12);
  const [admin, operator, outsider] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@nexo.app" },
      update: { passwordHash },
      create: { email: "admin@nexo.app", name: "Ana Ribeiro", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "atendente@nexo.app" },
      update: { passwordHash },
      create: { email: "atendente@nexo.app", name: "Camila Duarte", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "outsider@nexo.app" },
      update: { passwordHash },
      create: { email: "outsider@nexo.app", name: "Otavio Silva", passwordHash },
    }),
  ]);

  await Promise.all([
    prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: acme.id, userId: admin.id } },
      update: { role: Role.ADMIN },
      create: { tenantId: acme.id, userId: admin.id, role: Role.ADMIN },
    }),
    prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: acme.id, userId: operator.id } },
      update: { role: Role.OPERATOR },
      create: { tenantId: acme.id, userId: operator.id, role: Role.OPERATOR },
    }),
    prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: orbit.id, userId: outsider.id } },
      update: { role: Role.ADMIN },
      create: { tenantId: orbit.id, userId: outsider.id, role: Role.ADMIN },
    }),
  ]);

  await Promise.all([
    prisma.protectedRecord.upsert({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      update: {},
      create: {
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: acme.id,
        title: "Acme onboarding",
        body: "Registro visivel apenas para usuarios do tenant Acme.",
      },
    }),
    prisma.protectedRecord.upsert({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      update: {},
      create: {
        id: "22222222-2222-4222-8222-222222222222",
        tenantId: orbit.id,
        title: "Orbit playbook",
        body: "Registro visivel apenas para usuarios do tenant Orbit.",
      },
    }),
  ]);
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
