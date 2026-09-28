import { describe, expect, it } from "vitest";
import { canAccessTenantRoute, currentRoleHome, tenantHomeForPermissions } from "./session";

describe("tenant permission navigation", () => {
  it("authorizes a module and its nested routes only through its read permission", () => {
    expect(canAccessTenantRoute("/atendentes", ["users.read"])).toBe(true);
    expect(canAccessTenantRoute("/inbox/conversation-1", ["conversations.read"])).toBe(true);
    expect(canAccessTenantRoute("/atendentes", ["conversations.read"])).toBe(false);
  });

  it("keeps profile and help available but fails closed for an unmapped route", () => {
    expect(canAccessTenantRoute("/perfil", [])).toBe(true);
    expect(canAccessTenantRoute("/ajuda", [])).toBe(true);
    expect(canAccessTenantRoute("/modulo-nao-mapeado", ["users.read"])).toBe(false);
  });

  it("selects the first permitted route in universal navigation order", () => {
    expect(tenantHomeForPermissions(["users.read"])).toBe("/atendentes");
    expect(tenantHomeForPermissions(["conversations.read", "dashboard.read"])).toBe("/");
    expect(tenantHomeForPermissions(["roles.read", "users.read"])).toBe("/atendentes");
    expect(tenantHomeForPermissions([])).toBe("/perfil");
  });

  it("uses permissions for every tenant role and preserves the platform admin home", () => {
    expect(currentRoleHome("operator", ["roles.read"])).toBe("/perfis");
    expect(currentRoleHome("supervisor", ["conversations.read"])).toBe("/inbox");
    expect(currentRoleHome("admin", ["users.read"])).toBe("/atendentes");
    expect(currentRoleHome("super_admin", ["dashboard.read"])).toBe("/admin");
    expect(currentRoleHome(undefined, ["dashboard.read"])).toBe("/login");
  });
});
