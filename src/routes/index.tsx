import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pencil, RefreshCw, RotateCcw, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { DashboardFiltersBar } from "@/components/dashboard-filters";
import { Badge, Button, Card, KPI, SectionHeader } from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { num, relativeTime } from "@/lib/format";
import { operationsApi } from "@/lib/nexos-api";
import {
  DEFAULT_OPERATIONAL_FILTERS,
  datesForOperationalPeriod,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { useQueuePrefs, type QueueId } from "@/lib/queue-prefs";
import { useSession } from "@/lib/session";
import { onRealtimeEvent } from "@/lib/realtime/client";

export const Route = createFileRoute("/")({ component: Dashboard });

const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#16a34a", "#dc2626"];
const DASHBOARD_BIS = [
  "counters",
  "messages",
  "distribution",
  "connection",
  "customer",
  "department",
  "tag",
  "agent",
  "recent",
] as const;
type DashboardBiId = (typeof DASHBOARD_BIS)[number];
const BI_LABELS: Record<DashboardBiId, string> = {
  counters: "Contadores de registro",
  messages: "Mensagens do dia",
  distribution: "Distribuição de conversas",
  connection: "Conversas por instância",
  customer: "Conversas por cliente",
  department: "Conversas por departamento",
  tag: "Conversas por etiqueta",
  agent: "Conversas por atendente",
  recent: "Atividade recente",
};

function Dashboard() {
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const canEditDashboard =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.permissions?.includes("dashboard.manage");
  const storageKey = `nexo.dashboard.bis.${user?.id ?? "anonymous"}`;
  const [editingDashboard, setEditingDashboard] = React.useState(false);
  const [visibleBis, setVisibleBis] = React.useState<DashboardBiId[]>(() =>
    loadDashboardBis(storageKey),
  );
  const [draftBis, setDraftBis] = React.useState<DashboardBiId[]>(visibleBis);
  React.useEffect(() => {
    const saved = loadDashboardBis(storageKey);
    setVisibleBis(saved);
    setDraftBis(saved);
  }, [storageKey]);
  const [filters, setFilters] = React.useState<OperationalReportFilters>({
    ...DEFAULT_OPERATIONAL_FILTERS,
    period: "today",
    ...datesForOperationalPeriod("today"),
  });
  const query = useQuery({
    queryKey: ["operations", "dashboard", filters],
    queryFn: () => operationsApi.dashboard(filters),
    refetchInterval: 30_000,
  });
  const data = query.data;
  const kpis = data?.kpis ?? {};
  const queuePrefs = useQueuePrefs();

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
  const queueKpiById: Record<QueueId, keyof typeof kpis> = {
    ativas: "filaAtivas",
    standby: "filaStandby",
    fila: "filaFila",
    leads: "filaLeads",
  };
  const queueCards = queuePrefs
    .filter((queue) => queue.enabled)
    .map((queue) => ({
      id: queue.id,
      label: queue.id === "ativas" ? `Conversas ${queue.label}` : queue.label,
      value: kpiValue(kpis[queueKpiById[queue.id]]),
    }));
  const hasBi = (id: DashboardBiId) => visibleBis.includes(id);

  return (
    <AppShell>
      <PageContainer className="max-w-none">
        <SectionHeader
          title="Dashboard"
          subtitle="Panorama operacional com metricas consolidadas do banco Nexos."
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                title="Atualizar indicadores"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              {canEditDashboard && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraftBis(visibleBis);
                    setEditingDashboard(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar Dashboard
                </Button>
              )}
            </div>
          }
        />

        <DashboardFiltersBar
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />

        <div
          className={`mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5 ${hasBi("counters") ? "" : "hidden"}`}
        >
          {queueCards.map((queue) => (
            <KPI key={queue.id} label={queue.label} value={num(queue.value)} tone="info" />
          ))}
          <KPI label="Fechadas" value={num(kpiValue(kpis.conversasEncerradas))} tone="success" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card className={hasBi("messages") ? "lg:col-span-2" : "hidden"}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Mensagens do dia
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tráfego de mensagens: {formatDate(data?.range.start)} a{" "}
                  {formatDate(data?.range.end)}
                </p>
              </div>
              <Badge tone="success">
                <TrendingUp className="h-3 w-3" /> realtime
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.charts.messagesByHour ?? []}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hora" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="recebidas"
                  name="Recebidas"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="enviadas"
                  name="Enviadas"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className={hasBi("distribution") ? "" : "hidden"}>
            <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
              Distribuição de conversas
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Pie
                  data={statusSerie}
                  dataKey="total"
                  nameKey="nome"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {statusSerie.map((item, index) => (
                    <Cell key={item.nome} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-4">
          {[
            {
              id: "connection",
              title: "Conversas por instancia",
              data: data?.charts.byConnection ?? [],
            },
            { id: "customer", title: "Conversas por cliente", data: data?.charts.byCustomer ?? [] },
            {
              id: "department",
              title: "Conversas por departamento",
              data: data?.charts.byDepartment ?? [],
            },
            {
              id: "tag",
              title: "Conversas por etiqueta",
              data: (data?.charts.byTag ?? []).map((item) => ({
                ...item,
                nome: `${item.nome} (${item.percentual ?? 0}%)`,
              })),
            },
            { id: "agent", title: "Conversas por atendente", data: data?.charts.byAgent ?? [] },
          ]
            .filter((chart) => hasBi(chart.id as DashboardBiId))
            .map((chart) => (
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

        <Card className={hasBi("recent") ? "p-0" : "hidden"}>
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
        <Modal
          open={editingDashboard}
          onClose={() => setEditingDashboard(false)}
          title="Editar Dashboard"
          size="md"
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={() => setDraftBis([...DASHBOARD_BIS])}>
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditingDashboard(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    window.localStorage.setItem(storageKey, JSON.stringify(draftBis));
                    setVisibleBis(draftBis);
                    setEditingDashboard(false);
                    toast.success("Dashboard atualizado.");
                  }}
                >
                  <Save className="h-4 w-4" />
                  Salvar
                </Button>
              </div>
            </div>
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Os filtros são obrigatórios e permanecem sempre visíveis.
          </p>
          <div className="space-y-2">
            {DASHBOARD_BIS.map((id) => (
              <label
                key={id}
                className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"
              >
                <input
                  type="checkbox"
                  checked={draftBis.includes(id)}
                  onChange={(event) =>
                    setDraftBis((current) =>
                      event.target.checked
                        ? [...current, id]
                        : current.filter((item) => item !== id),
                    )
                  }
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-sm font-medium">{BI_LABELS[id]}</span>
              </label>
            ))}
          </div>
        </Modal>
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

function loadDashboardBis(storageKey: string): DashboardBiId[] {
  if (typeof window === "undefined") return [...DASHBOARD_BIS];
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return [...DASHBOARD_BIS];
    const selected = stored.filter(
      (item): item is DashboardBiId =>
        typeof item === "string" && DASHBOARD_BIS.includes(item as DashboardBiId),
    );
    return selected.length ? selected : [...DASHBOARD_BIS];
  } catch {
    return [...DASHBOARD_BIS];
  }
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "sem amostra";
  return `${num(value)} min`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}
