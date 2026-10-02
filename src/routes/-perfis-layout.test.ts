import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");

describe("organização do editor de Perfil de Acesso", () => {
  it("mantém Jornada de Trabalho em uma aba exclusiva", () => {
    expect(source).toContain('{ id: "jornada", label: "Jornada de Trabalho" }');
    expect(source).toContain('activeTab === "jornada"');

    const generalPanel = source.slice(
      source.indexOf('activeTab === "geral"'),
      source.indexOf('activeTab === "acessos"'),
    );
    expect(generalPanel).not.toContain("WorkScheduleEditor");
  });

  it("oculta idioma e timezone da aba Geral sem remover os metadados", () => {
    const generalTab = source.slice(
      source.indexOf("function GeneralTab"),
      source.indexOf("function ScopeSettings"),
    );
    expect(generalTab).not.toContain('label="Idioma"');
    expect(generalTab).not.toContain('label="Timezone"');
    expect(source).toContain("language: data.language");
    expect(source).toContain("timezone: data.timezone");
  });

  it("apresenta a hierarquia de instâncias e departamentos com favorito", () => {
    const scopes = source.slice(
      source.indexOf("function ScopeSettings"),
      source.indexOf("function PermissionSettings"),
    );
    expect(scopes).toContain("Acesso à instância");
    expect(scopes).toContain("Todos os departamentos");
    expect(scopes).toContain("favoriteDepartmentId");
    expect(scopes).toContain("aria-pressed={favorite}");
  });

  it("faz o último acesso de agrupadores ímpares ocupar as duas colunas", () => {
    const permissions = source.slice(source.indexOf("function PermissionGroupBlock"));

    expect(permissions).toContain("group.items.length % 2 === 1");
    expect(permissions).toContain("index === group.items.length - 1");
    expect(permissions).toContain('"sm:col-span-2"');
  });

  it("usa densidade compacta na visualização do atendimento", () => {
    const scopes = source.slice(
      source.indexOf("function ScopeSettings"),
      source.indexOf("function PermissionSettings"),
    );

    expect(scopes).toContain("min-h-10");
    expect(scopes).toContain("min-h-11");
    expect(scopes).toContain("space-y-1.5");
  });

  it("explica como instâncias e departamentos se relacionam com o Chat", () => {
    const scopes = source.slice(
      source.indexOf("function ScopeSettings"),
      source.indexOf("function PermissionSettings"),
    );

    expect(scopes).toContain("Instâncias e departamentos");
    expect(scopes).toContain("quais instâncias, departamentos e conversas");
    expect(scopes).toContain("independentes dos acessos aos módulos");
  });

  it("mantém a ordem final das quatro abas", () => {
    const tabs = source.slice(
      source.indexOf("const tabs:"),
      source.indexOf("return (", source.indexOf("const tabs:")),
    );
    expect(tabs.indexOf('id: "geral"')).toBeLessThan(tabs.indexOf('id: "visualizacao"'));
    expect(tabs.indexOf('id: "visualizacao"')).toBeLessThan(tabs.indexOf('id: "acessos"'));
    expect(tabs.indexOf('id: "acessos"')).toBeLessThan(tabs.indexOf('id: "jornada"'));
  });

  it("carrega opções de escopo sem depender dos catálogos CRUD", () => {
    expect(source).toContain("organizationApi.roleScopeOptions");
    expect(source).toContain('["trixus", "role-scope-options"]');
    expect(source).not.toContain("queryFn: connectionsApi.list");
  });
});
