import type { QuickReplyAttachment } from "@/lib/trixus-api";

export function readMessageAttachment(file: File): Promise<QuickReplyAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Não foi possível carregar o arquivo."));
        return;
      }
      resolve({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error("Não foi possível carregar o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function validateMessageAttachment(file: File) {
  if (file.size > 10 * 1024 * 1024) return "O arquivo deve ter no máximo 10 MB.";
  if (file.type.startsWith("image/") && file.size > 8 * 1024 * 1024) {
    return "A imagem deve ter no máximo 8 MB.";
  }
  return null;
}

export function formatMessageAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
