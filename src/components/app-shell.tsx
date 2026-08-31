import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Tag,
  Megaphone,
  BarChart3,
  Settings,
  LifeBuoy,
  Search,
  Bell,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Zap,
  Bot,
  Workflow,
  Sparkles,
  ListChecks,
  CheckCircle2,
  History,
  Ticket,
  Headset,
  MessagesSquare,
  ShieldCheck,
  UsersRound,
  Wifi,
} from "lucide-react";
import { LogoMark, Avatar, Badge } from "./ui-kit";
import { ConnectionPill, OfflineBanner, TopProgress } from "./feedback";
import { useConnectionStatus } from "@/lib/realtime";
import { useTheme } from "./theme-provider";
import { useSession, ROLE_META, signOut } from "@/lib/session";
import { notificationApi, stopStoredPlatformImpersonation } from "@/lib/nexos-api";
import { onRealtimeEvent } from "@/lib/realtime/client";

/* ============================================================
   Nexo · App Shell (Painel Administrativo da Empresa)
   Sidebar refinada: rail colapsado 56px, tooltips, trigger no
   topbar, persistência em localStorage. Theme toggle, user menu.
   ============================================================ */

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

// Rotas permitidas ao Atendente (operador) — sem administração.
const OPERATOR_ALLOWED = new Set<string>([
  "/",
  "/inbox",
  "/contatos",
  "/mensagens-rapidas",
  "/historico",
  "/perfil",
  "/ajuda",
]);

// Filtra itens de navegação para o papel operador.
function filterForOperator(items: NavItem[]): NavItem[] {
  return items.filter((i) => OPERATOR_ALLOWED.has(i.to));
}

const principalNav: NavItem[] = [
  { to: "/inbox", label: "Chat", icon: MessagesSquare },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/historico", label: "Histórico de Conversas", icon: History },
  { to: "/mensagens-rapidas", label: "Mensagens Rápidas", icon: Zap },
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
];

// Itens exibidos no topo da sidebar (sem agrupador) para administradores.
const topNav: NavItem[] = [];

// Agrupamento exibido apenas para administradores.
const adminGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Dashboard",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/filas", label: "Filas de atendimento", icon: ListChecks },
      { to: "/bi", label: "BI", icon: BarChart3 },
    ],
  },
  {
    title: "Operação",
    items: [
      { to: "/inbox", label: "Chat", icon: MessagesSquare },
      { to: "/contatos", label: "Contatos", icon: Users },
      { to: "/historico", label: "Histórico de Conversas", icon: History },
    ],
  },
  {
    title: "Administração",
    items: [
      { to: "/atendentes", label: "Atendentes", icon: Headset },
      { to: "/perfis", label: "Perfil de Acesso", icon: ShieldCheck },
      { to: "/departamentos", label: "Departamentos", icon: UsersRound },
      { to: "/etiquetas", label: "Etiquetas", icon: Tag },
      { to: "/mensagens-rapidas", label: "Mensagens Rápidas", icon: Zap },
      { to: "/campanhas", label: "Campanhas", icon: Megaphone },
    ],
  },
  {
    title: "Canais",
    items: [
      { to: "/instancias", label: "Instâncias", icon: Wifi },
      { to: "/chatbot", label: "Fluxo de Bot", icon: Bot },
      { to: "/automacoes", label: "Automações", icon: Workflow },
      { to: "/agente-ia", label: "Agente de IA", icon: Sparkles },
    ],
  },
  {
    title: "Chamados",
    items: [{ to: "/chamados", label: "Chamados", icon: Ticket }],
  },
];

const NAV_PERMISSIONS: Record<string, string[]> = {
  "/inbox": ["conversations.read", "messages.send"],
  "/clientes": ["crm.read", "crm.manage"],
  "/contatos": ["chat.contacts.read", "crm.read"],
  "/historico": ["conversations.read"],
  "/atendentes": ["users.read", "users.manage"],
  "/perfis": ["roles.read", "roles.manage"],
  "/departamentos": ["departments.read", "departments.manage"],
  "/etiquetas": ["chat.tags.use", "chat.tags.manage"],
  "/mensagens-rapidas": ["chat.quick_replies.read", "chat.quick_replies.manage"],
  "/campanhas": ["campaigns.read", "campaigns.manage"],
  "/filas": ["conversations.manage"],
  "/bi": ["crm.read", "conversations.read", "campaigns.read", "tickets.read"],
  "/instancias": ["connections.read", "connections.manage"],
  "/chatbot": ["automations.read", "automations.manage"],
  "/automacoes": ["automations.read", "automations.manage"],
  "/agente-ia": ["automations.read", "automations.manage"],
  "/chamados": ["tickets.read", "tickets.create", "tickets.manage"],
  "/relatorios": ["crm.read", "conversations.read", "campaigns.read", "tickets.read"],
};

function canSeeNavItem(item: NavItem, permissions?: string[]) {
  const required = NAV_PERMISSIONS[item.to];
  if (!required || !permissions?.length) return true;
  const granted = new Set(permissions);
  return required.some((permission) => granted.has(permission));
}

function filterAdminGroupsByPermissions(
  groups: { title: string; items: NavItem[] }[],
  permissions?: string[],
) {
  if (!permissions?.length) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNavItem(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

const sistemaNav: NavItem[] = [
  { to: "/configuracoes", label: "Configurações", icon: Settings },
  { to: "/ajuda", label: "Central de Ajuda", icon: LifeBuoy },
];

/* ---------- Breadcrumb labels ---------- */
const LABELS: Record<string, string> = {
  "": "Dashboard",
  inbox: "Inbox",
  clientes: "Clientes",
  contatos: "Contatos",
  empresas: "Empresas",
  atendentes: "Atendentes",
  departamentos: "Departamentos",
  etiquetas: "Etiquetas",
  campanhas: "Campanhas",
  historico: "Histórico de Conversas",
  "mensagens-rapidas": "Mensagens Rápidas",
  relatorios: "Relatórios",
  bi: "BI",
  configuracoes: "Configurações",
  perfil: "Perfil",
  perfis: "Perfil de Acesso",
  instancias: "Instâncias",
  ajuda: "Central de Ajuda",
  filas: "Filas de atendimento",

  chatbot: "Fluxo de Bot",
  automacoes: "Automações",
  empresa: "Empresa",
  usuarios: "Usuários",
  permissoes: "Permissões",
  horarios: "Horários",
  mensagens: "Mensagens automáticas",
  integracoes: "Integrações",
  seguranca: "Segurança",
  chamados: "Chamados",
};

function useBreadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = [{ href: "/", label: "Nexo" }];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    crumbs.push({ href: acc, label: LABELS[part] ?? decodeURIComponent(part) });
  }
  return crumbs;
}

/* ---------- Sidebar state ---------- */
const SIDEBAR_KEY = "nexo.sidebar.collapsed";
const SidebarCollapseContext = React.createContext<() => void>(() => {});
let sidebarCollapsedMemory: boolean | undefined;
function useSidebarState() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useSession((s) => s.user?.role);
  const isOperator = role === "operator";
  const isInbox = pathname.startsWith("/inbox");
  const [collapsed, setCollapsed] = React.useState(() => {
    if (sidebarCollapsedMemory !== undefined) return sidebarCollapsedMemory;
    if (
      typeof document !== "undefined" &&
      document.documentElement.dataset.sidebarCollapsed === "1"
    )
      return true;
    if (isInbox && isOperator) {
      sidebarCollapsedMemory = true;
      if (typeof document !== "undefined") document.documentElement.dataset.sidebarCollapsed = "1";
      return true;
    }
    return false;
  });
  const lastInboxRef = React.useRef(isInbox);
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") {
        sidebarCollapsedMemory = true;
        document.documentElement.dataset.sidebarCollapsed = "1";
        setCollapsed(true);
      }
    } catch {
      // localStorage may be unavailable in restricted browser contexts.
    }
  }, []);
  // Auto-recolher ao entrar em /inbox (apenas atendentes)
  React.useEffect(() => {
    if (isInbox && !lastInboxRef.current && isOperator) {
      sidebarCollapsedMemory = true;
      document.documentElement.dataset.sidebarCollapsed = "1";
      setCollapsed(true);
    }
    lastInboxRef.current = isInbox;
  }, [isInbox, isOperator]);
  const persist = React.useCallback((next: boolean) => {
    sidebarCollapsedMemory = next;
    document.documentElement.dataset.sidebarCollapsed = next ? "1" : "0";
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      // Keep the in-memory state even when persistence is unavailable.
    }
  }, []);
  const toggle = React.useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      persist(next);
      return next;
    });
  }, [persist]);
  const collapse = React.useCallback(() => {
    setCollapsed((v) => {
      if (v) return v;
      persist(true);
      return true;
    });
  }, [persist]);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return { collapsed, toggle, collapse };
}

/* ---------- Sidebar item ---------- */
function NavLink({
  item,
  collapsed,
  exact,
}: {
  item: NavItem;
  collapsed: boolean;
  exact?: boolean;
}) {
  const Icon = item.icon;
  const collapse = React.useContext(SidebarCollapseContext);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useSession((s) => s.user?.role);
  const isOperator = role === "operator";
  const isActive =
    (exact ?? item.to === "/")
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(item.to + "/");
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: exact ?? item.to === "/" }}
      title={collapsed ? item.label : undefined}
      onClick={() => {
        // Auto-recolher apenas para operadores; administradores mantêm a sidebar aberta.
        if (!isOperator || collapsed || isActive) return;
        requestAnimationFrame(() => requestAnimationFrame(() => collapse()));
      }}
      className={`group relative flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground ${
        collapsed ? "h-9 w-9 justify-center" : "gap-3 pl-7 pr-3 py-2"
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary opacity-0 transition-opacity group-data-[status=active]:opacity-100 ${
          collapsed ? "-left-2" : ""
        }`}
      />
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge && (
            <Badge tone="brand" dot={false}>
              {item.badge}
            </Badge>
          )}
        </>
      )}
      {collapsed && item.badge && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
      )}
    </Link>
  );
}

function NavSection({
  title,
  items,
  collapsed,
  flush = false,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  flush?: boolean;
}) {
  return (
    <div
      className={`space-y-0.5 ${collapsed ? "flex flex-col items-center gap-0.5 space-y-0" : ""}`}
    >
      {!collapsed && (
        <p
          className={`mb-1 ${flush ? "pl-2" : "pl-7"} pr-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground`}
        >
          {title}
        </p>
      )}
      {collapsed && <div className="my-2 h-px w-6 bg-border" />}
      {items.map((item) => (
        <NavLink key={item.to} item={item} collapsed={collapsed} />
      ))}
    </div>
  );
}

/* ---------- Sidebar bottom actions ---------- */
function SidebarBottomActions({
  collapsed,
  onToggle,
  toggleOnly = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  toggleOnly?: boolean;
}) {
  const { resolved, toggle: toggleTheme } = useTheme();
  return (
    <div
      className={`flex ${
        collapsed ? "flex-col items-center gap-1" : "flex-row items-center justify-around gap-1"
      }`}
    >
      {!toggleOnly && (
        <>
          <NotificationsButton compact />
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            aria-label="Alternar tema"
            title={`Trocar para tema ${resolved === "dark" ? "claro" : "escuro"}`}
          >
            {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </>
      )}
      <button
        onClick={onToggle}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        aria-label="Alternar sidebar"
        title="Recolher/expandir sidebar (⌘\\)"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ---------- Sidebar user card ---------- */
function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? user?.nome : undefined}
        className={`flex w-full items-center rounded-lg border border-border bg-surface-1 transition hover:bg-surface-2 ${
          collapsed ? "h-9 w-9 justify-center p-0" : "gap-2 px-2 py-1.5"
        }`}
      >
        <Avatar name={user?.nome ?? "?"} src={user?.avatarUrl} size={26} />
        {!collapsed && (
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-medium">{user?.nome ?? "Convidado"}</div>
            <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
          </div>
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}
          className="z-[100] w-64 origin-bottom-left animate-scale-in rounded-xl border border-border bg-popover p-1.5 shadow-elevated"
        >
          <div className="border-b border-border px-3 py-2.5">
            <div className="text-sm font-medium">{user?.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {user ? ROLE_META[user.role].label : ""}
              {user?.empresaNome && <> · {user.empresaNome}</>}
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/perfil" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <Users className="h-4 w-4" /> Meu perfil
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/configuracoes" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <Settings className="h-4 w-4" /> Configurações
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={async () => {
              await signOut();
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

/* ---------- Sidebar ---------- */
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const role = useSession((s) => s.user?.role);
  const permissions = useSession((s) => s.user?.permissions);
  const isOperator = role === "operator";
  const mainNav = isOperator ? filterForOperator(principalNav) : principalNav;
  const sysNav = isOperator ? filterForOperator(sistemaNav) : sistemaNav;
  const visibleTopNav = topNav.filter((item) => canSeeNavItem(item, permissions));
  const visibleAdminGroups = filterAdminGroupsByPermissions(adminGroups, permissions);
  return (
    <aside
      className={`hidden shrink-0 border-r border-border bg-surface-1 transition-[width] duration-200 ease-out lg:flex lg:flex-col ${
        collapsed ? "w-14" : "w-64"
      } ${!isOperator ? "sidebar-admin-compact" : ""}`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-border ${
          collapsed ? "justify-center" : "px-4"
        }`}
      >
        <Link to={isOperator ? "/inbox" : "/"} className="flex items-center gap-2">
          <LogoMark size={24} />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Nexo</span>}
        </Link>
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col overflow-x-hidden py-3 ${
          isOperator ? "gap-5 overflow-y-auto" : "gap-0"
        } ${collapsed ? "px-2" : "px-3"} ${
          !isOperator ? (collapsed ? "sidebar-scroll-hover" : "sidebar-scroll overflow-y-auto") : ""
        }`}
      >
        {isOperator ? (
          mainNav.length > 0 && (
            <div
              className={`space-y-0.5 ${collapsed ? "flex flex-col items-center gap-0.5 space-y-0" : ""}`}
            >
              {mainNav.map((item) => (
                <NavLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          )
        ) : (
          <>
            <div
              className={`space-y-0.5 ${collapsed ? "flex flex-col items-center gap-0.5 space-y-0" : ""}`}
            >
              {visibleTopNav.map((item) => (
                <NavLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
            {visibleAdminGroups.map((g) => (
              <NavSection
                key={g.title}
                title={g.title}
                items={g.items}
                collapsed={collapsed}
                flush
              />
            ))}
          </>
        )}
      </nav>
      <div className={`shrink-0 border-t border-border ${collapsed ? "px-2" : "px-3"} py-3`}>
        {sysNav.length > 0 && <NavSection title="Sistema" items={sysNav} collapsed={collapsed} />}
        {isOperator && (
          <div className="mt-3 border-t border-border pt-3">
            <SidebarBottomActions collapsed={collapsed} onToggle={onToggle} toggleOnly={false} />
            <div className="mt-2">
              <SidebarUser collapsed={collapsed} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------- User menu ---------- */
function UserMenu() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1 pr-3 transition hover:bg-surface-2"
      >
        <Avatar name={user?.nome ?? "?"} src={user?.avatarUrl} size={26} />
        <span className="hidden text-sm font-medium sm:inline">
          {user?.nome?.split(" ")[0] ?? "Convidado"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 origin-top-right animate-scale-in rounded-xl border border-border bg-popover p-1.5 shadow-elevated">
          <div className="border-b border-border px-3 py-2.5">
            <div className="text-sm font-medium">{user?.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {user ? ROLE_META[user.role].label : ""}
              {user?.empresaNome && <> · {user.empresaNome}</>}
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/perfil" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <Users className="h-4 w-4" /> Meu perfil
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/configuracoes" });
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-surface-2"
          >
            <Settings className="h-4 w-4" /> Configurações
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={async () => {
              await signOut();
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

/* ---------- Theme toggle ---------- */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
      aria-label="Alternar tema"
      title={`Trocar para tema ${resolved === "dark" ? "claro" : "escuro"}`}
    >
      {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/* ---------- Topbar ---------- */
function Topbar({
  onToggleSidebar,
  onOpenMobileNav,
}: {
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
}) {
  const crumbs = useBreadcrumbs();
  const conn = useConnectionStatus();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl md:gap-3 md:px-6">
      <button
        onClick={onToggleSidebar}
        className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground lg:flex"
        aria-label="Alternar sidebar"
        title="Recolher/expandir sidebar (⌘\)"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>

      <nav
        aria-label="Breadcrumb"
        className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground md:flex"
      >
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={c.href}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
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
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          aria-label="Abrir menu"
          title="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <LogoMark size={22} />
        <span className="truncate text-sm font-semibold">Nexo</span>
      </div>

      <ConnectionPill status={conn} />

      <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring md:flex md:w-64 xl:w-80">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Buscar…"
        />
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </div>

      <ThemeToggle />

      <NotificationsButton />

      <UserMenu />
    </header>
  );
}

function NotificationsButton({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const enabled = !!user?.permissions?.includes("notifications.read");
  const notifications = useQuery({
    queryKey: ["nexos", "notifications", "unread"],
    queryFn: () => notificationApi.list({ status: "UNREAD", pageSize: 10 }),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
  const unread = notifications.data?.unread ?? 0;

  React.useEffect(() => {
    if (!enabled) return;
    return onRealtimeEvent((event) => {
      if (
        event.event.startsWith("message.") ||
        event.event.startsWith("conversation.") ||
        event.event.startsWith("ticket.") ||
        event.event === "notification.created"
      ) {
        qc.invalidateQueries({ queryKey: ["nexos", "notifications"] });
      }
    });
  }, [enabled, qc]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!enabled) return null;

  const markAllRead = async () => {
    await notificationApi.markAllRead();
    await qc.invalidateQueries({ queryKey: ["nexos", "notifications"] });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        aria-label="Notificações"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute z-[120] mt-2 w-80 rounded-xl border border-border bg-popover p-2 shadow-elevated ${
            compact ? "bottom-11 left-0" : "right-0 top-9"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-2 pb-2">
            <p className="text-sm font-semibold">Notificações</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs text-primary disabled:text-muted-foreground"
            >
              Marcar lidas
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {notifications.isLoading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Carregando...</p>
            ) : notifications.data?.items.length ? (
              notifications.data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    await notificationApi.markRead(item.id);
                    await qc.invalidateQueries({ queryKey: ["nexos", "notifications"] });
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-surface-2"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </p>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma notificação nova.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Mobile side nav ---------- */
function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const role = useSession((s) => s.user?.role);
  const permissions = useSession((s) => s.user?.permissions);
  const isOperator = role === "operator";
  const mainNav = isOperator ? filterForOperator(principalNav) : principalNav;
  const sysNav = isOperator ? filterForOperator(sistemaNav) : sistemaNav;
  const visibleTopNav = topNav.filter((item) => canSeeNavItem(item, permissions));
  const visibleAdminGroups = filterAdminGroupsByPermissions(adminGroups, permissions);
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-[190] bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[200] flex w-72 max-w-[86vw] flex-col border-r border-border bg-surface-1 shadow-2xl transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link
            to={isOperator ? "/inbox" : "/"}
            className="flex items-center gap-2"
            onClick={onClose}
          >
            <LogoMark size={24} />
            <span className="text-sm font-semibold tracking-tight">Nexo</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {isOperator ? (
            <div className="space-y-0.5">
              {mainNav.map((item) => (
                <MobileNavLink key={item.to} item={item} onClose={onClose} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {visibleTopNav.length > 0 && (
                <div className="space-y-0.5">
                  {visibleTopNav.map((item) => (
                    <MobileNavLink key={item.to} item={item} onClose={onClose} />
                  ))}
                </div>
              )}
              {visibleAdminGroups.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <p className="mb-1 pl-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.title}
                  </p>
                  {group.items.map((item) => (
                    <MobileNavLink key={item.to} item={item} onClose={onClose} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </nav>
        {sysNav.length > 0 && (
          <div className="shrink-0 border-t border-border px-3 py-3">
            <p className="mb-1 pl-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Sistema
            </p>
            <div className="space-y-0.5">
              {sysNav.map((item) => (
                <MobileNavLink key={item.to} item={item} onClose={onClose} />
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function MobileNavLink({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/" }}
      onClick={onClose}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <Badge tone="brand" dot={false}>
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

/* ---------- Auth gate (redirects by role) ---------- */
function useAuthGate(expected: "app" | "admin" | "operator") {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  React.useEffect(() => {
    if (!hydrated) return; // aguarda hidratação da sessão para não redirecionar em F5
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (expected === "app" && user.role === "super_admin") {
      navigate({ to: "/admin" });
      return;
    }
    if (expected === "app" && user.role === "operator") {
      // Atendente só acessa rotas permitidas — caso contrário, volta para o Inbox.
      const allowed =
        pathname.startsWith("/inbox") ||
        [...OPERATOR_ALLOWED].some((p) => pathname === p || pathname.startsWith(p + "/"));
      if (!allowed) navigate({ to: "/inbox" });
    }
  }, [user, hydrated, expected, navigate, pathname]);
  return user;
}

/* ---------- Impersonation banner ---------- */
function ImpersonationBanner() {
  const imp = useSession((s) => s.impersonating);
  const stop = useSession((s) => s.stopImpersonation);
  const loginAs = useSession((s) => s.loginAs);
  const navigate = useNavigate();
  const expired = imp ? new Date(imp.expiresAt).getTime() <= Date.now() : false;
  React.useEffect(() => {
    if (!imp) return;
    const delay = Math.max(0, new Date(imp.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(async () => {
      const restored = await stopStoredPlatformImpersonation();
      if (restored) loginAs(restored);
      stop();
      navigate({ to: "/admin" });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [imp, loginAs, navigate, stop]);
  if (!imp) return null;
  return (
    <div className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning-foreground md:px-6">
      <Zap className="h-4 w-4 text-warning" />
      <span className="flex-1">
        Você está acessando o tenant <strong>{imp.empresaNome}</strong> como suporte. Ator real:{" "}
        <strong>{imp.actorEmail}</strong>. Expiração:{" "}
        <strong>{new Date(imp.expiresAt).toLocaleString("pt-BR")}</strong>.
      </span>
      <button
        disabled={expired}
        onClick={async () => {
          const restored = await stopStoredPlatformImpersonation();
          if (restored) loginAs(restored);
          stop();
          navigate({ to: "/admin" });
        }}
        className="rounded-md border border-warning/50 bg-background/40 px-2.5 py-1 text-xs font-medium hover:bg-background/60"
      >
        Encerrar acesso
      </button>
    </div>
  );
}

/* ---------- Shell ---------- */
export function AppShell({ children }: { children: React.ReactNode }) {
  useAuthGate("app");
  const { collapsed, toggle, collapse } = useSidebarState();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const role = useSession((s) => s.user?.role);
  const showTopbar = role !== "operator";
  return (
    <SidebarCollapseContext.Provider value={collapse}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <TopProgress active={isNavigating} />
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ImpersonationBanner />
          <OfflineBanner />
          {showTopbar && (
            <Topbar onToggleSidebar={toggle} onOpenMobileNav={() => setMobileNavOpen(true)} />
          )}
          <main
            key={pathname}
            className="min-w-0 flex-1 overflow-y-auto overscroll-contain animate-fade-in-soft"
          >
            {children}
          </main>
          <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        </div>
      </div>
    </SidebarCollapseContext.Provider>
  );
}

export function AppShellFull({ children }: { children: React.ReactNode }) {
  useAuthGate("app");
  const { collapsed, toggle, collapse } = useSidebarState();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const isNavigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const role = useSession((s) => s.user?.role);
  const showTopbar = role !== "operator";
  return (
    <SidebarCollapseContext.Provider value={collapse}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <TopProgress active={isNavigating} />
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ImpersonationBanner />
          <OfflineBanner />
          {showTopbar && (
            <Topbar onToggleSidebar={toggle} onOpenMobileNav={() => setMobileNavOpen(true)} />
          )}
          <main className="min-w-0 flex-1 overflow-hidden animate-fade-in-soft">{children}</main>
          <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        </div>
      </div>
    </SidebarCollapseContext.Provider>
  );
}

export function PageContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8 ${className}`}
    >
      {children}
    </div>
  );
}

/* Re-exports for admin/operator shells */
export { useAuthGate, useSidebarState, Topbar, MobileNav, ImpersonationBanner, CheckCircle2 };
