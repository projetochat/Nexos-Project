import { spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logsDirectory = path.resolve(repositoryRoot, "logs");
const allowedNames = new Set(["frontend-dev", "backend-dev"]);
const maximumBytes = 10 * 1024 * 1024;
const retainedSegments = 5;

function assertSafeLogsDirectory() {
  if (!existsSync(logsDirectory)) mkdirSync(logsDirectory, { recursive: false });
  const info = lstatSync(logsDirectory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    realpathSync(logsDirectory) !== logsDirectory
  ) {
    throw new Error(`Diretorio de logs recusado: ${logsDirectory}`);
  }
}

function assertRegularFileOrMissing(filePath) {
  let info;
  try {
    info = lstatSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Arquivo de log recusado: ${filePath}`);
  }
}

function acquireLock(logName) {
  const lockPath = path.join(logsDirectory, `${logName}.lock`);
  try {
    const descriptor = openSync(lockPath, "wx");
    writeFileSync(descriptor, String(process.pid));
    return { descriptor, lockPath };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assertRegularFileOrMissing(lockPath);
    const owner = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
    try {
      process.kill(owner, 0);
      throw new Error(`Ja existe uma sessao ${logName} ativa (PID ${owner})`);
    } catch (ownerError) {
      if (ownerError.message.startsWith("Ja existe")) throw ownerError;
      rmSync(lockPath, { force: false });
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, String(process.pid));
      return { descriptor, lockPath };
    }
  }
}

function rotate(logPath, incomingBytes) {
  assertRegularFileOrMissing(logPath);
  if (!existsSync(logPath) || statSync(logPath).size + incomingBytes <= maximumBytes) return;
  const oldest = `${logPath}.${retainedSegments}`;
  assertRegularFileOrMissing(oldest);
  if (existsSync(oldest)) rmSync(oldest, { force: false });
  for (let index = retainedSegments - 1; index >= 1; index -= 1) {
    const source = `${logPath}.${index}`;
    assertRegularFileOrMissing(source);
    if (existsSync(source)) renameSync(source, `${logPath}.${index + 1}`);
  }
  renameSync(logPath, `${logPath}.1`);
}

function writeChunk(logPath, destination, chunk) {
  rotate(logPath, chunk.length);
  appendFileSync(logPath, chunk);
  destination.write(chunk);
}

const separatorIndex = process.argv.indexOf("--");
const logName = process.argv[2];
if (
  !allowedNames.has(logName) ||
  separatorIndex < 0 ||
  separatorIndex === process.argv.length - 1
) {
  console.error(
    "Uso: node scripts/run-with-rotating-log.mjs <frontend-dev|backend-dev> -- <comando> [argumentos]",
  );
  process.exit(2);
}

const command = process.argv[separatorIndex + 1];
const commandArguments = process.argv.slice(separatorIndex + 2);
assertSafeLogsDirectory();
const lock = acquireLock(logName);
let lockReleased = false;
function releaseLock() {
  if (lockReleased) return;
  lockReleased = true;
  closeSync(lock.descriptor);
  rmSync(lock.lockPath, { force: false });
}
const stdoutLog = path.join(logsDirectory, `${logName}.out.log`);
const stderrLog = path.join(logsDirectory, `${logName}.err.log`);
const child = spawn(command, commandArguments, {
  cwd: repositoryRoot,
  env: process.env,
  shell: false,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => writeChunk(stdoutLog, process.stdout, chunk));
child.stderr.on("data", (chunk) => writeChunk(stderrLog, process.stderr, chunk));
child.on("error", (error) => {
  releaseLock();
  console.error(`Falha ao iniciar ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  releaseLock();
  if (signal) console.error(`Processo encerrado pelo sinal ${signal}`);
  process.exitCode = code ?? 1;
});
