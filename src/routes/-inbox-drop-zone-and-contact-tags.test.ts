import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inbox = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const contacts = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");

describe("ajustes visuais do chat e de etiquetas", () => {
  it("usa toda a área da conversa como destino para arquivos", () => {
    expect(inbox).toContain("data-chat-drop-zone");
    expect(inbox).toContain('closest<HTMLElement>("[data-chat-drop-zone]")');
    expect(inbox).toContain('className="pointer-events-none fixed z-[240]');
    expect(inbox).toContain("Arraste arquivo aqui");
  });

  it("usa toda a largura no campo e na lista de etiquetas", () => {
    expect(contacts).toContain('className="min-w-0 flex-1"');
    expect(contacts).toContain("w-full max-w-[calc(100vw-3rem)]");
  });
});
