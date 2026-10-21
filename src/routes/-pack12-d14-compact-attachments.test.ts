import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

describe("PACK 12 · D14 · prévia compacta de múltiplos arquivos", () => {
  it("exibe dois anexos compactos por linha sem remover a rolagem e a ação de remoção", () => {
    expect(source).toContain('className="mb-2 grid max-h-32 grid-cols-2 gap-1 overflow-y-auto"');
    expect(source).toContain(
      "className={`flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2 py-1.5 shadow-card ${",
    );
    expect(source.match(/className="h-10 w-10 rounded object-cover"/g)).toHaveLength(2);
    expect(source).toContain("<PendingMediaPreview file={pendingFile.file} />");
    expect(source).toContain("size={40}");
    expect(source).toContain('className="shrink-0"');
    expect(source).toContain("removePendingFile(pendingFile.id)");
  });

  it("permite escolher qual anexo recebe o texto e distingue prévias sem mídia visual", () => {
    expect(source).toContain("const selectPendingFile = (id: string)");
    expect(source).toContain("carriesContext: item.id === id");
    expect(source).toContain(
      "aria-label={`Usar ${pendingFile.file.name} com o texto da mensagem`}",
    );
    expect(source).toContain("aria-pressed={pendingFile.carriesContext}");
    expect(source).toContain("<PendingMediaPreview file={pendingFile.file} />");
    expect(source).toContain("caption: pendingFile.carriesContext ? t || null : null");
  });
});
