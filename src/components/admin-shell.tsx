import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  LifeBuoy,
  KeyRound,
  ScrollText,
  ShieldAlert,
  Activity,
  Settings,
  ChevronRight,
  PanelLeftClose,
  Search,
  Bell,
  LogOut,
  ShieldCheck,
  Sparkles,
  Command,
} from "lucide-react";
import { LogoMark, Avatar } from "./ui-kit";
import { ConnectionPill, OfflineBanner, TopProgress } from "./feedback";
import { useConnectionStatus } from "@/lib/realtime";
import { useTheme } from "./theme-provider";
import { useSession, ROLE_META } from "@/lib/session";
import { ThemeToggle } from "./app-shell";

/* ============================================================
   Nexo · Admin Shell (Painel Super Admin — Plataforma SaaS)
   Ambiente exclusivo do proprietário. Não possui atendimento.
   ============================================================ */

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const negocioNav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/empresas", label: "Empresas", icon: Building2 },
  { to: "/admin/planos", label: "Planos", icon: Sparkles },
  { to: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
  { to: "/admin/financeiro", label: "Financeiro", icon: Receipt },
];

const operacoesNav: NavItem[] = [
  { to: "/admin/suporte", label: "Suporte", icon: LifeBuoy },
  { to: "/admin/licencas", label: "Licenças", icon: KeyRound },
  { to: "/admin/monitoramento", label: "Monitoramento", icon: Activity },
];

const seguranca: NavItem[] = [
  { to: "/admin/logs", label: "Logs", icon: ScrollText },
  { to: "/admin/auditoria", label: "Auditoria", icon: ShieldAlert },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

const LABELS: Record<string, string> = {
  admin: "Nexo Admin",
  empresas: "Empresas",
  planos: "Planos",
  assinaturas: "Assinaturas",
  financeiro: "Financeiro",
  suporte: "Suporte",
  licencas: "Licenças",
  logs: "Logs",
  auditoria: "Auditoria",
  monitoramento: "Monitoramento",
  configuracoes: "Configurações",
};

function useBreadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    crumbs.push({ href: acc, label: LABELS[part] ?? decodeURIComponent(part) });
  }
  return crumbs;
}

const SIDEBAR_KEY = "nexo.admin.sidebar.collapsed";
function useSidebar() {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage may be unavailable in restricted browser contexts.
    }
  }, []);
  const toggle = React.useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // Keep the in-memory state even when persistence is unavailable.
      }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/admin" }}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground ${
        collapsed ? "h-9 w-9 justify-center" : "gap-3 px-3 py-2"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent opacity-0 transition-opacity group-data-[status=active]:opacity-100 ${
          collapsed ? "-left-2" : ""
        }`}
      />
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavSection({
  title,
  items,
  collapsed,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
}) {
  return (
    <div className={collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5"}>
      {!collapsed && (
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      )}
      {collapsed && <div className="my-2 h-px w-6 bg-border" />}
      {items.map((i) => (
        <NavLink key={i.to} item={i} collapsed={collapsed} />
      ))}
    </div>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={`hidden shrink-0 border-r border-border bg-surface-1 transition-[width] duration-200 ease-out lg:flex lg:flex-col ${
        collapsed ? "w-14" : "w-64"
      }`}
    >
      <div className={`flex h-14 shrink-0 items-center border-b border-border ${collapsed ? "justify-center" : "px-4"}`}>
        <Link to="/admin" className="flex items-center gap-2">
          <div className="relative">
            <LogoMark size={24} />
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground ring-2 ring-surface-1">
              ★
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight tracking-tight">Nexo</div>
              <div className="text-[10px] uppercase tracking-widest text-accent">Admin</div>
            </div>
          )}
        </Link>
      </div>
      <nav className={`flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <NavSection title="Negócio" items={negocioNav} collapsed={collapsed} />
        <NavSection title="Operações" items={operacoesNav} collapsed={collapsed} />
        <div className="mt-auto">
          {collapsed && <div className="my-2 h-px w-6 self-center bg-border" />}
          <NavSection title="Sistema" items={seguranca} collapsed={collapsed} />
        </div>
      </nav>
    </aside>
  );
}

function UserMenu() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function on(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1 pr-3 transition hover:bg-surface-2"
      >
        <Avatar name={user?.nome ?? "?"} size={26} />
        <span className="hidden text-sm font-medium sm:inline">
          {user?.nome?.split(" ")[0] ?? "Owner"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 origin-top-right animate-scale-in rounded-xl border border-border bg-popover p-1.5 shadow-elevated">
          <div className="border-b border-border px-3 py-2.5">
            <div className="text-sm font-medium">{user?.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              <ShieldCheck className="h-3 w-3" /> {user ? ROLE_META[user.role].label : ""}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sair da plataforma
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const crumbs = useBreadcrumbs();
  const conn = useConnectionStatus();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl md:gap-3 md:px-6">
      <button
        onClick={onToggleSidebar}
        className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground lg:flex"
        aria-label="Alternar sidebar"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
      <nav className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground md:flex">
        <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
          <ShieldCheck className="h-3 w-3" /> Plataforma
        </span>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={c.href}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
              {last ? (
                <span className="truncate font-medium text-foreground">{c.label}</span>
              ) : (
                <Link to={c.href} className="truncate transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
        <LogoMark size={22} />
        <span className="truncate text-sm font-semibold">Nexo Admin</span>
      </div>

      <ConnectionPill status={conn} />

      <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 md:flex md:w-56 xl:w-72">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Buscar empresa, fatura, log…"
        />
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </div>

      <ThemeToggle />
      <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground">
        <Bell className="h-4 w-4" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent animate-pulse-ring" />
      </button>
      <UserMenu />
    </header>
  );
}

function useAdminGate() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  React.useEffect(() => {
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "super_admin") navigate({ to: "/" });
  }, [user, navigate]);
  return user;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  useAdminGate();
  const { collapsed, toggle } = useSidebar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <TopProgress active={isNavigating} />
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <Topbar onToggleSidebar={toggle} />
        <main key={pathname} className="min-w-0 flex-1 animate-fade-in-soft">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8 ${className}`}>{children}</div>;
}
