import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("hover global da ação de visualizar", () => {
  it("aplica o azul primário somente a botões habilitados que contêm o ícone Eye", () => {
    expect(stylesSource).toMatch(
      /button:has\(svg\.lucide-eye\):hover:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[\s\S]*?border-color: color-mix\(in oklab, var\(--color-primary\) 45%, var\(--border\)\);[\s\S]*?background-color: color-mix\(in oklab, var\(--color-primary\) 12%, transparent\);[\s\S]*?color: var\(--color-primary\);[\s\S]*?\}/,
    );
    expect(stylesSource).toMatch(
      /button:has\(svg\.lucide-eye\):hover:not\(:disabled\):not\(\[aria-disabled="true"\]\) svg\.lucide-eye \{[\s\S]*?color: currentColor;[\s\S]*?\}/,
    );
  });

  it("não amplia o hover para EyeOff nem para botões sem o ícone Eye", () => {
    expect(stylesSource).not.toContain("button:has(svg.lucide-eye-off):hover");
    expect(stylesSource).not.toContain('button:hover:not(:disabled):not([aria-disabled="true"])');
  });
});
