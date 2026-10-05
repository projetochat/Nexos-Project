import { messageApi, type ApiMessage } from "./trixus-api";

type ClipboardPort = {
  write?: (items: ClipboardItem[]) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
};

type ClipboardDependencies = {
  clipboard?: ClipboardPort;
  createItem?: (parts: Record<string, ClipboardItemData>) => ClipboardItem;
  downloadMedia?: (conversationId: string, messageId: string) => Promise<Blob>;
  normalizeImage?: (blob: Blob) => Promise<Blob>;
  dataUrl?: (blob: Blob) => Promise<string>;
};

export type MessageClipboardResult = { mode: "rich" | "text-only" };

export async function copyMessageToClipboard(
  message: ApiMessage,
  dependencies: ClipboardDependencies = {},
): Promise<MessageClipboardResult> {
  const clipboard = dependencies.clipboard ?? navigator.clipboard;
  const text = message.content || message.media_data?.caption || "";
  if (message.type !== "image" || !message.media_data) {
    await writeText(clipboard, text);
    return { mode: "text-only" };
  }

  if (!clipboard?.write || (typeof ClipboardItem === "undefined" && !dependencies.createItem)) {
    await writeText(clipboard, text, "Este navegador não permite copiar imagens.");
    return { mode: "text-only" };
  }

  const download =
    dependencies.downloadMedia ??
    ((conversationId, messageId) => messageApi.downloadMedia(conversationId, messageId));
  try {
    const normalize = dependencies.normalizeImage ?? normalizeClipboardImage;
    const encode = dependencies.dataUrl ?? blobDataUrl;
    const image = download(message.conversation_id, message.id).then(normalize);
    const parts: Record<string, ClipboardItemData> = {
      "image/png": image,
      "text/html": image.then(
        async (resolvedImage) =>
          new Blob([clipboardHtml(await encode(resolvedImage), text)], { type: "text/html" }),
      ),
    };
    if (text) parts["text/plain"] = Promise.resolve(new Blob([text], { type: "text/plain" }));
    const createItem = dependencies.createItem ?? ((value) => new ClipboardItem(value));
    await clipboard.write([createItem(parts)]);
    return { mode: "rich" };
  } catch (error) {
    if (!text)
      throw new Error("Não foi possível copiar a imagem neste navegador.", { cause: error });
    await writeText(clipboard, text);
    return { mode: "text-only" };
  }
}

export function clipboardHtml(imageUrl: string, text: string) {
  const caption = text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : "";
  return `<div><img src="${escapeHtml(imageUrl)}" alt="">${caption}</div>`;
}

async function writeText(clipboard: ClipboardPort | undefined, text: string, imageError?: string) {
  if (!text) throw new Error(imageError ?? "Esta mensagem não possui conteúdo para copiar.");
  if (!clipboard?.writeText) throw new Error("A área de transferência não está disponível.");
  await clipboard.writeText(text);
}

async function normalizeClipboardImage(blob: Blob) {
  if (blob.type === "image/png") return blob;
  if (typeof document === "undefined") throw new Error("Conversão de imagem indisponível.");
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversão de imagem indisponível.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (converted) =>
          converted
            ? resolve(converted)
            : reject(new Error("Não foi possível converter a imagem.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}
