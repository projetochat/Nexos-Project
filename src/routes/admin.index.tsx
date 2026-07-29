import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Building2, Users, Phone, TrendingUp, CircleDollarSign, PauseCircle,
  Sparkles, ArrowUpRight, Activity, CreditCard, ShieldAlert, LifeBuoy,
} from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Badge } from "@/components/ui-kit";
import { computeSaasMetrics, mrrHistory, tenants, planos, tickets } from "@/lib/mock/saas";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard · Nexo Admin" }] }),
  component: AdminDashboard,
});

function Kpi({
  label, value, hint, tone = "default", icon: Icon,
}: {
  label: string; value: string; hint?: string;
  tone?: "default" | "success" | "warning" | "info" | "brand";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones: Record<string, string> = {
    default: "bg-surface-2 text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    brand: "bg-primary/15 text-primary",
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function AdminDashboard() {
  const m = computeSaasMetrics();
  const hist = mrrHistory();
  const planosData = planos.map((p) => ({ nome: p.nome, valor: p.assinantes }));
  const statusData = [
    { nome: "Ativas", valor: m.empresasAtivas, cor: "var(--color-success)" },
    { nome: "Trial", valor: m.empresasTrial, cor: "var(--color-info)" },
    { nome: "Inadimplentes", valor: m.empresasInadimplentes, cor: "var(--color-warning)" },
    { nome: "Bloqueadas", valor: m.empresasBloqueadas, cor: "var(--color-destructive)" },
    { nome: "Canceladas", valor: m.empresasCanceladas, cor: "var(--color-muted-foreground)" },
  ];

  return (
    <AdminContainer>
      <SectionHeader
        title="Visão executiva da plataforma"
        subtitle="Métricas de negócio, saúde da operação e alertas em tempo real."
      />

      <div className="grid gap-4 stagger-children sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="MRR" value={formatCurrency(m.mrr)} hint={`+${(m.crescimentoMensal * 100).toFixed(1)}% MoM`} tone="brand" icon={TrendingUp} />
        <Kpi label="ARR projetado" value={formatCurrency(m.arr)} hint="12× MRR corrente" tone="info" icon={CircleDollarSign} />
        <Kpi label="Empresas ativas" value={String(m.empresasAtivas)} hint={`${m.empresasTotal} no total`} tone="success" icon={Building2} />
        <Kpi label="Ticket médio" value={formatCurrency(m.ticketMedio)} hint="ARPU mensal" tone="default" icon={Sparkles} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Operadores" value={String(m.totalOperadores)} hint="Nas empresas contratantes" tone="default" icon={Users} />
        <Kpi label="Números conectados" value={String(m.totalNumeros)} hint="WhatsApp em produção" tone="default" icon={Phone} />
        <Kpi label="Inadimplentes" value={String(m.empresasInadimplentes)} hint="Ação requerida" tone="warning" icon={ShieldAlert} />
        <Kpi label="Churn 90d" value={`${(m.churn * 100).toFixed(1)}%`} hint={`${m.empresasCanceladas} cancelamentos`} tone="warning" icon={PauseCircle} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Receita recorrente (MRR)</h3>
              <p className="text-xs text-muted-foreground">Últimos 12 meses</p>
            </div>
            <Badge tone="success" dot={false}>+{(m.crescimentoMensal * 100).toFixed(1)}%</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hist}>
                <defs>
                  <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Area type="monotone" dataKey="mrr" stroke="var(--color-primary)" strokeWidth={2} fill="url(#mrrFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold">Distribuição por status</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="valor" nameKey="nome" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold">Assinantes por plano</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planosData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="valor" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Últimas empresas</h3>
            <Link to="/admin/empresas" className="text-xs text-primary hover:brightness-125">Ver todas →</Link>
          </div>
          <div className="space-y-2">
            {tenants.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.cidade}</div>
                </div>
                <Badge tone={t.status === "ativa" ? "success" : t.status === "trial" ? "info" : t.status === "inadimplente" ? "warning" : "destructive"}>
                  {t.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Suporte</h3>
          </div>
          <div className="text-2xl font-semibold">{tickets.filter((t) => t.status !== "resolvido").length}</div>
          <p className="mt-1 text-xs text-muted-foreground">Tickets em aberto</p>
          <Link to="/admin/suporte" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:brightness-125">
            Ver fila <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold">Uptime</h3>
          </div>
          <div className="text-2xl font-semibold">99.97%</div>
          <p className="mt-1 text-xs text-muted-foreground">Últimos 30 dias · 3 incidentes</p>
          <Link to="/admin/monitoramento" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:brightness-125">
            Ver monitoramento <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">Cobrança</h3>
          </div>
          <div className="text-2xl font-semibold">{m.empresasInadimplentes}</div>
          <p className="mt-1 text-xs text-muted-foreground">Faturas em atraso</p>
          <Link to="/admin/financeiro" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:brightness-125">
            Ver financeiro <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>
    </AdminContainer>
  );
}
