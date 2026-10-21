import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listOptionsFromText } from "@/lib/contact-custom-field-options";

const source = readFileSync(new URL("./configuracoes.campos-contato.tsx", import.meta.url), "utf8");

describe("contact custom field list options", () => {
  it("preserves legacy order while splitting one option per line", () => {
    expect(listOptionsFromText("BANANA\nMORANGO\nLARANJA\nMANGA")).toEqual([
      "BANANA",
      "MORANGO",
      "LARANJA",
      "MANGA",
    ]);
  });

  it("keeps an editable empty row for a new list", () => {
    expect(listOptionsFromText("")).toEqual([""]);
  });

  it("aligns add and delete actions and gives add the primary hover", () => {
    expect(source.match(/grid-cols-\[2rem_minmax\(0,1fr\)_2\.5rem\]/g)).toHaveLength(2);
    expect(source).toContain('className="action-hover-primary justify-self-center"');
    expect(source).toContain('className="trash-action justify-self-center"');
  });

  it("usa o toggle compartilhado para o campo obrigatório", () => {
    expect(source).toContain('import { Switch } from "@/components/ui/switch"');
    expect(source).toContain('aria-label="Obrigatório"');
    expect(source).toContain("onCheckedChange={(required) => setForm({ ...form, required })}");
    expect(source).not.toContain('type="checkbox"\n                  checked={form.required}');
  });

  it("exibe o toggle obrigatório sem caixa e alinhado à esquerda", () => {
    const requiredToggleSource = source.slice(
      source.indexOf('{form.type !== "checkbox" && ('),
      source.indexOf('{form.type === "custom" && ('),
    );

    expect(requiredToggleSource).toContain('className="flex h-10 items-center justify-start"');
    expect(requiredToggleSource).not.toContain(
      'className="flex h-10 items-center justify-center rounded-lg border border-border bg-surface-1"',
    );
    expect(source).toContain('className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3"');
  });
});
