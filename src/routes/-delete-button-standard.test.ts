import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("padrão dos botões textuais de exclusão", () => {
  it("mantém o tamanho aprovado nas ações próprias de campanhas, chamados e instâncias", () => {
    expect(source("./campanhas.tsx")).toContain(
      'className="trash-action h-8 rounded-lg sm:min-w-20"',
    );
    expect(source("./chamados.tsx")).toContain(
      'className="mr-auto h-8 rounded-lg border-destructive text-destructive sm:min-w-20"',
    );
    expect(source("./instancias.tsx")).toContain("trash-action h-8 rounded-lg sm:min-w-20");
  });
});
