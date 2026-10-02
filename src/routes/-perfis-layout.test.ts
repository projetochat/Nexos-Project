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

  it("apresenta instâncias e departamentos com Todos e toggles em duas colunas", () => {
    const scopes = source.slice(
      source.indexOf("function ScopeSettings"),
      source.indexOf("function PermissionSettings"),
    );
    expect(scopes).toContain('title="Instâncias"');
    expect(scopes).toContain('title="Departamentos"');
    expect(scopes.match(/<PermissionSwitch/g)).toHaveLength(2);

    const selection = source.slice(
      source.indexOf("function SelectionSection"),
      source.indexOf("function PermissionGroupBlock"),
    );
    expect(selection).toContain('label="Todos"');
    expect(selection).toContain("sm:grid-cols-2");
    expect(selection).toContain("ids.length === 1");
    expect(selection).toContain('"sm:grid-cols-1"');
  });

  it("faz agrupadores com um único acesso ocuparem as duas colunas", () => {
    const permissions = source.slice(source.indexOf("function PermissionGroupBlock"));

    expect(permissions).toContain("group.items.length === 1");
    expect(permissions).toContain('"sm:col-span-2"');
  });

  it("explica como instâncias e departamentos se relacionam com o Chat", () => {
    const scopes = source.slice(
      source.indexOf("function ScopeSettings"),
      source.indexOf("function PermissionSettings"),
    );

    expect(scopes).toContain("Escopo do Chat");
    expect(scopes).toContain("Instâncias definem em quais canais");
    expect(scopes).toContain("não limitam a criação nem");
  });
});
