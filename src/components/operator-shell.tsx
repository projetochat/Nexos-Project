import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Inbox,
  Users,
  Star,
  Clock,
  Search,
  Bell,
  User,
  LogOut,
  Headphones,
  MessageCircleMore,
} from "lucide-react";
import { LogoMark, Avatar } from "./ui-kit";
import { ConnectionPill, OfflineBanner, TopProgress } from "./feedback";
import { useConnectionStatus } from "@/lib/realtime";
import { useSession, ROLE_META } from "@/lib/session";
import { ThemeToggle } from "./app-shell";

/* ============================================================
   Nexo · Operator Shell (Central de Atendimento)
   Interface minimalista dedicada ao operador. Sem administração.
   ============================================================ */

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const nav: NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/atendimento/favoritos", label: "Favoritos", icon: Star },
  { to: "/atendimento/historico", label: "Histórico", icon: Clock },
  { to: "/atendimento/clientes", label: "Clientes", icon: Users },
  { to: "/atendimento/perfil", label: "Perfil", icon: User },
];

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
        <span className="relative">
          <Avatar name={user?.nome ?? "?"} size={26} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
        </span>
        <span className="hidden text-sm font-medium sm:inline">
          {user?.nome?.split(" ")[0] ?? "Operador"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 origin-top-right animate-scale-in rounded-xl border border-border bg-popover p-1.5 shadow-elevated">
          <div className="border-b border-border px-3 py-2.5">
            <div className="text-sm font-medium">{user?.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
              Online · {user ? ROLE_META[user.role].label : ""}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const conn = useConnectionStatus();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl md:gap-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark size={22} />
        <div className="hidden min-w-0 md:block">
          <div className="text-sm font-semibold tracking-tight">Nexo</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Central de Atendimento
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ConnectionPill status={conn} />
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 md:flex md:w-64">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar conversa ou cliente…"
          />
        </div>
        <ThemeToggle />
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary animate-pulse-ring" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function RailNav() {
  return (
    <aside className="hidden shrink-0 flex-col items-center gap-1.5 border-r border-border bg-surface-1 py-4 md:flex md:w-16">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            title={item.label}
            className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-primary"
          >
            <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary opacity-0 group-data-[status=active]:opacity-100" />
            <Icon className="h-5 w-5" />
            {item.badge && (
              <span className="absolute -right-0 -top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-surface-1">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </aside>
  );
}

function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground transition data-[status=active]:text-primary"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function useOperatorGate() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  React.useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);
  return user;
}

export function OperatorShell({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  useOperatorGate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  return (
    <div className={`flex ${full ? "h-dvh overflow-hidden" : "min-h-dvh"} bg-background text-foreground`}>
      <TopProgress active={isNavigating} />
      <RailNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <Topbar />
        <main key={pathname} className={`min-w-0 flex-1 animate-fade-in-soft ${full ? "overflow-hidden" : ""}`}>
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

export function OperatorContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 ${className}`}>{children}</div>;
}
