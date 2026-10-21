import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("placeholder mobile dos campos de data", () => {
  it("usa o padrão minúsculo nos filtros e nos inputs nativos compartilhados", () => {
    const filters = source("./dashboard-filters.tsx");
    const uiKit = source("./ui-kit.tsx");

    expect(filters).toContain('mobilePlaceholder = "dd/mm/aaaa"');
    expect(uiKit).toContain('type === "date" ? "dd/mm/aaaa"');
    expect(uiKit).toContain('type === "datetime-local" ? "dd/mm/aaaa hh:mm"');
  });

  it("usa o padrão minúsculo em campos adicionais e importação", () => {
    const contacts = source("../routes/contatos.tsx");
    const instances = source("../routes/instancias.tsx");

    expect(contacts).toContain(
      'placeholder={variant === "datetime" ? "dd/mm/aaaa hh:mm" : "dd/mm/aaaa"}',
    );
    expect(instances).toContain('placeholder="dd/mm/aaaa"');
  });

  it("não mantém o padrão visual de data em maiúsculas no código da aplicação", () => {
    const applicationSources = [
      source("./dashboard-filters.tsx"),
      source("./ui-kit.tsx"),
      source("../routes/contatos.tsx"),
      source("../routes/instancias.tsx"),
    ].join("\n");

    expect(applicationSources).not.toMatch(/DD\/MM\/AAAA/);
  });
});
