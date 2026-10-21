import { PrismaClient } from "../src/generated/prisma";
import { ensurePlatformAdmin, resolveTrixusEnvironment } from "./platform-admin-seed";

const prisma = new PrismaClient();

async function main() {
  const environment = resolveTrixusEnvironment(process.env.TRIXUS_ENVIRONMENT);
  const result = await ensurePlatformAdmin(prisma, {
    email: process.env.TRIXUS_PLATFORM_ADMIN_EMAIL,
    password: process.env.TRIXUS_PLATFORM_ADMIN_PASSWORD,
  });

  console.info(`trixusEnvironment=${environment}`);
  console.info(`platformAdminSeed=${result}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
