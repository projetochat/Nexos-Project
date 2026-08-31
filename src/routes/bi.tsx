import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Activity, MessageSquare, TrendingUp, Users } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ReportFiltersBar } from "@/components/report-filters";
import { Badge, Card, KPI, SectionHeader } from "@/components/ui-kit";
import { num } from "@/lib/format";
import { operationsApi } from "@/lib/nexos-api";
import {
  DEFAULT_OPERATIONAL_FILTERS,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { onRealtimeEvent } from "@/lib/realtime/client";

export const Route = createFileRoute("/bi")({
  head: () => ({ meta: [{ title: "BI - Nexo" }] }),
  component: Page,
});

const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#16a34a", "#dc2626"];

function Page() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<OperationalReportFilters>({
    ...DEFAULT_OPERATIONAL_FILTERS,
    period: "today",
  });
  const { data } = useQuery({
    queryKey: ["operations", "bi", filters],
    queryFn: () => operationsApi.dashboard(filters),
    refetchInterval: 30_000,
  });
  const kpis = data?.kpis ?? {};

  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("message.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: ["operations", "bi"] });
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

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="BI"
          subtitle="Visão analítica da operação com indicadores, canais e produtividade."
        />

        <ReportFiltersBar
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KPI label="Conversas abertas" value={num(kpiValue(kpis.conversasAbertas))} tone="info" />
          <KPI
            label="Em atendimento"
            value={num(kpiValue(kpis.conversasEmAtendimento))}
            tone="info"
          />
          <KPI label="Novos leads" value={num(kpiValue(kpis.novosLeads))} tone="success" />
          <KPI label="Encerradas" value={num(kpiValue(kpis.conversasEncerradas))} tone="success" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <BiChart title="Status das conversas" data={statusSerie} />
          <BiChart title="Conversas por departamento" data={data?.charts.byDepartment ?? []} />
          <BiChart title="Produtividade por atendente" data={data?.charts.byAgent ?? []} />
          <BiChart title="Volume por instância" data={data?.charts.byConnection ?? []} />
        </div>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Resumo executivo</p>
              <p className="text-xs text-muted-foreground">
                Indicadores calculados em tempo real conforme os filtros selecionados.
              </p>
            </div>
            <Badge tone="success">
              <TrendingUp className="h-3 w-3" /> realtime
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Insight
              icon={<MessageSquare className="h-4 w-4" />}
              label="Mensagens recebidas"
              value={kpiValue(kpis.mensagensRecebidas)}
            />
            <Insight
              icon={<Activity className="h-4 w-4" />}
              label="Mensagens enviadas"
              value={kpiValue(kpis.mensagensEnviadas)}
            />
            <Insight
              icon={<Users className="h-4 w-4" />}
              label="Clientes ativos"
              value={kpiValue(kpis.clientesAtivos)}
            />
          </div>
        </Card>
      </PageContainer>
    </AppShell>
  );
}

function BiChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ nome: string; cor?: string; total: number }>;
}) {
  return (
    <Card>
      <p className="mb-4 text-sm font-semibold">{title}</p>
      {data.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
          Sem dados para o filtro atual.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
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
              {data.map((item, index) => (
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
  );
}

function Insight({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold">{num(value)}</p>
    </div>
  );
}

function kpiValue(kpi: { value?: number | null } | number | null | undefined) {
  if (typeof kpi === "number") return kpi;
  return kpi?.value ?? 0;
}
