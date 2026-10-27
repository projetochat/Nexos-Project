import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  new URL("./configuracoes.padrao-cadastros.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(new URL("./configuracoes.tsx", import.meta.url), "utf8");

describe("D29 registration uppercase settings", () => {
  it("places the settings entry immediately before additional fields", () => {
    expect(layoutSource.indexOf('label: "Padrão de Cadastros"')).toBeGreaterThan(-1);
    expect(layoutSource.indexOf('label: "Padrão de Cadastros"')).toBeLessThan(
      layoutSource.indexOf('label: "Campos Adicionais"'),
    );
    expect(layoutSource).toContain("RegistrationCaseIcon");
    expect(layoutSource).toContain("lg:grid-cols-[264px_minmax(0,1fr)]");
  });

  it("exposes all twelve independent toggles with accessible switch semantics", () => {
    const keys = [
      "contacts",
      "contactCompanies",
      "contactDepartments",
      "contactProfiles",
      "attendants",
      "accessProfiles",
      "departments",
      "tags",
      "botFlows",
      "automations",
      "aiAgents",
      "ticketTitles",
    ];
    for (const key of keys) expect(routeSource).toContain(`key: "${key}"`);
    expect(routeSource).toContain('role="switch"');
    expect(routeSource).toContain("aria-checked={enabled}");
  });

  it("requires conversion confirmation and documents modules without persistence", () => {
    expect(routeSource).toContain("Converter registros existentes?");
    expect(routeSource).toContain("confirmExistingConversion: true");
    expect(routeSource).toContain("Módulo ainda sem cadastro persistido.");
    expect(routeSource).toContain(
      "Ao desativar, registros já convertidos permanecem em maiúsculas.",
    );
    expect(routeSource).toContain("border-blue-200 bg-blue-50");
    expect(routeSource).toContain("text-blue-800");
  });
});
