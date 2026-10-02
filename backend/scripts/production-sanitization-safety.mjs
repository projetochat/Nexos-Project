import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function parseSanitizationArgs(argv) {
  const apply = argv.includes("--apply");
  const backupReference = readArg(argv, "--backup-reference");
  const backupSha256 = readArg(argv, "--backup-sha256")?.toLowerCase() ?? null;
  if (apply && !backupReference) {
    throw new Error("Use --backup-reference <arquivo-ou-diretório> antes de aplicar.");
  }
  if (apply && !backupSha256) {
    throw new Error("Use --backup-sha256 <sha256> para verificar o backup informado.");
  }
  if (backupSha256 && !SHA256_PATTERN.test(backupSha256)) {
    throw new Error("O hash do backup deve ser um SHA-256 hexadecimal de 64 caracteres.");
  }
  return { apply, backupReference, backupSha256 };
}

export async function verifyBackupArtifact(reference, expectedSha256) {
  const artifactPath = resolve(reference);
  let artifactStat;
  try {
    artifactStat = await stat(artifactPath);
  } catch {
    throw new Error("A referência de backup não existe ou não pode ser lida.");
  }

  let verifiedFilePath = artifactPath;
  let artifactType = "file";
  if (artifactStat.isDirectory()) {
    artifactType = "directory-manifest";
    verifiedFilePath = resolve(artifactPath, "backup-manifest.sha256");
    try {
      const manifestStat = await stat(verifiedFilePath);
      if (!manifestStat.isFile() || manifestStat.size === 0) throw new Error("empty");
    } catch {
      throw new Error(
        "Diretórios de backup devem conter backup-manifest.sha256 legível e não vazio.",
      );
    }
  } else if (!artifactStat.isFile() || artifactStat.size === 0) {
    throw new Error(
      "A referência de backup deve ser um arquivo não vazio ou diretório com manifesto.",
    );
  }

  const actualSha256 = await sha256File(verifiedFilePath);
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error("O SHA-256 informado não corresponde ao artefato de backup verificável.");
  }
  if (artifactType === "directory-manifest") {
    await verifyManifestEntries(artifactPath, verifiedFilePath);
  }
  return { artifactType, sha256: actualSha256 };
}

export async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyManifestEntries(directory, manifestPath) {
  const lines = (await readFile(manifestPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("O manifesto do backup não contém arquivos verificáveis.");
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s+[*]?(.+)$/i.exec(line);
    if (!match) throw new Error("O manifesto do backup possui uma entrada SHA-256 inválida.");
    const entry = match[2].trim();
    if (isAbsolute(entry))
      throw new Error("O manifesto do backup contém caminho fora do diretório.");
    const entryPath = resolve(directory, entry);
    const relativePath = relative(directory, entryPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("O manifesto do backup contém caminho fora do diretório.");
    }
    let entryStat;
    try {
      entryStat = await stat(entryPath);
    } catch {
      throw new Error("O manifesto referencia um arquivo de backup inexistente.");
    }
    if (!entryStat.isFile() || entryStat.size === 0) {
      throw new Error("O manifesto referencia um arquivo de backup inválido.");
    }
    if ((await sha256File(entryPath)) !== match[1].toLowerCase()) {
      throw new Error("Um arquivo do backup não corresponde ao SHA-256 do manifesto.");
    }
  }
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}
