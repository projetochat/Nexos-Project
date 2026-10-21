import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");

describe("PACK 10 D27 readonly actions for broad forms", () => {
  it.each([
    ["contatos", "contacts.read", "Visualizar Contato"],
    ["atendentes", "users.read", "Visualizar Atendente"],
    ["perfis", "roles.read", "Visualizar Perfil de Acesso"],
    ["instancias", "connections.read", "Visualizar Instância"],
  ])(
    "keeps %s Eye under its read permission and opens an explicit readonly title",
    (file, permission, title) => {
      const contents = source(file);

      expect(contents).toContain(`includes("${permission}")`);
      expect(contents).toContain("<Eye className=");
      expect(contents).toContain(title);
      expect(contents).toContain("readOnly");
    },
  );

  it.each(["contatos", "atendentes", "perfis", "instancias"])(
    "disables the official %s form and removes saving from readonly mode",
    (file) => {
      const contents = source(file);

      expect(contents).toContain("<fieldset disabled={readOnly}");
      expect(contents).toMatch(/readOnly \? "Fechar" : "Cancelar"/);
      expect(contents).toContain("{!readOnly && (");
    },
  );
});
