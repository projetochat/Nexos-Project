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
import {
  CheckCircle2,
  Check,
  Clock,
  GripVertical,
  MessagesSquare,
  PauseCircle,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { DashboardFiltersBar } from "@/components/dashboard-filters";
import { Button, Card, Input, KPI, SectionHeader } from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { num, relativeTime } from "@/lib/format";
import { operationsApi } from "@/lib/trixus-api";
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
type DashboardColumnCount = 1 | 2 | 3 | 4;
type DashboardPreferences = {
  visible: DashboardBiId[];
  order: DashboardBiId[];
  labels: Partial<Record<DashboardBiId, string>>;
  columns: Partial<Record<DashboardBiId, DashboardColumnCount>>;
};
const DEFAULT_DASHBOARD_COLUMNS: Record<DashboardBiId, DashboardColumnCount> = {
  counters: 4,
  messages: 2,
  distribution: 1,
  connection: 1,
  customer: 1,
  department: 1,
  tag: 1,
  agent: 1,
  recent: 4,
};
const BI_LABELS: Record<DashboardBiId, string> = {
  counters: "Contadores de registro",
  messages: "Tráfego de mensagens",
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
  const storageKey = `trixus.dashboard.bis.${user?.id ?? "anonymous"}`;
  const [editingDashboard, setEditingDashboard] = React.useState(false);
  const [visibleBis, setVisibleBis] = React.useState<DashboardBiId[]>(
    () => loadDashboardPreferences(storageKey).visible,
  );
  const [draftBis, setDraftBis] = React.useState<DashboardBiId[]>(visibleBis);
  const [dashboardOrder, setDashboardOrder] = React.useState<DashboardBiId[]>(
    () => loadDashboardPreferences(storageKey).order,
  );
  const [draftOrder, setDraftOrder] = React.useState<DashboardBiId[]>(dashboardOrder);
  const [dashboardLabels, setDashboardLabels] = React.useState<
    Partial<Record<DashboardBiId, string>>
  >(() => loadDashboardPreferences(storageKey).labels);
  const [draftLabels, setDraftLabels] =
    React.useState<Partial<Record<DashboardBiId, string>>>(dashboardLabels);
  const [dashboardColumns, setDashboardColumns] = React.useState<
    Partial<Record<DashboardBiId, DashboardColumnCount>>
  >(() => loadDashboardPreferences(storageKey).columns);
  const [draftColumns, setDraftColumns] =
    React.useState<Partial<Record<DashboardBiId, DashboardColumnCount>>>(dashboardColumns);
  const [editingBiId, setEditingBiId] = React.useState<DashboardBiId | null>(null);
  const [editingBiTitle, setEditingBiTitle] = React.useState("");
  const [draggingBiId, setDraggingBiId] = React.useState<DashboardBiId | null>(null);
  React.useEffect(() => {
    const saved = loadDashboardPreferences(storageKey);
    setVisibleBis(saved.visible);
    setDraftBis(saved.visible);
    setDashboardOrder(saved.order);
    setDraftOrder(saved.order);
    setDashboardLabels(saved.labels);
    setDraftLabels(saved.labels);
    setDashboardColumns(saved.columns);
    setDraftColumns(saved.columns);
    setEditingBiId(null);
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
  const queueKpiById: Record<QueueId, [keyof typeof kpis, keyof typeof kpis]> = {
    ativas: ["contadorAtivasAtuais", "filaAtivas"],
    standby: ["contadorStandbyAtual", "filaStandby"],
    fila: ["contadorFilaAtual", "filaFila"],
    leads: ["contadorLeadsAtuais", "filaLeads"],
  };
  const queueIconById: Record<QueueId, React.ComponentType<{ className?: string }>> = {
    ativas: Play,
    standby: PauseCircle,
    fila: Clock,
    leads: UserPlus,
  };
  const queueCards = queuePrefs
    .filter((queue) => queue.enabled)
    .map((queue) => ({
      id: queue.id,
      label: queue.label,
      value: kpiValue(kpis[queueKpiById[queue.id][0]] ?? kpis[queueKpiById[queue.id][1]]),
      Icon: queueIconById[queue.id],
    }));
  const closedConversations = kpiValue(kpis.contadorFechadasAtuais ?? kpis.conversasEncerradas);
  const totalConversations =
    kpis.conversasTotalAtual === undefined
      ? queueCards.reduce((total, queue) => total + queue.value, 0) + closedConversations
      : kpiValue(kpis.conversasTotalAtual);
  const hasBi = (id: DashboardBiId) => visibleBis.includes(id);
  const biLabel = (id: DashboardBiId) => dashboardLabels[id]?.trim() || BI_LABELS[id];
  const dashboardPosition = (id: DashboardBiId) => dashboardOrder.indexOf(id);
  const dashboardColumnClass = (id: DashboardBiId) => {
    const columns = dashboardColumnCount(id);
    return {
      1: "md:col-span-1",
      2: "md:col-span-2",
      3: "md:col-span-3",
      4: "md:col-span-4",
    }[columns];
  };
  const dashboardColumnCount = (id: DashboardBiId): DashboardColumnCount =>
    id === "counters" ? 4 : (dashboardColumns[id] ?? DEFAULT_DASHBOARD_COLUMNS[id]);
  const messagesColumns = dashboardColumns.messages ?? DEFAULT_DASHBOARD_COLUMNS.messages;
  const compactMessagesChart = messagesColumns <= 2;

  const beginEditingBiTitle = (id: DashboardBiId) => {
    setEditingBiId(id);
    setEditingBiTitle(draftLabels[id]?.trim() || BI_LABELS[id]);
  };

  const saveEditingBiTitle = () => {
    if (!editingBiId) return;
    const title = editingBiTitle.trim();
    if (!title) {
      toast.error("Informe um título para o dashboard.");
      return;
    }
    setDraftLabels((current) => ({ ...current, [editingBiId]: title }));
    setEditingBiId(null);
  };

  const reorderDraftBis = (sourceId: DashboardBiId, targetId: DashboardBiId) => {
    if (sourceId === targetId) return;
    setDraftOrder((current) => {
      const next = current.filter((id) => id !== sourceId);
      next.splice(next.indexOf(targetId), 0, sourceId);
      return next;
    });
  };

  return (
    <AppShell>
      <PageContainer className="max-w-none">
        <SectionHeader
          title="Dashboard"
          subtitle="Panorama operacional com métricas consolidadas do banco Trixus."
          subtitleClassName="hidden sm:block"
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
                    setDraftOrder(dashboardOrder);
                    setDraftLabels(dashboardLabels);
                    setDraftColumns(dashboardColumns);
                    setEditingBiId(null);
                    setEditingDashboard(true);
                  }}
                  title="Editar Dashboard"
                  aria-label="Editar Dashboard"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Editar Dashboard</span>
                </Button>
              )}
            </div>
          }
        />

        <DashboardFiltersBar
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div
            style={{ order: dashboardPosition("counters") }}
            className={`${dashboardColumnClass("counters")} ${hasBi("counters") ? "" : "hidden"}`}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {biLabel("counters")}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
              {queueCards.map((queue) => {
                const Icon = queue.Icon;
                return (
                  <KPI
                    key={queue.id}
                    label={queue.label}
                    value={num(queue.value)}
                    tone="info"
                    icon={<Icon className="h-6 w-6" />}
                  />
                );
              })}
              <KPI
                label="Fechadas"
                value={num(closedConversations)}
                tone="info"
                icon={<CheckCircle2 className="h-6 w-6" />}
              />
              <KPI
                label="Total"
                value={num(totalConversations)}
                tone="info"
                icon={<MessagesSquare className="h-6 w-6" />}
              />
            </div>
          </div>

          <div
            style={{ order: dashboardPosition("messages") }}
            className={`${dashboardColumnClass("messages")} ${hasBi("messages") ? "" : "hidden"}`}
          >
            <Card className="h-full">
              <div className="mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {biLabel("messages")}
                  </p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data?.charts.messagesByHour ?? []}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="hora"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    interval={messagesColumns === 1 ? 3 : compactMessagesChart ? 0 : "preserveEnd"}
                    angle={compactMessagesChart ? -45 : 0}
                    textAnchor={compactMessagesChart ? "end" : "middle"}
                    height={compactMessagesChart ? 48 : 30}
                    tickMargin={compactMessagesChart ? 8 : 0}
                  />
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
          </div>

          <div
            style={{ order: dashboardPosition("distribution") }}
            className={`${dashboardColumnClass("distribution")} ${hasBi("distribution") ? "" : "hidden"}`}
          >
            <Card className="h-full">
              <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
                {biLabel("distribution")}
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

          {[
            {
              id: "connection",
              title: biLabel("connection"),
              data: data?.charts.byConnection ?? [],
            },
            { id: "customer", title: biLabel("customer"), data: data?.charts.byCustomer ?? [] },
            {
              id: "department",
              title: biLabel("department"),
              data: data?.charts.byDepartment ?? [],
            },
            {
              id: "tag",
              title: biLabel("tag"),
              data: (data?.charts.byTag ?? []).map((item) => ({
                ...item,
                nome: `${item.nome} (${item.percentual ?? 0}%)`,
              })),
            },
            { id: "agent", title: biLabel("agent"), data: data?.charts.byAgent ?? [] },
          ]
            .filter((chart) => hasBi(chart.id as DashboardBiId))
            .map((chart) => {
              const chartData = compactDashboardChartData(
                chart.data,
                dashboardColumnCount(chart.id as DashboardBiId),
              );
              const rotateLabels =
                chartData.length > 5 || chartData.some((item) => item.nome.length > 14);
              return (
                <div
                  key={chart.id}
                  style={{ order: dashboardPosition(chart.id as DashboardBiId) }}
                  className={dashboardColumnClass(chart.id as DashboardBiId)}
                >
                  <Card className="h-full">
                    <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
                      {chart.title}
                    </p>
                    {chart.data.length === 0 ? (
                      <div className="flex h-[270px] items-center justify-center text-xs text-muted-foreground">
                        Sem dados para o periodo.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={270}>
                        <BarChart data={chartData}>
                          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                          <XAxis
                            dataKey="nome"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                            interval={0}
                            angle={rotateLabels ? -35 : 0}
                            textAnchor={rotateLabels ? "end" : "middle"}
                            height={rotateLabels ? 78 : 30}
                            tickMargin={rotateLabels ? 8 : 0}
                          />
                          <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                            allowDecimals={false}
                          />
                          <Tooltip content={<DashboardBarTooltip />} />
                          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                            {chartData.map((item, index) => (
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
                </div>
              );
            })}

          <div
            style={{ order: dashboardPosition("recent") }}
            className={`${dashboardColumnClass("recent")} ${hasBi("recent") ? "" : "hidden"}`}
          >
            <Card className="p-0">
              <div className="border-b border-border px-5 py-4">
                <p className="text-sm font-semibold">{biLabel("recent")}</p>
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
                        {conversation.protocolo
                          ? `#${conversation.protocolo}`
                          : conversation.status}
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
          </div>
        </div>
        <Modal
          open={editingDashboard}
          onClose={() => setEditingDashboard(false)}
          title="Editar Dashboard"
          size="lg"
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraftBis([...DASHBOARD_BIS]);
                  setDraftOrder([...DASHBOARD_BIS]);
                  setDraftLabels({});
                  setDraftColumns(DEFAULT_DASHBOARD_COLUMNS);
                  setEditingBiId(null);
                  toast.success("Configurações restauradas para o padrão do sistema.");
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingBiId(null);
                    setEditingDashboard(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const preferences: DashboardPreferences = {
                      visible: draftBis,
                      order: draftOrder,
                      labels: draftLabels,
                      columns: { ...draftColumns, counters: 4 },
                    };
                    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
                    setVisibleBis(draftBis);
                    setDashboardOrder(draftOrder);
                    setDashboardLabels(draftLabels);
                    setDashboardColumns({ ...draftColumns, counters: 4 });
                    setEditingBiId(null);
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
            {draftOrder.map((id, index) => (
              <div
                key={id}
                draggable={editingBiId !== id}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                  setDraggingBiId(id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain") as DashboardBiId;
                  if (DASHBOARD_BIS.includes(sourceId)) reorderDraftBis(sourceId, id);
                  setDraggingBiId(null);
                }}
                onDragEnd={() => setDraggingBiId(null)}
                className={`flex min-h-11 items-center gap-2 rounded-lg border border-border px-2 py-1.5 transition ${
                  draggingBiId === id ? "opacity-50" : ""
                }`}
              >
                <div className="flex shrink-0 cursor-grab items-center gap-1 text-muted-foreground active:cursor-grabbing">
                  <GripVertical className="h-3.5 w-3.5" />
                  <span className="w-3 text-center font-mono text-xs">{index + 1}</span>
                </div>
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
                  className="h-4 w-4 shrink-0 accent-primary"
                  aria-label={`Exibir ${draftLabels[id]?.trim() || BI_LABELS[id]}`}
                />
                {editingBiId === id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        autoFocus
                        value={editingBiTitle}
                        onChange={(event) => setEditingBiTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveEditingBiTitle();
                          if (event.key === "Escape") setEditingBiId(null);
                        }}
                        className="h-8 min-w-0 pr-9 text-sm"
                        aria-label="Título do dashboard"
                      />
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        title="Cancelar edição"
                        aria-label="Cancelar edição"
                        onClick={() => setEditingBiId(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      title="Salvar título"
                      aria-label="Salvar título"
                      onClick={saveEditingBiTitle}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {draftLabels[id]?.trim() || BI_LABELS[id]}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      title="Editar título"
                      aria-label={`Editar ${draftLabels[id]?.trim() || BI_LABELS[id]}`}
                      onClick={() => beginEditingBiTitle(id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <div className="ml-2 hidden shrink-0 items-center gap-1 border-l border-border pl-3 text-xs text-muted-foreground md:flex">
                  <span className="hidden sm:inline">Colunas</span>
                  {id === "counters" ? (
                    <span className="flex h-8 w-12 items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-muted-foreground">
                      4
                    </span>
                  ) : (
                    <select
                      value={draftColumns[id] ?? DEFAULT_DASHBOARD_COLUMNS[id]}
                      onChange={(event) =>
                        setDraftColumns((current) => ({
                          ...current,
                          [id]: Number(event.target.value) as DashboardColumnCount,
                        }))
                      }
                      onMouseDown={(event) => event.stopPropagation()}
                      className="h-8 w-12 rounded-md border border-border bg-surface px-1 text-center text-sm text-foreground outline-none focus:border-primary"
                      aria-label={`Quantidade de colunas de ${draftLabels[id]?.trim() || BI_LABELS[id]}`}
                    >
                      {[1, 2, 3, 4].map((columns) => (
                        <option key={columns} value={columns}>
                          {columns}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
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

type DashboardChartDatum = {
  nome: string;
  total: number;
  cor?: string | null;
  detalhes?: DashboardChartDatum[];
};

function compactDashboardChartData(data: DashboardChartDatum[], columns: DashboardColumnCount) {
  const maxItemsByColumn: Record<DashboardColumnCount, number> = {
    1: 5,
    2: 10,
    3: 15,
    4: 20,
  };
  const maxItems = maxItemsByColumn[columns];
  if (data.length <= maxItems) return data;

  const sorted = [...data].sort((first, second) => second.total - first.total);
  const visible = sorted.slice(0, maxItems - 1);
  const detalhes = sorted.slice(maxItems - 1);
  return [
    ...visible,
    {
      nome: "Outros",
      total: detalhes.reduce((total, item) => total + item.total, 0),
      cor: "#94a3b8",
      detalhes,
    },
  ];
}

function DashboardBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; payload?: DashboardChartDatum }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">
        {item.nome}: {num(item.total)}
      </p>
      {item.detalhes && (
        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto border-t border-border pt-2 text-muted-foreground">
          {item.detalhes.map((detail) => (
            <p key={detail.nome} className="flex items-center justify-between gap-4">
              <span className="truncate">{detail.nome}</span>
              <span className="shrink-0 font-medium text-foreground">{num(detail.total)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function loadDashboardPreferences(storageKey: string): DashboardPreferences {
  const defaults: DashboardPreferences = {
    visible: [...DASHBOARD_BIS],
    order: [...DASHBOARD_BIS],
    labels: {},
    columns: DEFAULT_DASHBOARD_COLUMNS,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    const normalizeIds = (value: unknown): DashboardBiId[] =>
      Array.isArray(value)
        ? value.filter(
            (item): item is DashboardBiId =>
              typeof item === "string" && DASHBOARD_BIS.includes(item as DashboardBiId),
          )
        : [];

    if (Array.isArray(stored)) {
      const visible = normalizeIds(stored);
      return { ...defaults, visible: visible.length ? visible : defaults.visible };
    }
    if (!stored || typeof stored !== "object") return defaults;

    const data = stored as Partial<DashboardPreferences>;
    const visible = normalizeIds(data.visible);
    const savedOrder = normalizeIds(data.order);
    const order = [...savedOrder, ...DASHBOARD_BIS.filter((id) => !savedOrder.includes(id))];
    const labels = Object.fromEntries(
      Object.entries(data.labels ?? {}).filter(
        ([id, value]) => DASHBOARD_BIS.includes(id as DashboardBiId) && typeof value === "string",
      ),
    ) as Partial<Record<DashboardBiId, string>>;
    const columns = Object.fromEntries(
      Object.entries(data.columns ?? {}).filter(
        ([id, value]) =>
          DASHBOARD_BIS.includes(id as DashboardBiId) &&
          typeof value === "number" &&
          value >= 1 &&
          value <= 4,
      ),
    ) as Partial<Record<DashboardBiId, DashboardColumnCount>>;
    return { visible: visible.length ? visible : defaults.visible, order, labels, columns };
  } catch {
    return defaults;
  }
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "sem amostra";
  return `${num(value)} min`;
}
