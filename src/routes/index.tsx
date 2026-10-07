import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  MessagesSquare,
  PauseCircle,
  Pencil,
  Play,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { DashboardFiltersBar } from "@/components/dashboard-filters";
import { DashboardEditorModal } from "@/components/dashboard-editor-modal";
import { MessageTrafficWidget } from "@/components/message-traffic-widget";
import {
  DashboardComponentRenderer,
  type DashboardVisualDatum,
} from "@/components/dashboard-component-renderer";
import { Button, Card, KPI, SectionHeader } from "@/components/ui-kit";
import { num, relativeTime } from "@/lib/format";
import { crmApi, operationsApi } from "@/lib/trixus-api";
import {
  DEFAULT_OPERATIONAL_FILTERS,
  datesForOperationalPeriod,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { useQueuePrefs, type QueueId } from "@/lib/queue-prefs";
import { useSession } from "@/lib/session";
import { onRealtimeEvent } from "@/lib/realtime/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DEFAULT_DASHBOARD_COMPONENTS,
  dashboardColumnClass,
  parseDashboardPreferences,
  type DashboardComponentConfig,
} from "@/lib/dashboard-components";

export const Route = createFileRoute("/")({ component: Dashboard });

const DASHBOARD_PERIODS = new Set([
  "today",
  "yesterday",
  "week",
  "previous_week",
  "month",
  "previous_month",
  "year",
  "previous_year",
  "7d",
  "30d",
  "custom",
]);

function defaultDashboardFilters(): OperationalReportFilters {
  return {
    ...DEFAULT_OPERATIONAL_FILTERS,
    period: "today",
    ...datesForOperationalPeriod("today"),
  };
}

function loadDashboardFilters(storageKey: string): OperationalReportFilters {
  const fallback = defaultDashboardFilters();
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return fallback;
    const filters = parsed as Record<string, unknown>;
    if (typeof filters.period !== "string" || !DASHBOARD_PERIODS.has(filters.period)) {
      return fallback;
    }
    return {
      period: filters.period as OperationalReportFilters["period"],
      ...(typeof filters.q === "string" ? { q: filters.q } : {}),
      ...(typeof filters.departmentId === "string" ? { departmentId: filters.departmentId } : {}),
      ...(typeof filters.customerId === "string" ? { customerId: filters.customerId } : {}),
      ...(typeof filters.connectionId === "string" ? { connectionId: filters.connectionId } : {}),
      ...(filters.period === "today"
        ? datesForOperationalPeriod("today")
        : {
            ...(typeof filters.start === "string" ? { start: filters.start } : {}),
            ...(typeof filters.end === "string" ? { end: filters.end } : {}),
          }),
    };
  } catch {
    return fallback;
  }
}

function Dashboard() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const canCreateDashboard =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.permissions?.includes("dashboard.create");
  const canUpdateDashboard =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.permissions?.includes("dashboard.update");
  const canDeleteDashboard =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.permissions?.includes("dashboard.delete");
  const canReadAdditionalFields =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.permissions?.includes("contacts.additional_fields.read");
  const canEditDashboard = canCreateDashboard || canUpdateDashboard || canDeleteDashboard;
  const filtersStorageKey = `trixus.dashboard.filters.${user?.id ?? "anonymous"}`;
  const [editingDashboard, setEditingDashboard] = React.useState(false);
  const [previewComponent, setPreviewComponent] = React.useState<DashboardComponentConfig | null>(
    null,
  );
  const [dashboardComponents, setDashboardComponents] = React.useState<DashboardComponentConfig[]>(
    () => DEFAULT_DASHBOARD_COMPONENTS.map((component) => ({ ...component })),
  );
  const dashboardConfigurationQuery = useQuery({
    queryKey: ["operations", "dashboard", "configuration"],
    queryFn: operationsApi.dashboardConfiguration,
  });
  React.useEffect(() => {
    if (!dashboardConfigurationQuery.isSuccess) return;
    setDashboardComponents(
      parseDashboardPreferences(dashboardConfigurationQuery.data.configuration),
    );
  }, [dashboardConfigurationQuery.data, dashboardConfigurationQuery.isSuccess]);
  const saveDashboardMutation = useMutation({
    mutationFn: (components: DashboardComponentConfig[]) =>
      operationsApi.updateDashboardConfiguration({ version: 2, components }),
    onSuccess: (result) => {
      queryClient.setQueryData(["operations", "dashboard", "configuration"], result);
    },
    onError: () => {
      toast.error("Não foi possível salvar a configuração compartilhada do Dashboard.");
      void dashboardConfigurationQuery.refetch();
    },
  });
  const updateDashboardComponents = React.useCallback(
    (components: DashboardComponentConfig[]) => {
      setDashboardComponents(components);
      saveDashboardMutation.mutate(components);
    },
    [saveDashboardMutation],
  );
  const [filters, setFilters] = React.useState<OperationalReportFilters>(() =>
    loadDashboardFilters(filtersStorageKey),
  );
  React.useEffect(() => {
    setFilters(loadDashboardFilters(filtersStorageKey));
  }, [filtersStorageKey]);
  React.useEffect(() => {
    window.localStorage.setItem(filtersStorageKey, JSON.stringify(filters));
  }, [filters, filtersStorageKey]);
  const query = useQuery({
    queryKey: ["operations", "dashboard", filters],
    queryFn: () => operationsApi.dashboard(filters),
    refetchInterval: 30_000,
  });
  const customFieldsQuery = useQuery({
    queryKey: ["trixus", "contact-custom-fields"],
    queryFn: crmApi.listContactCustomFields,
    enabled: !!canEditDashboard && !!canReadAdditionalFields,
  });
  const contactGroups = [
    ...new Set([
      ...dashboardComponents
        .filter((component) => component.dataSource === "contacts")
        .map((component) => component.groupBy),
      ...(previewComponent?.dataSource === "contacts" ? [previewComponent.groupBy] : []),
    ]),
  ];
  const contactComponentQueries = useQueries({
    queries: contactGroups.map((groupBy) => ({
      queryKey: ["operations", "dashboard", "component-data", filters, groupBy],
      queryFn: () => operationsApi.dashboardComponentData({ ...filters, groupBy }),
    })),
  });
  const contactDataByGroup = new Map(
    contactGroups.map((groupBy, index) => [
      groupBy,
      contactComponentQueries[index]?.data?.items ?? [],
    ]),
  );
  const data = query.data;
  const [refreshing, setRefreshing] = React.useState(false);
  const loadingCards = query.isLoading || refreshing;
  const refreshDashboard = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        query.refetch({ throwOnError: true }),
        ...contactComponentQueries.map((componentQuery) =>
          componentQuery.refetch({ throwOnError: true }),
        ),
        new Promise((resolve) => window.setTimeout(resolve, 600)),
      ]);
    } catch {
      toast.error("Não foi possível atualizar o dashboard. Tente novamente.");
    } finally {
      setRefreshing(false);
    }
  };
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
  const recent = (data?.recent ?? []).slice(0, 7);
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
  const closedConversations = kpiValue(kpis.conversasEncerradas ?? kpis.contadorFechadasAtuais);
  const totalConversations =
    kpis.conversasTotalPeriodo === undefined
      ? kpiValue(kpis.conversasTotalAtual) ||
        queueCards.reduce((total, queue) => total + queue.value, 0) + closedConversations
      : kpiValue(kpis.conversasTotalPeriodo);
  const messageTraffic = data?.charts.messagesByHour ?? [];
  const messageTrafficTotals = messageTraffic.reduce(
    (totals, item) => ({
      recebidas: totals.recebidas + item.recebidas,
      enviadas: totals.enviadas + item.enviadas,
    }),
    { recebidas: 0, enviadas: 0 },
  );
  const totalMessages = messageTrafficTotals.recebidas + messageTrafficTotals.enviadas;
  const visibleComponents = dashboardComponents.filter((component) => component.visible);
  const resolveDashboardData = (component: DashboardComponentConfig): DashboardVisualDatum[] => {
    if (component.dataSource === "records") {
      return [
        ...queueCards.map((queue) => ({ nome: queue.label, total: queue.value })),
        { nome: "Fechadas", total: closedConversations },
        { nome: "Total", total: totalConversations },
      ];
    }
    if (component.dataSource === "messages") {
      if (component.groupBy === "direction") {
        return [
          { nome: "Recebidas", total: messageTrafficTotals.recebidas, cor: "#2563eb" },
          { nome: "Enviadas", total: messageTrafficTotals.enviadas, cor: "#dc2626" },
          { nome: "Total", total: totalMessages, cor: "#94a3b8" },
        ];
      }
      return messageTraffic.map((item) => ({ nome: item.hora, total: item.total }));
    }
    if (component.dataSource === "conversations") {
      const chartByGroup: Record<string, DashboardVisualDatum[]> = {
        status: statusSerie,
        connection: data?.charts.byConnection ?? [],
        customer: data?.charts.byCustomer ?? [],
        department: data?.charts.byDepartment ?? [],
        tag: data?.charts.byTag ?? [],
        agent: data?.charts.byAgent ?? [],
      };
      return chartByGroup[component.groupBy] ?? [];
    }
    if (component.dataSource === "activity") {
      return recent.slice(0, 20).map((conversation) => ({
        nome: conversation.contact?.nome ?? "Contato",
        total: 1,
      }));
    }
    if (component.dataSource === "contacts") {
      return contactDataByGroup.get(component.groupBy) ?? [];
    }
    return [];
  };

  return (
    <AppShell>
      <PageContainer className="max-w-none">
        <SectionHeader
          title="Dashboard"
          subtitle="Panorama operacional."
          subtitleClassName="hidden sm:block"
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refreshDashboard()}
                disabled={query.isFetching || refreshing}
                title="Atualizar indicadores"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${query.isFetching || refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Atualizando..." : "Atualizar"}
              </Button>
              {canEditDashboard && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingDashboard(true)}
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
          onClear={() => setFilters(defaultDashboardFilters())}
        />

        {loadingCards ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="grid grid-cols-1 gap-4 md:grid-cols-4"
          >
            <span className="sr-only">Carregando indicadores do dashboard...</span>
            {visibleComponents.map((component) => (
              <div key={component.id} className={dashboardColumnClass(component.columns)}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {component.title}
                </p>
                <Card className="h-64 animate-pulse bg-surface-2">
                  <div className="h-full rounded bg-surface-3" />
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {visibleComponents.map((component) => (
              <div key={component.id} className={dashboardColumnClass(component.columns)}>
                {component.dataSource === "records" &&
                component.groupBy === "queue" &&
                component.visualization === "cards" &&
                component.valueMode === "count" ? (
                  <>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {component.title}
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
                  </>
                ) : component.dataSource === "messages" &&
                  component.groupBy === "hour" &&
                  component.visualization === "line" &&
                  component.valueMode === "count" ? (
                  <MessageTrafficWidget
                    title={component.title}
                    data={messageTraffic}
                    contactsTotal={data?.charts.messageContactsTotal ?? 0}
                    columns={component.columns}
                    isMobile={isMobile}
                  />
                ) : component.dataSource === "activity" &&
                  component.groupBy === "recent" &&
                  component.visualization === "table" &&
                  component.valueMode === "count" ? (
                  <Card className="h-full">
                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {component.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Últimas conversas movimentadas.
                      </p>
                    </div>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {recent.map((conversation) => (
                        <li
                          key={conversation.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm"
                        >
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
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            há {relativeTime(new Date(conversation.last_message_at).getTime())}
                          </span>
                        </li>
                      ))}
                      {recent.length === 0 && (
                        <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Nenhuma atividade operacional encontrada.
                        </li>
                      )}
                    </ul>
                  </Card>
                ) : (
                  <DashboardComponentRenderer
                    title={component.title}
                    visualization={component.visualization}
                    columns={component.columns}
                    valueMode={component.valueMode}
                    data={resolveDashboardData(component)}
                    preserveOrder={component.dataSource === "activity"}
                  />
                )}
              </div>
            ))}
            {visibleComponents.length === 0 && (
              <Card className="md:col-span-4">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum componente visível. Use “Editar Dashboard” para configurar a tela.
                </p>
              </Card>
            )}
          </div>
        )}

        <DashboardEditorModal
          open={editingDashboard}
          components={dashboardComponents}
          customFields={(customFieldsQuery.data ?? []).map((field) => ({
            id: field.id,
            label: field.label,
          }))}
          resolveData={resolveDashboardData}
          renderPreview={(component) =>
            component.dataSource === "messages" &&
            component.groupBy === "hour" &&
            component.visualization === "line" &&
            component.valueMode === "count" ? (
              <MessageTrafficWidget
                title={component.title}
                data={messageTraffic}
                contactsTotal={data?.charts.messageContactsTotal ?? 0}
                columns={component.columns}
                isMobile={isMobile}
              />
            ) : undefined
          }
          onPreviewConfigChange={setPreviewComponent}
          canCreate={canCreateDashboard}
          canUpdate={canUpdateDashboard}
          canDelete={canDeleteDashboard}
          onChange={updateDashboardComponents}
          onClose={() => setEditingDashboard(false)}
        />
      </PageContainer>
    </AppShell>
  );
}

function kpiValue(kpi: { value: number | null } | undefined) {
  return kpi?.value ?? 0;
}
