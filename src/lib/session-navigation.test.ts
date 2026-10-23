import { describe, expect, it } from "vitest";
import {
  canAccessTenantRoute,
  canAccessSessionRoute,
  CUSTOMER_PORTAL_DASHBOARD_PATH,
  CUSTOMER_PORTAL_TICKETS_PATH,
  currentRoleHome,
  homeForSession,
  loginPathForRoleKey,
  tenantHomeForPermissions,
} from "./session";

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

  it("blocks optional modules disabled for the tenant", () => {
    expect(canAccessTenantRoute("/campanhas", ["campaigns.read"], { campaigns: false })).toBe(
      false,
    );
    expect(canAccessTenantRoute("/chamados/ticket-1", ["tickets.read"], { tickets: false })).toBe(
      false,
    );
    expect(canAccessTenantRoute("/clientes", ["contacts.read"], { tickets: false })).toBe(false);
    expect(canAccessTenantRoute("/chamados", ["tickets.read"], { tickets: true })).toBe(true);
    expect(canAccessTenantRoute("/clientes", ["contacts.read"], { tickets: true })).toBe(true);
  });

  it("uses permissions for every tenant role and preserves the platform admin home", () => {
    expect(currentRoleHome("operator", ["roles.read"])).toBe("/perfis");
    expect(currentRoleHome("supervisor", ["conversations.read"])).toBe("/inbox");
    expect(currentRoleHome("admin", ["users.read"])).toBe("/atendentes");
    expect(currentRoleHome("super_admin", ["dashboard.read"])).toBe("/admin");
    expect(currentRoleHome(undefined, ["dashboard.read"])).toBe("/login");
  });

  it("returns each authentication audience to its own login", () => {
    expect(loginPathForRoleKey("customer_portal")).toBe("/login/portal-cliente");
    expect(loginPathForRoleKey("tenant_admin")).toBe("/login");
    expect(loginPathForRoleKey("platform_admin")).toBe("/login");
    expect(loginPathForRoleKey()).toBe("/login");
  });

  it("isolates the customer portal tickets route from the internal tickets route", () => {
    expect(
      canAccessSessionRoute(CUSTOMER_PORTAL_TICKETS_PATH, "customer_portal", ["tickets.read"], {
        tickets: true,
      }),
    ).toBe(true);
    expect(canAccessSessionRoute("/chamados", "customer_portal", ["tickets.read"])).toBe(false);
    expect(
      canAccessSessionRoute(CUSTOMER_PORTAL_TICKETS_PATH, "agent", ["tickets.read"]),
    ).toBe(false);
    expect(canAccessSessionRoute("/chamados", "agent", ["tickets.read"])).toBe(true);
    expect(homeForSession("customer_portal", ["tickets.read"])).toBe(
      CUSTOMER_PORTAL_TICKETS_PATH,
    );
    expect(
      canAccessSessionRoute(
        CUSTOMER_PORTAL_DASHBOARD_PATH,
        "customer_portal",
        ["tickets.read"],
        { tickets: true },
        "FULL_ACCESS",
      ),
    ).toBe(true);
    expect(
      canAccessSessionRoute(
        CUSTOMER_PORTAL_DASHBOARD_PATH,
        "customer_portal",
        ["tickets.read"],
        { tickets: true },
        "MANAGER",
      ),
    ).toBe(false);
    expect(homeForSession("customer_portal", ["tickets.read"], undefined, "FULL_ACCESS")).toBe(
      CUSTOMER_PORTAL_DASHBOARD_PATH,
    );
  });
});
