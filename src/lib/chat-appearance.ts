export const DEFAULT_CHAT_BUBBLE_COLOR = "#D0EBFE";
export const DEFAULT_CHAT_BUBBLE_TEXT_COLOR = "#0F172A";
export const DEFAULT_CUSTOMER_BUBBLE_COLOR = "#FFFFFF";
export const DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR = "#0F172A";
export const DEFAULT_CHAT_BACKGROUND_COLOR = "#F8FAFC";

export const CHAT_APPEARANCE_PALETTES = {
  Padrão: ["#D0EBFE", "#0F172A", "#FFFFFF", "#0F172A", "#F8FAFC"],
  "Alto contraste": ["#000000", "#FFFFFF", "#FFFFFF", "#000000", "#E5E7EB"],
  "Azul/Amarelo": ["#1D4ED8", "#FFFFFF", "#FEF08A", "#422006", "#EFF6FF"],
  "Verde/Vermelho": ["#166534", "#FFFFFF", "#FEE2E2", "#7F1D1D", "#F0FDF4"],
  "Preto/Branco": ["#111827", "#FFFFFF", "#FFFFFF", "#111827", "#F3F4F6"],
} as const;

export const CHAT_BUBBLE_PALETTE = [
  "#D0EBFE",
  "#DBEAFE",
  "#DCFCE7",
  "#FEF3C7",
  "#FCE7F3",
  "#EDE9FE",
] as const;

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

export function chatBackgroundStyle(
  value: string | null | undefined,
  mode: "IMAGE" | "COLOR" | undefined = "IMAGE",
) {
  if (!value || mode !== "COLOR") return undefined;
  return {
    backgroundColor: normalizeHexColor(value, DEFAULT_CHAT_BACKGROUND_COLOR),
    backgroundImage: "none" as const,
  };
}

export function contrastingTextColor(background: string) {
  const color = normalizeHexColor(background, DEFAULT_CHAT_BUBBLE_COLOR).slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
  return luminance > 0.52 ? "#0F172A" : "#FFFFFF";
}

export function contrastRatio(background: string, foreground: string) {
  const luminance = (value: string) => {
    const hex = normalizeHexColor(value, "#000000").slice(1);
    const channels = [0, 2, 4].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    );
    const linear = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const left = luminance(background);
  const right = luminance(foreground);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
