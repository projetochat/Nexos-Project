import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCurrentAdminNavRoute } from "../lib/admin-route";

const source = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");

describe("Platform admin shell stability", () => {
  it("recognizes the current route without treating child pages as the same destination", () => {
    expect(isCurrentAdminNavRoute("/admin", "/admin")).toBe(true);
    expect(isCurrentAdminNavRoute("/admin/", "/admin")).toBe(true);
    expect(isCurrentAdminNavRoute("/admin/tenants", "/admin/tenants")).toBe(true);
    expect(isCurrentAdminNavRoute("/admin/tenants/tenant-a", "/admin/tenants")).toBe(false);
  });

  it("usa um ícone de pacote comercial no menu Planos sem alterar sua posição", () => {
    const clients = source.indexOf('{ to: "/admin/empresas", label: "Clientes"');
    const plans = source.indexOf('{ to: "/admin/planos", label: "Planos", icon: Package }');
    const subscriptions = source.indexOf('{ to: "/admin/assinaturas", label: "Assinaturas"');

    expect(source).toContain("Package,");
    expect(source).not.toContain('{ to: "/admin/planos", label: "Planos", icon: Sparkles }');
    expect(plans).toBeGreaterThan(clients);
    expect(plans).toBeLessThan(subscriptions);
  });

  it("keeps the desktop sidebar in the viewport with a fixed system footer", () => {
    expect(source).toContain("hidden h-dvh shrink-0 self-start");
    expect(source).toContain("lg:sticky lg:top-0");
    expect(source).toContain("className={`shrink-0 border-t border-border py-3");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overflow-x-hidden");
  });

  it("stabilizes mobile navigation and restores global scroll styles", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('document.documentElement.style.overscrollBehavior = "none"');
    expect(source).toContain("document.body.style.overflow = previousBodyOverflow");
    expect(source).toContain(
      "if (isCurrentAdminNavRoute(pathname, item.to)) event.preventDefault()",
    );
    expect(source).toContain("onNavigate={closeFromNavigation}");
  });

  it("uses a bounded main scroll area instead of scrolling the whole shell", () => {
    expect(source).toContain(
      'className="flex h-dvh overflow-hidden bg-background text-foreground"',
    );
    expect(source).toContain("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain");
  });

  it("places the Platform password action between theme and logout and uses the official modal", () => {
    const theme = source.indexOf("<ThemeModeMenuItem />");
    const password = source.indexOf('<KeyRound className="h-4 w-4" /> Alterar senha');
    const logout = source.indexOf('<LogOut className="h-4 w-4" /> Sair da plataforma');
    expect(theme).toBeGreaterThan(-1);
    expect(password).toBeGreaterThan(theme);
    expect(logout).toBeGreaterThan(password);
    expect(source).toContain('title="Alterar senha"');
    expect(source).toContain('aria-label={visible ? "Ocultar senha" : "Mostrar senha"}');
    expect(source).toContain("platformApi.changeOwnPassword");
    expect(source).toContain("clearTrixusApiSession()");
  });
});
