import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permissões de etiquetas em contatos", () => {
  it("usa contacts.update para atribuir etiquetas e chat.tags.create para criar o cadastro", () => {
    const permissions = readFileSync(new URL("../lib/perms.ts", import.meta.url), "utf8");
    const inbox = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

    expect(permissions).toContain('pode_usar_etiquetas: has("contacts.update")');
    expect(permissions).toContain('pode_criar_etiquetas: has("chat.tags.create")');
    expect(inbox).toContain("canCreateCatalog={perms.pode_criar_etiquetas}");
    expect(inbox).not.toContain("canManageCatalog={perms.pode_editar_etiquetas}");
  });

  it("mantém o formulário de contato aberto e inclui a etiqueta criada imediatamente", () => {
    const contacts = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");

    expect(contacts).toContain('permissions?.includes("chat.tags.create")');
    expect(contacts).toContain('aria-label="Nova etiqueta"');
    expect(contacts).toContain("setAvailableTags((current)");
    expect(contacts).toContain("setTagIds((current) => [...new Set([...current, created.id])])");
  });
});
