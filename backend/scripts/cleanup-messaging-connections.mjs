#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient, MessagingProviderType } = require("../src/generated/prisma");

const prisma = new PrismaClient();
const yes = process.argv.includes("--yes");
const includeAllEvolution = process.argv.includes("--all-evolution");

if (!yes) {
  console.error(
    "Refusing to cleanup without --yes. This script is for explicit local/dev cleanup only.",
  );
  process.exit(1);
}

const e2eWhere = {
  providerType: MessagingProviderType.EVOLUTION,
  OR: [
    { name: { startsWith: "Evolution E2E" } },
    { name: { startsWith: "Evolution Acme Cross" } },
    { name: { startsWith: "Evolution Orbit Cross" } },
    { externalReference: { startsWith: "e2e-" } },
  ],
};

const where = includeAllEvolution ? { providerType: MessagingProviderType.EVOLUTION } : e2eWhere;

try {
  const connections = await prisma.messagingConnection.findMany({
    where,
    select: { id: true, tenantId: true, name: true, externalReference: true },
  });

  for (const connection of connections) {
    await prisma.$transaction([
      prisma.message.updateMany({
        where: { tenantId: connection.tenantId, connectionId: connection.id },
        data: { connectionId: null },
      }),
      prisma.conversation.updateMany({
        where: { tenantId: connection.tenantId, connectionId: connection.id },
        data: { connectionId: null },
      }),
      prisma.messagingConnection.delete({
        where: { tenantId_id: { tenantId: connection.tenantId, id: connection.id } },
      }),
    ]);
    console.log(`removed ${connection.id} ${connection.externalReference ?? connection.name}`);
  }

  console.log(`cleanup complete: ${connections.length} connection(s) removed`);
} finally {
  await prisma.$disconnect();
}
