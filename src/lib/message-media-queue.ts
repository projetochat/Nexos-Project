export type MessageMediaType = "image" | "video" | "document";

export function messageMediaType(file: Pick<File, "type">): MessageMediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export async function sendMediaQueue<T>(
  items: readonly T[],
  send: (item: T, index: number) => Promise<unknown>,
  onSent: (item: T, index: number) => void,
) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    try {
      await send(item, index);
      onSent(item, index);
    } catch (error) {
      return { remaining: items.slice(index), error };
    }
  }
  return { remaining: [] as T[], error: null };
}
