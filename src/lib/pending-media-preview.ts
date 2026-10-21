export type PendingMediaPreviewKind = "pdf" | "text" | "unavailable";

export function pendingMediaPreviewKind(
  file: Pick<File, "name" | "type">,
): PendingMediaPreviewKind {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType.startsWith("text/") || extension === "txt") return "text";
  return "unavailable";
}
