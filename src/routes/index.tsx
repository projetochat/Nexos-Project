import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Clock, MessageSquare, TrendingUp, Users } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ReportFiltersBar } from "@/components/report-filters";
import { Badge, Card, KPI, SectionHeader } from "@/components/ui-kit";
import { num, relativeTime } from "@/lib/format";
import { operationsApi } from "@/lib/nexos-api";
import {
  DEFAULT_OPERATIONAL_FILTERS,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { onRealtimeEvent } from "@/lib/realtime/client";

export const Route = createFileRoute("/")({ component: Dashboard });

const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#16a34a", "#dc2626"];

function Dashboard() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<OperationalReportFilters>({
    ...DEFAULT_OPERATIONAL_FILTERS,
    period: "today",
  });
  const query = useQuery({
    queryKey: ["operations", "dashboard", filters],
    queryFn: () => operationsApi.dashboard(filters),
    refetchInterval: 30_000,
  });
  const data = query.data;
  const kpis = data?.kpis ?? {};

  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("message.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: ["operations", "dashboard"] });
        }
      }),
    [queryClient],
  );

  const statusSerie = [
    { nome: "Abertas", total: kpiValue(kpis.conversasAbertas) },
    { nome: "Em atendimento", total: kpiValue(kpis.conversasEmAtendimento) },
    { nome: "Aguardando", total: kpiValue(kpis.conversasAguardando) },
    { nome: "Encerradas", total: kpiValue(kpis.conversasEncerradas) },
  ];
  const recent = data?.recent ?? [];

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Dashboard"
          subtitle="Panorama operacional com metricas consolidadas do banco Nexos."
        />

        <ReportFiltersBar
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />

        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KPI label="Conversas abertas" value={num(kpiValue(kpis.conversasAbertas))} tone="info" />
          <KPI
            label="Em atendimento"
            value={num(kpiValue(kpis.conversasEmAtendimento))}
            tone="info"
          />
          <KPI label="Aguardando" value={num(kpiValue(kpis.conversasAguardando))} tone="warning" />
          <KPI label="Novos leads" value={num(kpiValue(kpis.novosLeads))} tone="info" />
          <KPI label="Encerradas" value={num(kpiValue(kpis.conversasEncerradas))} tone="success" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Conversas por departamento
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Periodo: {formatDate(data?.range.start)} a {formatDate(data?.range.end)}
                </p>
              </div>
              <Badge tone="success">
                <TrendingUp className="h-3 w-3" /> realtime
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.charts.byDepartment ?? []}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {(data?.charts.byDepartment ?? []).map((item, index) => (
                    <Cell
                      key={`${item.nome}-${index}`}
                      fill={item.cor || COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
              Distribuicao por status
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusSerie}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-4">
          <Snapshot
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Mensagens recebidas"
            value={kpiValue(kpis.mensagensRecebidas)}
          />
          <Snapshot
            icon={<Users className="h-3.5 w-3.5" />}
            label="Clientes ativos"
            value={kpiValue(kpis.clientesAtivos)}
          />
          <Snapshot
            icon={<Clock className="h-3.5 w-3.5" />}
            label="1a resposta media"
            value={formatMinutes(kpis.tempoMedioPrimeiraRespostaMin?.value)}
          />
          <Snapshot
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="SLA operacional"
            value={`${kpiValue(kpis.sla)}%`}
          />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {[
            { title: "Conversas por cliente", data: data?.charts.byCustomer ?? [] },
            { title: "Conversas por instancia", data: data?.charts.byConnection ?? [] },
            { title: "Conversas por atendente", data: data?.charts.byAgent ?? [] },
          ].map((chart) => (
            <Card key={chart.title}>
              <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
                {chart.title}
              </p>
              {chart.data.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                  Sem dados para o periodo.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chart.data}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="nome" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {chart.data.map((item, index) => (
                        <Cell
                          key={`${item.nome}-${index}`}
                          fill={item.cor || COLORS[index % COLORS.length]}
                        />
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
            <p className="text-xs text-muted-foreground">Ultimas conversas movimentadas.</p>
          </div>
          <ul className="divide-y divide-border">
            {recent.map((conversation) => (
              <li key={conversation.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 truncate">
                  <Link
                    to="/inbox/$conversationId"
                    params={{ conversationId: conversation.id }}
                    className="font-medium hover:underline"
                  >
                    {conversation.contact?.nome ?? "Contato"}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {conversation.protocolo ? `#${conversation.protocolo}` : conversation.status}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  ha {relativeTime(new Date(conversation.last_message_at).getTime())}
                </span>
              </li>
            ))}
            {!query.isLoading && recent.length === 0 && (
              <li className="px-5 py-6 text-center text-xs text-muted-foreground">
                Nenhuma atividade operacional encontrada.
              </li>
            )}
          </ul>
        </Card>
      </PageContainer>
    </AppShell>
  );
}

function Snapshot({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function kpiValue(kpi: { value: number | null } | undefined) {
  return kpi?.value ?? 0;
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "sem amostra";
  return `${num(value)} min`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}
