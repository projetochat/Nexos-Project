import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CreditCard,
  MessageSquareText,
  Pencil,
  Phone,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AdminContainer } from "@/components/admin-shell";
import { PlatformDashboardFiltersBar } from "@/components/dashboard-filters";
import { DashboardEditorModal } from "@/components/dashboard-editor-modal";
import {
  DashboardComponentRenderer,
  type DashboardVisualDatum,
} from "@/components/dashboard-component-renderer";
import { MessageTrafficWidget } from "@/components/message-traffic-widget";
import { Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dashboardColumnClass,
  type DashboardComponentConfig,
  type DashboardDataSource,
  type DashboardGroupingOption,
} from "@/lib/dashboard-components";
import { datesForOperationalPeriod } from "@/lib/operational-filters";
import {
  platformDashboardApi,
  type PlatformDashboardConfiguration,
  type PlatformDashboardFilters,
  type PlatformDashboardResponse,
} from "@/lib/platform-dashboard-api";
import { TrixusApiError } from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: AdminDashboard,
});

const PLATFORM_SOURCE_OPTIONS: Array<{ value: DashboardDataSource; label: string }> = [
  { value: "records", label: "Plataforma" },
  { value: "messages", label: "Mensagens" },
];

const PLATFORM_GROUPINGS: Record<"records" | "messages", DashboardGroupingOption[]> = {
  records: [
    { value: "platformKpis", label: "Indicadores da plataforma", section: "native" },
    { value: "subscriptions", label: "Assinaturas por plano", section: "native" },
    { value: "operation", label: "Operação", section: "native" },
  ],
  messages: [
    { value: "hour", label: "Tráfego por hora", section: "native" },
    { value: "clientVolume", label: "Volume por cliente", section: "native" },
    { value: "clientPercentage", label: "Percentual por cliente", section: "native" },
  ],
};

// Route tests exercise this catalog directly; the export is not a React component.
// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_PLATFORM_DASHBOARD_COMPONENTS: DashboardComponentConfig[] = [
  component("kpis", "Indicadores da plataforma", "cards", 4, "records", "platformKpis", "count"),
  component("traffic", "Tráfego de mensagens", "line", 2, "messages", "hour", "count"),
  component(
    "volumeByClient",
    "Volume de mensagens por cliente",
    "columns",
    2,
    "messages",
    "clientVolume",
    "count",
  ),
  component(
    "percentageByClient",
    "Mensagens por cliente",
    "donut",
    1,
    "messages",
    "clientPercentage",
    "percentage",
  ),
  component(
    "subscriptions",
    "Assinaturas por plano",
    "table",
    2,
    "records",
    "subscriptions",
    "count",
  ),
  component("operation", "Operação", "cards", 1, "records", "operation", "count"),
];

const PLATFORM_NATIVE_IDS = new Set(DEFAULT_PLATFORM_DASHBOARD_COMPONENTS.map((item) => item.id));

function defaultFilters(): PlatformDashboardFilters {
  return { period: "month", ...datesForOperationalPeriod("month") };
}

function AdminDashboard() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<PlatformDashboardFilters>(defaultFilters);
  const [editingDashboard, setEditingDashboard] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshInFlight = React.useRef(false);
  const [dashboardComponents, setDashboardComponents] = React.useState(() =>
    cloneComponents(DEFAULT_PLATFORM_DASHBOARD_COMPONENTS),
  );
  const configurationVersion = React.useRef(0);
  const saveInFlight = React.useRef(false);
  const pendingSave = React.useRef<DashboardComponentConfig[] | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ["platform", "dashboard", filters],
    queryFn: () => platformDashboardApi.dashboard(filters),
    placeholderData: (previous) => previous,
  });
  const configurationQuery = useQuery({
    queryKey: ["platform", "dashboard", "configuration"],
    queryFn: platformDashboardApi.configuration,
  });

  React.useEffect(() => {
    if (!configurationQuery.data) return;
    configurationVersion.current = configurationQuery.data.version;
    setDashboardComponents(
      configurationQuery.data.configuration.components
        .slice()
        .sort((left, right) => left.order - right.order)
        .map(({ order: _order, ...item }) => item),
    );
  }, [configurationQuery.data]);

  const persistConfiguration = React.useCallback(
    async (components: DashboardComponentConfig[]) => {
      pendingSave.current = cloneComponents(components);
      if (saveInFlight.current) return;
      saveInFlight.current = true;
      try {
        while (pendingSave.current) {
          const next = pendingSave.current;
          pendingSave.current = null;
          const result = await platformDashboardApi.updateConfiguration(
            serializeConfiguration(next),
            configurationVersion.current,
          );
          configurationVersion.current = result.version;
          if (!pendingSave.current) {
            queryClient.setQueryData(["platform", "dashboard", "configuration"], result);
          }
        }
      } catch (error) {
        pendingSave.current = null;
        if (
          error instanceof TrixusApiError &&
          error.code === "PLATFORM_DASHBOARD_CONFIGURATION_CONFLICT"
        ) {
          toast.error(
            "O Dashboard foi alterado por outra sessão. A versão atual será recarregada.",
          );
        } else {
          toast.error("Não foi possível salvar a configuração compartilhada do Dashboard.");
        }
        await configurationQuery.refetch();
      } finally {
        saveInFlight.current = false;
      }
    },
    [configurationQuery, queryClient],
  );

  const updateDashboardComponents = React.useCallback(
    (components: DashboardComponentConfig[]) => {
      setDashboardComponents(components);
      void persistConfiguration(components);
    },
    [persistConfiguration],
  );

  const refreshDashboard = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      await dashboardQuery.refetch({ throwOnError: true });
    } catch {
      toast.error("Não foi possível atualizar o dashboard. Tente novamente.");
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  };

  const data = dashboardQuery.data;
  const visibleComponents = dashboardComponents.filter((item) => item.visible);
  const canUpdateDashboard = configurationQuery.data?.canUpdate ?? false;
  const resolveData = (config: DashboardComponentConfig) => resolvePlatformData(config, data);

  return (
    <AdminContainer className="max-w-none">
      <SectionHeader
        title="Plano de controle SaaS"
        subtitle="Métricas reais da API Trixus. Cobrança manual, sem gateway integrado."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={refreshing || dashboardQuery.isFetching}
              onClick={() => void refreshDashboard()}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Atualizando..." : "Atualizar"}
            </Button>
            {canUpdateDashboard && (
              <Button variant="secondary" size="sm" onClick={() => setEditingDashboard(true)}>
                <Pencil className="h-4 w-4" /> Editar Dashboard
              </Button>
            )}
          </div>
        }
      />

      <PlatformDashboardFiltersBar
        value={filters}
        clients={data?.filters.clients ?? []}
        tenants={data?.filters.tenants ?? []}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onClear={() => setFilters(defaultFilters())}
      />

      {dashboardQuery.error && (
        <Card className="mb-4 border-destructive/40 text-sm text-destructive">
          {(dashboardQuery.error as Error).message}
        </Card>
      )}

      {dashboardQuery.isLoading || !data ? (
        <DashboardSkeleton components={visibleComponents} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {visibleComponents.map((config) => (
            <div key={config.id} className={dashboardColumnClass(config.columns)}>
              <PlatformDashboardComponent config={config} data={data} isMobile={isMobile} />
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
        customFields={[]}
        sourceOptions={PLATFORM_SOURCE_OPTIONS}
        groupingOptions={platformGroupingOptions}
        createComponent={createPlatformComponent}
        restoreComponents={restorePlatformComponents}
        nativeComponentIds={PLATFORM_NATIVE_IDS}
        resolveData={resolveData}
        renderPreview={(config) =>
          data ? (
            <PlatformDashboardComponent config={config} data={data} isMobile={isMobile} />
          ) : undefined
        }
        canCreate={canUpdateDashboard}
        canUpdate={canUpdateDashboard}
        canDelete={canUpdateDashboard}
        onChange={updateDashboardComponents}
        onClose={() => setEditingDashboard(false)}
      />
    </AdminContainer>
  );
}

function PlatformDashboardComponent({
  config,
  data,
  isMobile,
}: {
  config: DashboardComponentConfig;
  data: PlatformDashboardResponse;
  isMobile: boolean;
}) {
  if (
    config.dataSource === "records" &&
    config.groupBy === "platformKpis" &&
    config.visualization === "cards" &&
    config.valueMode === "count"
  ) {
    return <PlatformKpis title={config.title} data={data} />;
  }
  if (
    config.dataSource === "messages" &&
    config.groupBy === "hour" &&
    config.visualization === "line" &&
    config.valueMode === "count"
  ) {
    return (
      <MessageTrafficWidget
        title={config.title}
        data={data.charts.messagesByHour}
        contactsTotal={data.charts.messageContactsTotal}
        columns={config.columns}
        isMobile={isMobile}
      />
    );
  }
  if (
    config.dataSource === "records" &&
    config.groupBy === "subscriptions" &&
    config.visualization === "table" &&
    config.valueMode === "count"
  )
    return <SubscriptionsCard title={config.title} data={data} />;
  if (
    config.dataSource === "records" &&
    config.groupBy === "operation" &&
    config.visualization === "cards" &&
    config.valueMode === "count"
  )
    return <OperationCard title={config.title} data={data} />;

  const chart = (
    <DashboardComponentRenderer
      title={config.title}
      visualization={config.visualization}
      columns={config.columns}
      valueMode={config.valueMode}
      data={resolvePlatformData(config, data)}
      showValues={config.groupBy === "clientVolume" && config.visualization === "columns"}
      preserveAllItems={config.groupBy === "clientVolume" || config.groupBy === "clientPercentage"}
    />
  );
  const clientCount =
    config.groupBy === "clientPercentage"
      ? data.charts.messagePercentageByClient.length
      : config.groupBy === "clientVolume"
        ? data.charts.messageVolumeByClient.length
        : 0;
  if (clientCount <= 4) return chart;
  return (
    <div className="overflow-x-auto pb-1" aria-label={`${config.title}: todos os clientes`}>
      <div style={{ minWidth: Math.max(640, clientCount * 112) }}>{chart}</div>
    </div>
  );
}

function PlatformKpis({ title, data }: { title: string; data: PlatformDashboardResponse }) {
  return (
    <section aria-label={title}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Tenants ativos"
          value={data.kpis.activeTenants}
          icon={Building2}
          tone="success"
        />
        <Kpi label="Tenants trial" value={data.kpis.trialTenants} icon={Activity} tone="info" />
        <Kpi
          label="Suspensos"
          value={data.kpis.suspendedTenants}
          icon={ShieldAlert}
          tone="warning"
        />
        <Kpi label="Usuários ativos" value={data.kpis.activeUsers} icon={Users} />
        <Kpi label="Instâncias" value={data.kpis.activeInstances} icon={Phone} />
        <Kpi
          label="Mensagens no período"
          value={data.kpis.messagesThisPeriod}
          icon={MessageSquareText}
        />
        <Kpi label="Campanhas no período" value={data.kpis.campaignsThisPeriod} icon={Activity} />
        <Kpi
          label="Faturas abertas"
          value={data.kpis.openInvoices}
          icon={CreditCard}
          tone="warning"
        />
      </div>
    </section>
  );
}

function SubscriptionsCard({ title, data }: { title: string; data: PlatformDashboardResponse }) {
  return (
    <Card className="h-full">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 divide-y divide-border">
        {data.subscriptionsByPlan.map((plan) => (
          <div key={plan.planId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{plan.name}</div>
              <div className="truncate text-xs text-muted-foreground">{plan.code}</div>
            </div>
            <Badge tone="brand">{plan.subscriptions} assinaturas</Badge>
          </div>
        ))}
        {!data.subscriptionsByPlan.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum plano ativo encontrado.
          </div>
        )}
      </div>
    </Card>
  );
}

function OperationCard({ title, data }: { title: string; data: PlatformDashboardResponse }) {
  return (
    <Card className="h-full">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3 text-sm">
        <Row label="Tickets abertos" value={data.operation.openTickets} />
        <Row label="Faturas abertas" value={data.operation.openInvoices} />
        <Row label="Faturas vencidas" value={data.operation.overdueInvoices} />
      </div>
      <Link to="/admin/tenants" className="mt-5 inline-flex text-sm text-primary">
        Ver tenants
      </Link>
    </Card>
  );
}

function DashboardSkeleton({ components }: { components: DashboardComponentConfig[] }) {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <span className="sr-only">Carregando dados da plataforma...</span>
      {components.map((item) => (
        <Card
          key={item.id}
          className={`${dashboardColumnClass(item.columns)} h-64 animate-pulse bg-surface-2`}
        >
          <div className="h-full rounded bg-surface-3" />
        </Card>
      ))}
    </div>
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolvePlatformData(
  config: DashboardComponentConfig,
  data?: PlatformDashboardResponse,
): DashboardVisualDatum[] {
  if (!data) return [];
  if (config.groupBy === "platformKpis")
    return [
      { nome: "Tenants ativos", total: data.kpis.activeTenants },
      { nome: "Tenants trial", total: data.kpis.trialTenants },
      { nome: "Suspensos", total: data.kpis.suspendedTenants },
      { nome: "Usuários ativos", total: data.kpis.activeUsers },
      { nome: "Instâncias", total: data.kpis.activeInstances },
      { nome: "Mensagens", total: data.kpis.messagesThisPeriod },
      { nome: "Campanhas", total: data.kpis.campaignsThisPeriod },
      { nome: "Faturas abertas", total: data.kpis.openInvoices },
    ];
  if (config.groupBy === "hour")
    return data.charts.messagesByHour.map((item) => ({ nome: item.hora, total: item.total }));
  if (config.groupBy === "clientVolume")
    return data.charts.messageVolumeByClient.map((item) => ({
      nome: item.clientName,
      total: item.total,
    }));
  if (config.groupBy === "clientPercentage")
    return data.charts.messagePercentageByClient.map((item) => ({
      nome: item.clientName,
      total: item.total,
    }));
  if (config.groupBy === "subscriptions")
    return data.subscriptionsByPlan.map((item) => ({ nome: item.name, total: item.subscriptions }));
  if (config.groupBy === "operation")
    return [
      { nome: "Tickets abertos", total: data.operation.openTickets },
      { nome: "Faturas abertas", total: data.operation.openInvoices },
      { nome: "Faturas vencidas", total: data.operation.overdueInvoices },
    ];
  return [];
}

// eslint-disable-next-line react-refresh/only-export-components
export function platformGroupingOptions(source: DashboardDataSource) {
  return source === "records" || source === "messages" ? PLATFORM_GROUPINGS[source] : [];
}

function createPlatformComponent(): DashboardComponentConfig {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `platform-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return component(id, "", "columns", 1, "messages", "clientVolume", "count");
}

function restorePlatformComponents(components: DashboardComponentConfig[]) {
  const custom = components.filter((item) => !PLATFORM_NATIVE_IDS.has(item.id));
  return [...cloneComponents(DEFAULT_PLATFORM_DASHBOARD_COMPONENTS), ...cloneComponents(custom)];
}

function serializeConfiguration(
  components: DashboardComponentConfig[],
): PlatformDashboardConfiguration {
  return { schemaVersion: 1, components: components.map((item, order) => ({ ...item, order })) };
}

function cloneComponents(components: DashboardComponentConfig[]) {
  return components.map((item) => ({ ...item }));
}

function component(
  id: string,
  title: string,
  visualization: DashboardComponentConfig["visualization"],
  columns: DashboardComponentConfig["columns"],
  dataSource: DashboardComponentConfig["dataSource"],
  groupBy: string,
  valueMode: DashboardComponentConfig["valueMode"],
): DashboardComponentConfig {
  return { id, title, visible: true, visualization, columns, dataSource, groupBy, valueMode };
}
