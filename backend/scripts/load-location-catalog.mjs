import { createRequire } from "node:module";
import { loadPackagedLocationCatalog, verifyPackagedLocationCatalog } from "./location-catalog.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--verify-only")) {
  throw new Error("Uso: bun scripts/load-location-catalog.mjs [--verify-only]");
}

const manifest = verifyPackagedLocationCatalog();
if (args[0] === "--verify-only") {
  console.log(
    JSON.stringify({
      code: "LOCATION_CATALOG_ARTIFACT_OK",
      version: manifest.version,
      sha256: manifest.catalogSha256,
      counts: manifest.counts,
    }),
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../src/generated/prisma");
const prisma = new PrismaClient();
try {
  const result = await loadPackagedLocationCatalog(prisma);
  console.log(
    JSON.stringify({
      code: "LOCATION_CATALOG_LOAD_OK",
      status: result.status,
      version: manifest.version,
      sha256: manifest.catalogSha256,
      counts: manifest.counts,
    }),
  );
} finally {
  await prisma.$disconnect();
}
