import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const schemaPath = resolve(root, "backend/prisma/schema.prisma");
const clientDirectory = resolve(root, "backend/src/generated/prisma");
const clientPath = resolve(clientDirectory, "index.js");

function hasLocalEngine() {
  if (!existsSync(clientDirectory)) return false;
  return readdirSync(clientDirectory).some(
    (name) =>
      /^(query_engine|libquery_engine).+\.(dll\.node|so\.node|dylib\.node)$/.test(name) &&
      !name.includes(".tmp"),
  );
}

function clientIsUsable() {
  if (!existsSync(schemaPath) || !existsSync(clientPath) || !hasLocalEngine()) return false;
  const generated = readFileSync(clientPath, "utf8");
  if (!generated.includes('"copyEngine": true')) return false;
  return statSync(clientPath).mtimeMs >= statSync(schemaPath).mtimeMs;
}

if (clientIsUsable()) {
  console.log("Cliente Prisma local verificado.");
  process.exit(0);
}

console.log("Cliente Prisma ausente ou incompatível; regenerando com a versão fixada do projeto.");
const command = process.platform === "win32" ? "bun.exe" : "bun";
const result = spawnSync(command, ["run", "--cwd", "backend", "prisma:generate"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
