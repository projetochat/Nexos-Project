export type MessageMediaType = "image" | "video" | "document";

export function messageMediaType(file: Pick<File, "type">): MessageMediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export function filesFromTransfer(transfer: Pick<DataTransfer, "files" | "items">): File[] {
  const directFiles = Array.from(transfer.files ?? []);
  if (directFiles.length) return directFiles;
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
}

export async function sendMediaQueue<T>(
  items: readonly T[],
  send: (item: T, index: number) => Promise<unknown>,
  onSent: (item: T, index: number) => void,
) {
  const failed: T[] = [];
  let firstError: unknown = null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    try {
      await send(item, index);
      onSent(item, index);
    } catch (error) {
      failed.push(item);
      firstError ??= error;
    }
  }
  return { remaining: failed, error: firstError };
}
