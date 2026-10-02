export type SanitizationOptions = {
  apply: boolean;
  backupReference: string | null;
  backupSha256: string | null;
};

export function parseSanitizationArgs(argv: string[]): SanitizationOptions;
export function verifyBackupArtifact(
  reference: string,
  expectedSha256: string,
): Promise<{ artifactType: "file" | "directory-manifest"; sha256: string }>;
export function sha256File(path: string): Promise<string>;
