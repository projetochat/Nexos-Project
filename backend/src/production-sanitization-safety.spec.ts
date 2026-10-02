import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseSanitizationArgs,
  sha256File,
  verifyBackupArtifact,
} from "../scripts/production-sanitization-safety.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("production sanitization safety", () => {
  it("keeps dry-run as default and requires a backup path plus SHA-256 for apply", () => {
    expect(parseSanitizationArgs([])).toEqual({
      apply: false,
      backupReference: null,
      backupSha256: null,
    });
    expect(() => parseSanitizationArgs(["--apply"])).toThrow("--backup-reference");
    expect(() => parseSanitizationArgs(["--apply", "--backup-reference", "backup.dump"])).toThrow(
      "--backup-sha256",
    );
    expect(() =>
      parseSanitizationArgs([
        "--apply",
        "--backup-reference",
        "backup.dump",
        "--backup-sha256",
        "invalid",
      ]),
    ).toThrow("SHA-256");
  });

  it("verifies a non-empty backup file against the informed digest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trixus-backup-test-"));
    temporaryDirectories.push(directory);
    const backup = join(directory, "backup.dump");
    await writeFile(backup, "verified backup fixture", "utf8");
    const digest = await sha256File(backup);

    await expect(verifyBackupArtifact(backup, digest)).resolves.toEqual({
      artifactType: "file",
      sha256: digest,
    });
    await expect(verifyBackupArtifact(backup, "0".repeat(64))).rejects.toThrow("não corresponde");
  });

  it("requires and verifies a manifest when the reference is a directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trixus-backup-dir-test-"));
    temporaryDirectories.push(directory);
    await expect(verifyBackupArtifact(directory, "0".repeat(64))).rejects.toThrow(
      "backup-manifest.sha256",
    );
    const nested = join(directory, "snapshot");
    await mkdir(nested);
    const dump = join(nested, "database.dump");
    await writeFile(dump, "database backup", "utf8");
    const dumpDigest = await sha256File(dump);
    const manifest = join(nested, "backup-manifest.sha256");
    await writeFile(manifest, `${dumpDigest}  database.dump\n`, "utf8");
    const digest = await sha256File(manifest);
    await expect(verifyBackupArtifact(nested, digest)).resolves.toEqual({
      artifactType: "directory-manifest",
      sha256: digest,
    });
    await writeFile(dump, "tampered backup", "utf8");
    await expect(verifyBackupArtifact(nested, digest)).rejects.toThrow("SHA-256 do manifesto");
  });
});
