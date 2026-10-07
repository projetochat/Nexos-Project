import type { ApiMessage } from "./trixus-api";

export type ConversationPreviewSegment = {
  text: string;
  bold: boolean;
};

export type ConversationPreview = {
  kind: "text" | "image" | "audio" | "video" | "document" | "sticker" | "empty";
  segments: ConversationPreviewSegment[];
  duration: string | null;
};

export function conversationPreview(
  value: string | null | undefined,
  messageType?: ApiMessage["type"] | null,
  durationMs?: number | null,
): ConversationPreview {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  const normalized = clean.toLowerCase();
  const kind = previewKind(normalized, messageType);
  const markerOnly =
    /^\[?(?:imagem|image|foto|audio|áudio|voice|voz|video|vídeo|documento|figurinha)\]?$/i.test(
      clean,
    );

  if (!clean)
    return { kind: "empty", segments: [{ text: "Sem mensagens", bold: false }], duration: null };
  if (kind !== "text" && markerOnly) {
    return {
      kind,
      segments: [{ text: previewLabel(kind), bold: false }],
      duration: kind === "audio" ? formatPreviewDuration(durationMs) : null,
    };
  }
  return {
    kind,
    segments: whatsappPreviewSegments(clean),
    duration: kind === "audio" ? formatPreviewDuration(durationMs) : null,
  };
}

export function whatsappPreviewSegments(value: string): ConversationPreviewSegment[] {
  const segments: ConversationPreviewSegment[] = [];
  const pattern = /(\*\*|\*)([^*\n]+?)\1/g;
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > offset) segments.push({ text: value.slice(offset, index), bold: false });
    segments.push({ text: match[2] ?? "", bold: true });
    offset = index + match[0].length;
  }
  if (offset < value.length) segments.push({ text: value.slice(offset), bold: false });
  return segments.length ? segments : [{ text: value, bold: false }];
}

export function formatPreviewDuration(durationMs?: number | null) {
  if (durationMs === null || durationMs === undefined || durationMs < 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function previewKind(normalized: string, messageType?: ApiMessage["type"] | null) {
  if (messageType === "image") return normalized.includes("[figurinha]") ? "sticker" : "image";
  if (messageType === "audio" || messageType === "voice") return "audio";
  if (messageType === "video") return "video";
  if (messageType === "document") return "document";
  if (normalized.includes("[imagem]") || normalized === "imagem") return "image";
  if (
    normalized.includes("[audio]") ||
    normalized.includes("[áudio]") ||
    normalized === "audio" ||
    normalized === "áudio"
  )
    return "audio";
  if (normalized.includes("[video]") || normalized.includes("[vídeo]")) return "video";
  if (normalized.includes("[documento]") || normalized === "documento") return "document";
  if (normalized.includes("[figurinha]") || normalized === "figurinha") return "sticker";
  return "text";
}

function previewLabel(kind: ConversationPreview["kind"]) {
  if (kind === "image") return "Foto";
  if (kind === "audio") return "Áudio";
  if (kind === "video") return "Vídeo";
  if (kind === "document") return "Documento";
  if (kind === "sticker") return "Figurinha";
  return "Sem mensagens";
}
