import { messageApi, type ApiMessage } from "./trixus-api";

export function canCopyMessage(message: ApiMessage) {
  return (
    message.type === "text" ||
    (!!message.media_data && (!message.media_data.state || message.media_data.state === "ready"))
  );
}

/** Send a new copy; never changes the source message or carries its quoted-message IDs. */
export async function sendMessageCopy(
  message: ApiMessage,
  destination: string,
  clientMessageId: string,
) {
  if (!canCopyMessage(message))
    throw new Error("Esta mensagem ainda não está disponível para envio.");
  const content = copyContentWithoutSenderPrefix(message.content, message.author_name);
  if (message.type === "text")
    return messageApi.sendText(destination, content ?? "", clientMessageId);
  const blob = await messageApi.downloadMedia(message.conversation_id, message.id);
  return messageApi.sendMedia(destination, blob, {
    clientMessageId,
    fileName: message.media_data?.file_name ?? "media",
    mimeType: message.media_data?.mime_type ?? blob.type,
    mediaType: message.type as "image" | "audio" | "voice" | "video" | "document",
    caption: copyContentWithoutSenderPrefix(
      message.media_data?.caption ?? null,
      message.author_name,
    ),
    durationMs: message.duration_ms,
  });
}

export function copyContentWithoutSenderPrefix(
  content: string | null | undefined,
  authorName: string | null | undefined,
) {
  let result = content?.trim() ?? "";
  const name = authorName?.trim();
  if (!name) return result || null;
  const prefixes = [`*${name}:*`, `**${name}:**`];
  let removed = false;
  while (true) {
    const prefix = prefixes.find((candidate) => result.startsWith(candidate));
    if (!prefix) break;
    result = result.slice(prefix.length).replace(/^\s+/, "");
    removed = true;
  }
  return removed ? result || null : content?.trim() || null;
}
