import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/generated/prisma");
const target = resolve(root, "dist/src/generated/prisma");

if (!existsSync(source)) {
  throw new Error("Prisma client not found. Run prisma generate before building.");
}

mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
