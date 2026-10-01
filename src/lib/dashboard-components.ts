export const DASHBOARD_VISUALIZATIONS = [
  "columns",
  "bars",
  "line",
  "pie",
  "donut",
  "gauge",
  "table",
  "cards",
] as const;

export type DashboardVisualization = (typeof DASHBOARD_VISUALIZATIONS)[number];
export type DashboardColumnCount = 1 | 2 | 3 | 4;
export type DashboardDataSource =
  | "records"
  | "conversations"
  | "messages"
  | "contacts"
  | "activity";
export type DashboardValueMode = "count" | "percentage";

export type DashboardComponentConfig = {
  id: string;
  title: string;
  visible: boolean;
  visualization: DashboardVisualization;
  columns: DashboardColumnCount;
  dataSource: DashboardDataSource;
  groupBy: string;
  valueMode: DashboardValueMode;
};

export type DashboardPreferencesV2 = {
  version: 2;
  components: DashboardComponentConfig[];
};

export type DashboardGroupingOption = {
  value: string;
  label: string;
  section: "native" | "custom";
};

export const DASHBOARD_SOURCE_OPTIONS: Array<{ value: DashboardDataSource; label: string }> = [
  { value: "records", label: "Registros operacionais" },
  { value: "conversations", label: "Conversas" },
  { value: "messages", label: "Mensagens" },
  { value: "contacts", label: "Contatos" },
  { value: "activity", label: "Atividade recente" },
];

const NATIVE_GROUPINGS: Record<DashboardDataSource, DashboardGroupingOption[]> = {
  records: [{ value: "queue", label: "Status operacional", section: "native" }],
  conversations: [
    { value: "status", label: "Status da conversa", section: "native" },
    { value: "connection", label: "Instância", section: "native" },
    { value: "customer", label: "Cliente", section: "native" },
    { value: "department", label: "Departamento", section: "native" },
    { value: "tag", label: "Etiqueta", section: "native" },
    { value: "agent", label: "Atendente", section: "native" },
  ],
  messages: [
    { value: "hour", label: "Horário", section: "native" },
    { value: "direction", label: "Direção da mensagem", section: "native" },
  ],
  contacts: [
    { value: "customer", label: "Empresa", section: "native" },
    { value: "department", label: "Departamento do contato", section: "native" },
    { value: "profile", label: "Perfil", section: "native" },
    { value: "companyRole", label: "Função na empresa", section: "native" },
    { value: "instance", label: "Instância de origem", section: "native" },
  ],
  activity: [{ value: "recent", label: "Conversas recentes", section: "native" }],
};

export const DEFAULT_DASHBOARD_COMPONENTS: DashboardComponentConfig[] = [
  component("counters", "Contadores de registro", true, "cards", 4, "records", "queue", "count"),
  component("messages", "Tráfego de mensagens", true, "line", 2, "messages", "hour", "count"),
  component("tag", "Conversas por etiqueta", true, "columns", 2, "conversations", "tag", "count"),
  component(
    "distribution",
    "Distribuição de conversas",
    true,
    "donut",
    1,
    "conversations",
    "status",
    "percentage",
  ),
  component(
    "agent",
    "Conversas por atendente",
    true,
    "columns",
    1,
    "conversations",
    "agent",
    "count",
  ),
  component(
    "customer",
    "Conversas por cliente",
    true,
    "bars",
    1,
    "conversations",
    "customer",
    "count",
  ),
  component("recent", "Atividade recente", true, "table", 1, "activity", "recent", "count"),
  component(
    "connection",
    "Conversas por instância",
    false,
    "columns",
    1,
    "conversations",
    "connection",
    "count",
  ),
  component(
    "department",
    "Conversas por departamento",
    false,
    "bars",
    1,
    "conversations",
    "department",
    "count",
  ),
];

export function dashboardGroupingOptions(
  source: DashboardDataSource,
  customFields: Array<{ id: string; label: string }> = [],
): DashboardGroupingOption[] {
  const native = NATIVE_GROUPINGS[source] ?? [];
  if (source !== "contacts") return native;
  return [
    ...native,
    ...customFields.map((field) => ({
      value: `custom:${field.id}`,
      label: field.label,
      section: "custom" as const,
    })),
  ];
}

export function createDashboardComponent(id = dashboardComponentId()): DashboardComponentConfig {
  return component(id, "Novo componente", true, "columns", 1, "conversations", "status", "count");
}

export function duplicateDashboardComponent(
  source: DashboardComponentConfig,
  id = dashboardComponentId(),
): DashboardComponentConfig {
  return { ...source, id, title: `${source.title} (cópia)` };
}

export function reorderDashboardComponents(
  components: DashboardComponentConfig[],
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) return components;
  const sourceIndex = components.findIndex((item) => item.id === sourceId);
  const targetIndex = components.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return components;
  const next = [...components];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function restoreNativeDashboardComponents(components: DashboardComponentConfig[]) {
  const nativeIds = new Set(DEFAULT_DASHBOARD_COMPONENTS.map((component) => component.id));
  const customComponents = components
    .filter((component) => !nativeIds.has(component.id))
    .map((component) => ({ ...component }));

  return [
    ...DEFAULT_DASHBOARD_COMPONENTS.map((component) => ({ ...component })),
    ...customComponents,
  ];
}

export function dashboardColumnClass(columns: DashboardColumnCount) {
  return {
    1: "md:col-span-1",
    2: "md:col-span-2",
    3: "md:col-span-3",
    4: "md:col-span-4",
  }[columns];
}

export function loadDashboardComponents(storageKey: string): DashboardComponentConfig[] {
  if (typeof window === "undefined") return cloneDefaults();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return cloneDefaults();
    return parseDashboardPreferences(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

export function saveDashboardComponents(
  storageKey: string,
  components: DashboardComponentConfig[],
) {
  const preferences: DashboardPreferencesV2 = { version: 2, components };
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}

export function parseDashboardPreferences(value: unknown): DashboardComponentConfig[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (candidate.version === 2 && Array.isArray(candidate.components)) {
      return candidate.components
        .map(normalizeComponent)
        .filter((item): item is DashboardComponentConfig => item !== null);
    }
    return migrateLegacyPreferences(candidate);
  }
  if (Array.isArray(value)) {
    const visible = new Set(value.filter((item): item is string => typeof item === "string"));
    return cloneDefaults().map((item) => ({ ...item, visible: visible.has(item.id) }));
  }
  return cloneDefaults();
}

function migrateLegacyPreferences(value: Record<string, unknown>) {
  const visible = new Set(
    Array.isArray(value.visible)
      ? value.visible.filter((item): item is string => typeof item === "string")
      : DEFAULT_DASHBOARD_COMPONENTS.map((item) => item.id),
  );
  const order = Array.isArray(value.order)
    ? value.order.filter((item): item is string => typeof item === "string")
    : [];
  const labels = isRecord(value.labels) ? value.labels : {};
  const columns = isRecord(value.columns) ? value.columns : {};
  const byId = new Map(
    cloneDefaults().map((item) => [
      item.id,
      {
        ...item,
        visible: visible.has(item.id),
        title:
          typeof labels[item.id] === "string"
            ? String(labels[item.id]).trim() || item.title
            : item.title,
        columns: normalizeColumns(columns[item.id], item.columns),
      },
    ]),
  );
  const normalizedOrder = [
    ...order.filter((id) => byId.has(id)),
    ...DEFAULT_DASHBOARD_COMPONENTS.map((item) => item.id).filter((id) => !order.includes(id)),
  ];
  return normalizedOrder.map((id) => byId.get(id)!);
}

function normalizeComponent(value: unknown): DashboardComponentConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  const dataSource = DASHBOARD_SOURCE_OPTIONS.some((option) => option.value === value.dataSource)
    ? (value.dataSource as DashboardDataSource)
    : "conversations";
  const groups = dashboardGroupingOptions(dataSource);
  const fallbackGroup = groups[0]?.value ?? "status";
  const visualization = DASHBOARD_VISUALIZATIONS.includes(
    value.visualization as DashboardVisualization,
  )
    ? (value.visualization as DashboardVisualization)
    : "columns";
  return {
    id: value.id,
    title:
      typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Componente",
    visible: value.visible !== false,
    visualization,
    columns: normalizeColumns(value.columns, 1),
    dataSource,
    groupBy: typeof value.groupBy === "string" && value.groupBy ? value.groupBy : fallbackGroup,
    valueMode: value.valueMode === "percentage" ? "percentage" : "count",
  };
}

function component(
  id: string,
  title: string,
  visible: boolean,
  visualization: DashboardVisualization,
  columns: DashboardColumnCount,
  dataSource: DashboardDataSource,
  groupBy: string,
  valueMode: DashboardValueMode,
): DashboardComponentConfig {
  return { id, title, visible, visualization, columns, dataSource, groupBy, valueMode };
}

function cloneDefaults() {
  return DEFAULT_DASHBOARD_COMPONENTS.map((item) => ({ ...item }));
}

function normalizeColumns(value: unknown, fallback: DashboardColumnCount): DashboardColumnCount {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function dashboardComponentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
