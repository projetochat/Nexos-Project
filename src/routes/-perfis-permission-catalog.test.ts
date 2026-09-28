import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TENANT_ADMIN_PERMISSIONS } from "@/lib/access-permissions";

describe("catálogo do Perfil de Acesso", () => {
  it("expõe uma única vez todas as permissões disponíveis no tenant", () => {
    const source = readFileSync(new URL("./perfis.tsx", import.meta.url), "utf8");
    const catalog = source.slice(
      source.indexOf("const PERMISSION_GROUPS"),
      source.indexOf("const TIMEZONE_OPTIONS"),
    );

    for (const permission of TENANT_ADMIN_PERMISSIONS) {
      const occurrences = catalog.split(`"${permission}"`).length - 1;
      expect(occurrences, permission).toBe(1);
    }
  });
});
