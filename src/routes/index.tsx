import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Users, Clock, CheckCircle2, TrendingUp, PlayCircle } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, KPI, Badge, Button } from "@/components/ui-kit";
import { ReportFiltersBar } from "@/components/report-filters";
import { REPORTS, DEFAULT_REPORT_FILTERS, type ReportFilters } from "@/lib/mvp";
import { supabase } from "@/integrations/supabase/client";
import { num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Dashboard });

const COLORS = ["#6366f1", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];

function Dashboard() {
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState<ReportFilters>(DEFAULT_REPORT_FILTERS);
  const { data } = useQuery({
    queryKey: ["mvp", "overview", filters],
    queryFn: () => REPORTS.overview(filters),
    refetchInterval: 30_000,
  });
  const kpis = data?.kpis;
  const byDept = data?.byDepartment ?? [];
  const byCustomer = data?.byCustomer ?? [];
  const byInstancia = data?.byInstancia ?? [];
  const byTag = data?.byTag ?? [];
  const convs = data?.convs ?? [];

  React.useEffect(() => {
    const ch = supabase
      .channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["mvp", "overview"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["mvp", "overview"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);


  const statusSerie = [
    { status: "Aberta", total: kpis?.abertas ?? 0 },
    { status: "Em andamento", total: kpis?.emAndamento ?? 0 },
    { status: "Aguardando", total: kpis?.aguardando ?? 0 },
    { status: "Fechada", total: kpis?.fechadas ?? 0 },
  ];

  // Volume nas últimas 12h (mensagens novas por hora, aproximação com dados reais)
  const volumeSerie = React.useMemo(() => {
    const now = Date.now();
    const buckets = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 3_600_000);
      buckets.set(`${d.getHours().toString().padStart(2, "0")}h`, 0);
    }
    for (const c of convs) {
      const t = new Date(c.last_message_at).getTime();
      if (now - t > 12 * 3_600_000) continue;
      const d = new Date(t);
      const k = `${d.getHours().toString().padStart(2, "0")}h`;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets, ([hora, conversas]) => ({ hora, conversas }));
  }, [convs]);

  const recentes = [...convs].slice(0, 6);
  const semDados = (kpis?.totalMensagens ?? 0) === 0;

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Dashboard"
          subtitle="Panorama operacional em tempo real."
          actions={
            <Link to="/simulador">
              <Button variant="secondary" size="sm">
                <PlayCircle className="h-3.5 w-3.5" /> Simulador
              </Button>
            </Link>
          }
        />

        <ReportFiltersBar value={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} />


        {semDados && (
          <Card className="mb-6 border-primary/40 bg-primary/5">
            <p className="text-sm font-medium">Bem-vindo(a) ao Nexo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ainda não há dados na sua operação. Abra o{" "}
              <Link to="/simulador" className="text-primary hover:underline">
                Simulador de Cliente
              </Link>{" "}
              e envie mensagens fictícias para popular a inbox.
            </p>
          </Card>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KPI label="Conversas ativas" value={num(kpis?.ativas ?? 0)} tone="info" />
          <KPI label="Stand By" value={num(kpis?.standby ?? 0)} tone="warning" />
          <KPI label="Fila" value={num(kpis?.fila ?? 0)} tone="warning" />
          <KPI label="Leads" value={num(kpis?.leads ?? 0)} tone="info" />
          <KPI label="Fechadas" value={num(kpis?.fechadas ?? 0)} tone="success" />
        </div>


        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Últimas 12h</p>
                <p className="mt-1 font-mono text-2xl font-semibold">{num(kpis?.totalMensagens ?? 0)}</p>
                <p className="text-[11px] text-muted-foreground">mensagens totais</p>
              </div>
              <Badge tone="success">
                <TrendingUp className="h-3 w-3" /> ao vivo
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={volumeSerie}>
                <defs>
                  <linearGradient id="fillMsg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hora" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="conversas" stroke="#6366f1" strokeWidth={2} fill="url(#fillMsg)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Distribuição por status</p>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusSerie} dataKey="total" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusSerie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">Conversas por departamento</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDept}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {byDept.map((d, i) => (
                    <Cell key={i} fill={d.cor || COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">Snapshot</p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" /> Mensagens totais
                </span>
                <span className="font-mono">{num(kpis?.totalMensagens ?? 0)}</span>
              </li>
              <li className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Aguardando
                </span>
                <span className="font-mono">{kpis?.aguardando ?? 0}</span>
              </li>
              <li className="flex items-center justify-between border-b border-border pb-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Em andamento
                </span>
                <span className="font-mono">{kpis?.emAndamento ?? 0}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Fechadas
                </span>
                <span className="font-mono">{kpis?.fechadas ?? 0}</span>
              </li>
            </ul>
          </Card>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {[
            { title: "Conversas por cliente", data: byCustomer },
            { title: "Conversas por instância", data: byInstancia },
            { title: "Conversas por etiqueta", data: byTag },
          ].map((chart) => (
            <Card key={chart.title}>
              <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">{chart.title}</p>
              {chart.data.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                  Sem dados para o período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chart.data}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {chart.data.map((d, i) => (
                        <Cell key={i} fill={d.cor || COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-0">

          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-semibold">Atividade recente</p>
            <p className="text-xs text-muted-foreground">Últimas conversas movimentadas.</p>
          </div>
          <ul className="divide-y divide-border">
            {recentes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="flex-1 truncate">
                  <Link to="/inbox/$conversationId" params={{ conversationId: c.id }} className="font-medium hover:underline">
                    {c.contact?.nome ?? "Contato"}
                  </Link>
                  <span className="ml-2 text-muted-foreground">· {c.status.replace("_", " ")}</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  há {relativeTime(new Date(c.last_message_at).getTime())}
                </span>
              </li>
            ))}
            {recentes.length === 0 && (
              <li className="px-5 py-6 text-center text-xs text-muted-foreground">Sem atividade ainda.</li>
            )}
          </ul>
        </Card>
      </PageContainer>
    </AppShell>
  );
}
