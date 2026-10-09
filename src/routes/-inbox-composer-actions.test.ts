import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

describe("ações do compositor do chat", () => {
  it("mantém o botão de emoji imediatamente antes do botão de áudio", () => {
    const composerActions = source.slice(
      source.indexOf("<MessageEmojiPicker", source.indexOf('aria-label="Mensagem"')),
      source.indexOf(
        '<Button\n              variant="primary"',
        source.indexOf('aria-label="Mensagem"'),
      ),
    );

    expect(composerActions).toMatch(
      /<MessageEmojiPicker[\s\S]*?onSelect=\{insertEmoji\}[\s\S]*?\{allowAudio && !recording && \([\s\S]*?aria-label="Gravar áudio"/,
    );
  });

  it("insere o emoji na seleção atual e devolve o foco ao campo", () => {
    expect(source).toContain("text.slice(0, start) + emoji + text.slice(end)");
    expect(source).toContain(
      "input?.setSelectionRange(start + emoji.length, start + emoji.length)",
    );
  });
});
