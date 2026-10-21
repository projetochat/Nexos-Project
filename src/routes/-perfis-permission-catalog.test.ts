import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TENANT_ADMIN_PERMISSIONS } from "@/lib/access-permissions";

describe("catálogo do Perfil de Acesso", () => {
  it("expõe uma única vez todas as permissões disponíveis no tenant", () => {
    const source = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
    const catalog = source.slice(
      source.indexOf("const PERMISSION_GROUPS"),
      source.indexOf("const DEFAULT_ROLE_COLOR"),
    );

    for (const permission of TENANT_ADMIN_PERMISSIONS) {
      const occurrences = catalog.split(`"${permission}"`).length - 1;
      expect(occurrences, permission).toBe(1);
    }
  });

  it("não expõe permissões obsoletas como toggles", () => {
    const source = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
    const catalog = source.slice(
      source.indexOf("const PERMISSION_GROUPS"),
      source.indexOf("const DEFAULT_ROLE_COLOR"),
    );

    for (const permission of [
      "chat.audio.send",
      "chat.contacts.create",
      "chat.contacts.edit",
      "chat.tickets.create",
      "chat.contacts.read",
      "chat.customer_link.edit",
      "chat.contacts.block",
      "conversations.manage",
      "chat.tags.use",
    ]) {
      expect(catalog, permission).not.toContain(`"${permission}"`);
    }
  });

  it("apresenta a nova permissão de saída de grupos com rótulo legível", () => {
    const source = readFileSync(new URL("./configuracoes.permissoes.tsx", import.meta.url), "utf8");

    expect(source).toContain('leave: "Sair"');
  });

  it("posiciona Ver leads imediatamente antes de Executa ações em massa", () => {
    const source = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
    const catalog = source.slice(
      source.indexOf("const PERMISSION_GROUPS"),
      source.indexOf("const DEFAULT_ROLE_COLOR"),
    );

    const leadsIndex = catalog.indexOf('id: "leads.read"');
    const bulkIndex = catalog.indexOf('id: "chat.bulk_actions.execute"');
    expect(leadsIndex).toBeGreaterThan(-1);
    expect(bulkIndex).toBeGreaterThan(leadsIndex);
    expect(catalog.slice(leadsIndex, bulkIndex).match(/\bid:\s*"/g)).toHaveLength(1);
  });
});
