import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

describe("cabeçalho da conversa", () => {
  it("exibe telefone e protocolo na mesma linha, separados por hífen", () => {
    expect(source).toContain("maskBrazilPhone(conv.contact.telefone)");
    expect(source).toContain("conv.contact?.telefone && conv.protocolo");
    expect(source).toContain('<span aria-hidden="true">-</span>');
    expect(source).toContain('Protocolo: <span className="font-mono">#{conv.protocolo}</span>');
  });

  it("navega pelos resultados da busca com Enter e Shift+Enter", () => {
    expect(source).toContain('event.key !== "Enter" || !messageSearchMatches.length');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("navigateMessageSearch(event.shiftKey ? -1 : 1)");
  });
});
