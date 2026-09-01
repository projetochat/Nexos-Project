import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, Users, Shield, Clock, Plug, SlidersHorizontal, ListPlus } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes")({
  component: ConfiguracoesLayout,
});

const TABS = [
  { to: "/configuracoes/geral", label: "Geral", icon: SlidersHorizontal },
  { to: "/configuracoes/empresa", label: "Empresa", icon: Building2 },
  { to: "/configuracoes/usuarios", label: "Usuários", icon: Users },
  { to: "/configuracoes/permissoes", label: "Permissões", icon: Shield },
  { to: "/configuracoes/horarios", label: "Horários", icon: Clock },
  { to: "/configuracoes/integracoes", label: "Integrações", icon: Plug },
  { to: "/configuracoes/campos-contato", label: "Campos Adicionais", icon: ListPlus },
] as const;

function ConfiguracoesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell>
      <PageContainer className="max-w-[96rem] lg:px-6 xl:px-8">
        <SectionHeader
          title="Configurações"
          subtitle="Ajustes gerais da sua conta e da operação."
        />

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside>
            <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-1 p-1 lg:flex-col lg:overflow-visible lg:p-2">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active =
                  pathname === t.to ||
                  (pathname === "/configuracoes" && t.to === "/configuracoes/empresa");
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-surface-2 text-foreground"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{t.label}</span>
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
