import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");

describe("Cards de indicadores de Chamados", () => {
  it("reserva a largura do título e posiciona valor e ícone na linha inferior", () => {
    expect(source).toContain("flex min-h-24 flex-col rounded-xl border p-4");
    expect(source).toContain(
      'className="w-full text-xs uppercase tracking-widest text-muted-foreground"',
    );
    expect(source).toContain(
      'className="font-mono text-3xl font-semibold tabular-nums text-foreground"',
    );
    expect(source).toContain('className="mt-auto flex items-center justify-between gap-3 pt-2"');
    expect(source).toContain("h-8 w-8 shrink-0 place-items-center");
    expect(source).toContain("[&>svg]:h-4 [&>svg]:w-4");
  });
});
