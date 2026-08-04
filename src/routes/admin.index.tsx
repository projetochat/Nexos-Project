import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  CreditCard,
  MessageSquareText,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, SectionHeader } from "@/components/ui-kit";
import { platformApi, type PlatformDashboard } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard · Nexo Admin" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data, error } = usePlatformDashboard();

  return (
    <AdminContainer>
      <SectionHeader
        title="Plano de controle SaaS"
        subtitle="Métricas reais da Nexos API. Cobrança manual, sem gateway integrado."
      />

      {error && <Card className="border-destructive/40 text-sm text-destructive">{error}</Card>}
      {!data && !error && (
        <Card className="text-sm text-muted-foreground">Carregando dados da plataforma...</Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Tenants ativos"
              value={data.activeTenants}
              icon={Building2}
              tone="success"
            />
            <Kpi label="Tenants trial" value={data.trialTenants} icon={Activity} tone="info" />
            <Kpi
              label="Suspensos"
              value={data.suspendedTenants}
              icon={ShieldAlert}
              tone="warning"
            />
            <Kpi label="Usuários ativos" value={data.activeUsers} icon={Users} />
            <Kpi label="Connections ativas" value={data.activeConnections} icon={Phone} />
            <Kpi
              label="Mensagens no período"
              value={data.messagesThisPeriod}
              icon={MessageSquareText}
            />
            <Kpi label="Campanhas no período" value={data.campaignsThisPeriod} icon={Activity} />
            <Kpi
              label="Faturas abertas"
              value={data.openInvoices + data.overdueInvoices}
              icon={CreditCard}
              tone="warning"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h3 className="text-sm font-semibold">Assinaturas por plano</h3>
              <div className="mt-4 divide-y divide-border">
                {data.subscriptionsByPlan.map((plan) => (
                  <div key={plan.planId} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.code}</div>
                    </div>
                    <Badge tone="brand">{plan.subscriptions} assinaturas</Badge>
                  </div>
                ))}
                {!data.subscriptionsByPlan.length && (
                  <div className="py-8 text-sm text-muted-foreground">
                    Nenhum plano ativo encontrado.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold">Operação</h3>
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Tickets abertos" value={data.openTickets} />
                <Row label="Faturas abertas" value={data.openInvoices} />
                <Row label="Faturas vencidas" value={data.overdueInvoices} />
              </div>
              <Link to="/admin/empresas" className="mt-5 inline-flex text-sm text-primary">
                Ver tenants
              </Link>
            </Card>
          </div>
        </>
      )}
    </AdminContainer>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "info";
}) {
  const tones = {
    default: "bg-surface-2 text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold">
            {value.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function usePlatformDashboard() {
  const [data, setData] = React.useState<PlatformDashboard | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    platformApi
      .dashboard()
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);
  return { data, error };
}
