import { createHash } from "node:crypto";
import { IsString, Length } from "class-validator";

export class ConfirmDeletionDto {
  @IsString()
  @Length(64, 64)
  snapshotToken!: string;
}

export type DeletionImpactPreview = {
  snapshotToken: string;
  title: string;
  prompt: string;
  record: {
    name: string;
    identifiers: Array<{ label: string; value: string }>;
  };
  dependencies: Array<{
    id: string;
    label: string;
    count: number;
    operation: "unlink" | "reassign" | "delete";
    operationLabel: string;
    items?: Array<{ id: string; label: string; description?: string }>;
    hasMore?: boolean;
  }>;
  consequences: Array<{ id: string; text: string; irreversible: boolean }>;
  confirmation: { level: "standard"; confirmLabel: string };
  blockedReason?: string;
};

export type DeletionResult =
  | { status: "deleted" }
  | { status: "changed"; impact: DeletionImpactPreview; message: string };

export function deletionSnapshot(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function changedDeletion(
  impact: DeletionImpactPreview,
): Extract<DeletionResult, { status: "changed" }> {
  return {
    status: "changed",
    impact,
    message:
      "Os vínculos mudaram desde a última verificação. Revise os dados atualizados antes de confirmar novamente.",
  };
}
