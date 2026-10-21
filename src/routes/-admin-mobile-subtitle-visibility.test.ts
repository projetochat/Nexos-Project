import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

describe("subtítulos responsivos da Platform", () => {
  it.each(["admin.assinaturas.tsx", "admin.financeiro.tsx"])(
    "oculta o subtítulo no mobile e o preserva no desktop em %s",
    (file) => {
      expect(source(file)).toContain('subtitleClassName="hidden md:block"');
    },
  );
});
