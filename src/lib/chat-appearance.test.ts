import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_BUBBLE_COLOR,
  chatBackgroundStyle,
  contrastingTextColor,
  contrastRatio,
  normalizeHexColor,
} from "./chat-appearance";

describe("chat appearance", () => {
  it("preserva o azul oficial quando não há personalização", () => {
    expect(normalizeHexColor(null, DEFAULT_CHAT_BUBBLE_COLOR)).toBe("#D0EBFE");
  });

  it("normaliza HEX e escolhe contraste legível", () => {
    expect(normalizeHexColor("#abcdef", DEFAULT_CHAT_BUBBLE_COLOR)).toBe("#ABCDEF");
    expect(contrastingTextColor("#FFFFFF")).toBe("#0F172A");
    expect(contrastingTextColor("#111827")).toBe("#FFFFFF");
    expect(contrastRatio("#FFFFFF", "#000000")).toBeGreaterThan(20);
    expect(contrastRatio("#FFFFFF", "#F8FAFC")).toBeLessThan(4.5);
  });

  it("mantém a imagem oficial sem cor e desliga a imagem para fundo sólido", () => {
    expect(chatBackgroundStyle(null)).toBeUndefined();
    expect(chatBackgroundStyle("#abcdef", "IMAGE")).toBeUndefined();
    expect(chatBackgroundStyle("#abcdef", "COLOR")).toEqual({
      backgroundColor: "#ABCDEF",
      backgroundImage: "none",
    });
  });
});
