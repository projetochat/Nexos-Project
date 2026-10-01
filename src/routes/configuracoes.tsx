import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CreditCard,
  ListPlus,
  Braces,
  Plug,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader } from "@/components/ui-kit";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/configuracoes")({
  component: ConfiguracoesLayout,
});

const TABS = [
  { to: "/configuracoes/empresa", label: "Empresa", icon: Building2 },
  { to: "/configuracoes/financeiro", label: "Financeiro", icon: CreditCard },
  { to: "/configuracoes/geral", label: "Filas do Chat", icon: SlidersHorizontal },
  { to: "/configuracoes/permissoes", label: "Permissões", icon: Shield },
  { to: "/configuracoes/integracoes", label: "Integrações", icon: Plug },
  { to: "/configuracoes/campos-contato", label: "Campos Adicionais", icon: ListPlus },
  { to: "/configuracoes/variaveis", label: "Variáveis", icon: Braces },
] as const;

function ConfiguracoesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const permissions = useSession((state) => state.user?.permissions ?? []);
  return (
    <AppShell>
      <PageContainer className="overflow-x-hidden">
        <SectionHeader title="Configurações" />

        <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
          <aside>
            <nav className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-1 p-1 sm:grid-cols-3 lg:flex lg:flex-col lg:p-2">
              {TABS.map((t) => {
                if (
                  (t.to === "/configuracoes/campos-contato" ||
                    t.to === "/configuracoes/variaveis") &&
                  !permissions.includes("contacts.read")
                ) {
                  return null;
                }
                const Icon = t.icon;
                const active =
                  pathname === t.to ||
                  (pathname === "/configuracoes" && t.to === "/configuracoes/empresa");
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition sm:text-sm lg:px-3 ${
                      active
                        ? "bg-surface-2 text-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{t.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}
