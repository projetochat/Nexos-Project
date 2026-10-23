import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function routeSource(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

describe("PACK 09 catalog status contracts", () => {
  it("keeps department instances optional and exposes the safe inactive flow", () => {
    const source = routeSource("departamentos.tsx");

    expect(source).toContain('<Field label="Instâncias">');
    expect(source).toContain("grid-cols-[minmax(0,1fr)_7.5rem]");
    expect(source).toContain("<DepartmentInstanceMultiSelect");
    expect(source).toContain('aria-haspopup="listbox"');
    expect(source).toContain('aria-label="Limpar seleção"');
    expect(source).not.toContain("Vincule ao menos uma instância.");
    expect(source).toContain("departmentDeactivationPreview");
    expect(source).toContain("DepartmentDeactivationModal");
    expect(source).toContain("<Switch");
  });

  it("persists the access profile active status through the official toggle", () => {
    const source = routeSource("perfis.tsx");

    expect(source).toContain("active: data.active");
    expect(source).toContain("checked={form.active}");
    expect(source).toContain("onCheckedChange={(active)");
  });

  it("loads inactive tags in the catalog and persists their active status", () => {
    const source = routeSource("etiquetas.tsx");

    expect(source).toContain("queryFn: crmApi.listTagsCatalog");
    expect(source).toContain("<Switch checked={active}");
    expect(source).toContain("active,");
  });

  it("persists quick reply status while retaining the existing editor", () => {
    const source = routeSource("mensagens-rapidas.tsx");

    expect(source).toContain("<Switch checked={active}");
    expect(source).toContain("setActive(clone ? true : initial?.active !== false)");
    expect(source).toContain("active,");
  });
});
