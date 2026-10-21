import { execFileSync } from "node:child_process";
import { lstat, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedDirectories = new Map([
  [".output", ".output"],
  ["backend/dist", path.join("backend", "dist")],
  ["dist", "dist"],
  ["dist-ssr", "dist-ssr"],
  ["coverage", "coverage"],
  ["build", "build"],
  [".nyc_output", ".nyc_output"],
  [".tmp", ".tmp"],
]);
const protectedNames = new Set([
  ".continuity",
  "backups",
  "tmp",
  ".local-storage",
  ".validation-storage",
  ".trixus-storage",
]);
const localLogPattern = /^(frontend-dev|backend-dev)\.(out|err)\.log(?:\.\d+)?$/;
const logRetentionDays = 14;

function parseArguments(argumentsList) {
  const options = { all: false, apply: false, pruneLogs: false, targets: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--all") options.all = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--prune-logs") options.pruneLogs = true;
    else if (argument === "--target") {
      const target = argumentsList[index + 1];
      if (!target) throw new Error("--target exige um nome da allowlist");
      options.targets.push(target.replaceAll("\\", "/"));
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }
  if (options.all && options.targets.length > 0) {
    throw new Error("Use --all ou --target, nunca os dois juntos");
  }
  if (!options.all && options.targets.length === 0 && !options.pruneLogs) {
    throw new Error("Informe --all, ao menos um --target ou --prune-logs");
  }
  return options;
}

function assertSafeAbsolutePath(candidate, expectedRelativePath) {
  const resolved = path.resolve(candidate);
  const expected = path.resolve(repositoryRoot, expectedRelativePath);
  const relative = path.relative(repositoryRoot, resolved);
  if (
    resolved !== expected ||
    resolved === repositoryRoot ||
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Caminho recusado: ${resolved}`);
  }
  const firstSegment = relative.split(path.sep)[0];
  if (protectedNames.has(firstSegment) || path.basename(resolved).startsWith(".env")) {
    throw new Error(`Alvo protegido: ${resolved}`);
  }
  return resolved;
}

function trackedFiles(relativePath) {
  const output = execFileSync("git", ["ls-files", "-z", "--", relativePath.replaceAll("\\", "/")], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

async function inventoryTree(root) {
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error(`Link simbolico recusado: ${root}`);
  const summary = { files: 0, directories: 0, bytes: 0, newestMs: rootInfo.mtimeMs };
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const entryInfo = await lstat(absolutePath);
      if (entryInfo.isSymbolicLink()) {
        throw new Error(`Link simbolico interno recusado: ${absolutePath}`);
      }
      summary.newestMs = Math.max(summary.newestMs, entryInfo.mtimeMs);
      if (entryInfo.isDirectory()) {
        summary.directories += 1;
        pending.push(absolutePath);
      } else if (entryInfo.isFile()) {
        summary.files += 1;
        summary.bytes += entryInfo.size;
      } else {
        throw new Error(`Tipo de arquivo especial recusado: ${absolutePath}`);
      }
    }
  }
  return summary;
}

function summariesMatch(first, second) {
  return (
    first.files === second.files &&
    first.directories === second.directories &&
    first.bytes === second.bytes &&
    first.newestMs === second.newestMs
  );
}

async function waitForStability(absolutePath, firstSummary) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const secondSummary = await inventoryTree(absolutePath);
  if (!summariesMatch(firstSummary, secondSummary)) {
    throw new Error(`Alvo mudou durante a verificacao; limpeza recusada: ${absolutePath}`);
  }
}

async function pathExists(absolutePath) {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function removeIsolatedTree(target) {
  const quarantine = `${target.absolutePath}.trixus-cleanup-${process.pid}`;
  if (
    path.dirname(quarantine) !== path.dirname(target.absolutePath) ||
    !path
      .basename(quarantine)
      .startsWith(`${path.basename(target.absolutePath)}.trixus-cleanup-`) ||
    (await pathExists(quarantine))
  ) {
    throw new Error(`Caminho de quarentena recusado: ${quarantine}`);
  }

  await waitForStability(target.absolutePath, target.summary);
  await rename(target.absolutePath, quarantine);
  const isolatedSummary = await inventoryTree(quarantine);
  try {
    await waitForStability(quarantine, isolatedSummary);
  } catch (error) {
    if (!(await pathExists(target.absolutePath))) await rename(quarantine, target.absolutePath);
    throw error;
  }
  await rm(quarantine, { recursive: true, force: false, maxRetries: 0 });
  if (await pathExists(target.absolutePath)) {
    console.warn(`[preservado] ${target.absolutePath} foi recriado por um processo ativo.`);
  }
}

async function collectLogPruneCandidates(nowMs) {
  const logsDirectory = assertSafeAbsolutePath(path.join(repositoryRoot, "logs"), "logs");
  try {
    const directoryInfo = await lstat(logsDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error(`Diretorio de logs invalido: ${logsDirectory}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const cutoff = nowMs - logRetentionDays * 24 * 60 * 60 * 1_000;
  const candidates = [];
  for (const entry of await readdir(logsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !localLogPattern.test(entry.name) || !/\.log\.\d+$/.test(entry.name))
      continue;
    const absolutePath = path.join(logsDirectory, entry.name);
    const relativePath = path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
    if (trackedFiles(relativePath).length > 0) {
      throw new Error(`Log rastreado recusado: ${absolutePath}`);
    }
    const fileInfo = await stat(absolutePath);
    if (fileInfo.mtimeMs < cutoff) {
      candidates.push({
        absolutePath,
        bytes: fileInfo.size,
        modifiedAt: fileInfo.mtime.toISOString(),
      });
    }
  }
  return candidates;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const selectedNames = options.all ? [...allowedDirectories.keys()] : options.targets;
  const unknownTargets = selectedNames.filter((name) => !allowedDirectories.has(name));
  if (unknownTargets.length > 0) {
    throw new Error(`Alvo fora da allowlist: ${unknownTargets.join(", ")}`);
  }

  let reclaimedBytes = 0;
  const existingTargets = [];
  for (const name of [...new Set(selectedNames)]) {
    const relativePath = allowedDirectories.get(name);
    const absolutePath = assertSafeAbsolutePath(
      path.join(repositoryRoot, relativePath),
      relativePath,
    );
    let summary;
    try {
      summary = await inventoryTree(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(`[ausente] ${absolutePath}`);
        continue;
      }
      throw error;
    }
    const tracked = trackedFiles(relativePath);
    if (tracked.length > 0) {
      throw new Error(`Alvo contem ${tracked.length} arquivo(s) rastreado(s): ${absolutePath}`);
    }
    console.log(
      `[${options.apply ? "remover" : "preview"}] ${absolutePath} | ${summary.files} arquivos | ${summary.bytes} bytes | mais recente ${new Date(summary.newestMs).toISOString()}`,
    );
    existingTargets.push({ absolutePath, summary });
  }

  const logCandidates = options.pruneLogs ? await collectLogPruneCandidates(Date.now()) : [];
  for (const candidate of logCandidates) {
    console.log(
      `[${options.apply ? "remover" : "preview"}] ${candidate.absolutePath} | ${candidate.bytes} bytes | modificado ${candidate.modifiedAt}`,
    );
  }

  if (!options.apply) {
    console.log(
      "Simulacao concluida; nada foi removido. Use --apply para executar a lista exibida.",
    );
    return;
  }

  for (const target of existingTargets) {
    await removeIsolatedTree(target);
    reclaimedBytes += target.summary.bytes;
  }
  for (const candidate of logCandidates) {
    const current = await stat(candidate.absolutePath);
    if (current.size !== candidate.bytes || current.mtime.toISOString() !== candidate.modifiedAt) {
      throw new Error(
        `Log mudou durante a verificacao; limpeza recusada: ${candidate.absolutePath}`,
      );
    }
    await rm(candidate.absolutePath, { force: false });
    reclaimedBytes += candidate.bytes;
  }
  console.log(`Limpeza concluida: ${reclaimedBytes} bytes removidos.`);
}

main().catch((error) => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
});
