import { FileText, FileWarning } from "lucide-react";
import { pendingMediaPreviewKind } from "@/lib/pending-media-preview";

export function PendingMediaPreview({ file }: { file: File }) {
  const kind = pendingMediaPreviewKind(file);
  if (kind === "pdf") {
    return (
      <div
        aria-label={`Prévia PDF de ${file.name}`}
        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded bg-red-50 text-red-600 dark:bg-red-950/40"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span className="text-[8px] font-semibold">PDF</span>
      </div>
    );
  }
  if (kind === "text") {
    return (
      <div
        aria-label={`Prévia de texto de ${file.name}`}
        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded bg-blue-50 text-blue-600 dark:bg-blue-950/40"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span className="text-[8px] font-semibold">TXT</span>
      </div>
    );
  }
  return (
    <div
      aria-label={`Prévia indisponível de ${file.name}`}
      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded bg-surface-2 text-muted-foreground"
      title="Prévia indisponível"
    >
      <FileWarning className="h-4 w-4" aria-hidden="true" />
      <span className="text-[7px] font-semibold">SEM PRÉVIA</span>
    </div>
  );
}
