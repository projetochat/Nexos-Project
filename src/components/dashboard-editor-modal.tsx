import * as React from "react";
import {
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  Copy,
  Gauge,
  GripVertical,
  Info,
  LayoutGrid,
  Plus,
  RotateCcw,
  Settings,
  Table2,
  Trash2,
} from "lucide-react";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  DashboardComponentRenderer,
  type DashboardVisualDatum,
} from "@/components/dashboard-component-renderer";
import { Switch } from "@/components/ui/switch";
import { Button, Field, Input, Select } from "@/components/ui-kit";
import {
  DASHBOARD_SOURCE_OPTIONS,
  DASHBOARD_VISUALIZATIONS,
  DEFAULT_DASHBOARD_COMPONENTS,
  createDashboardComponent,
  dashboardGroupingOptions,
  duplicateDashboardComponent,
  reorderDashboardComponents,
  restoreNativeDashboardComponents,
  type DashboardComponentConfig,
  type DashboardDataSource,
  type DashboardVisualization,
  type DashboardValueMode,
} from "@/lib/dashboard-components";

const VISUALIZATION_LABELS: Record<DashboardVisualization, string> = {
  columns: "Colunas",
  bars: "Barras",
  line: "Linha",
  pie: "Pizza",
  donut: "Donut",
  gauge: "Gauge",
  table: "Tabela",
  cards: "Cards",
};

const DEFAULT_DASHBOARD_COMPONENT_IDS = new Set(
  DEFAULT_DASHBOARD_COMPONENTS.map((component) => component.id),
);

function DonutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path
        d="M12 4a8 8 0 0 1 7.6 5.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const VISUALIZATION_ICONS = {
  columns: ChartColumn,
  bars: ChartBar,
  line: ChartLine,
  pie: ChartPie,
  donut: DonutIcon,
  gauge: Gauge,
  table: Table2,
  cards: LayoutGrid,
} satisfies Record<DashboardVisualization, React.ComponentType<{ className?: string }>>;

export function DashboardEditorModal({
  open,
  components,
  customFields,
  resolveData,
  renderPreview,
  onPreviewConfigChange,
  onChange,
  onClose,
  canManage = true,
  canDelete = true,
}: {
  open: boolean;
  components: DashboardComponentConfig[];
  customFields: Array<{ id: string; label: string }>;
  resolveData: (config: DashboardComponentConfig) => DashboardVisualDatum[];
  renderPreview?: (config: DashboardComponentConfig) => React.ReactNode;
  onPreviewConfigChange?: (config: DashboardComponentConfig | null) => void;
  onChange: (components: DashboardComponentConfig[]) => void;
  onClose: () => void;
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const [draft, setDraft] = React.useState(components);
  const [configuring, setConfiguring] = React.useState<DashboardComponentConfig | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DashboardComponentConfig | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const touchDraggingId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(components.map((item) => ({ ...item })));
    setConfiguring(null);
    setCreating(false);
    setDeleting(null);
  }, [components, open]);

  const apply = React.useCallback(
    (next: DashboardComponentConfig[]) => {
      setDraft(next);
      onChange(next);
    },
    [onChange],
  );

  const openConfiguration = (component: DashboardComponentConfig, isNew = false) => {
    setConfiguring({ ...component });
    setCreating(isNew);
  };

  const saveConfiguration = (component: DashboardComponentConfig) => {
    const next = creating
      ? [...draft, component]
      : draft.map((item) => (item.id === component.id ? component : item));
    apply(next);
    setConfiguring(null);
    setCreating(false);
  };

  const moveComponent = (id: string, direction: -1 | 1) => {
    if (!canManage) return;
    const index = draft.findIndex((item) => item.id === id);
    const target = draft[index + direction];
    if (index < 0 || !target) return;
    apply(reorderDashboardComponents(draft, id, target.id));
  };

  const restoreDefaults = () => {
    apply(restoreNativeDashboardComponents(draft));
    onClose();
  };

  const reorder = (sourceId: string, targetId: string) => {
    if (!canManage || sourceId === targetId) return;
    const next = reorderDashboardComponents(draft, sourceId, targetId);
    if (next !== draft) apply(next);
  };

  return (
    <>
      <Modal
        open={open && !configuring}
        onClose={onClose}
        title="Editar Dashboard"
        size="xl"
        className="sm:max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {canManage ? (
              <Button variant="ghost" onClick={restoreDefaults}>
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        }
      >
        {canManage && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => openConfiguration(createDashboardComponent(), true)}>
              <Plus className="h-4 w-4" />
              Novo componente
            </Button>
          </div>
        )}

        <div className="space-y-2" aria-label="Componentes do dashboard">
          {draft.map((component, index) => {
            const Icon = VISUALIZATION_ICONS[component.visualization];
            return (
              <div
                key={component.id}
                data-dashboard-component-id={component.id}
                onDragOver={(event) => {
                  if (canManage) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canManage) return;
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  reorder(sourceId, component.id);
                  setDraggingId(null);
                }}
                onDragEnd={() => setDraggingId(null)}
                className={`flex min-h-14 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2 transition ${
                  draggingId === component.id ? "opacity-50" : ""
                }`}
              >
                {canManage ? (
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    aria-label={`Reordenar ${component.title}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", component.id);
                      setDraggingId(component.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      touchDraggingId.current = component.id;
                      setDraggingId(component.id);
                    }}
                    onPointerMove={(event) => {
                      if (event.pointerType === "mouse" || touchDraggingId.current !== component.id)
                        return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-dashboard-component-id]")
                        ?.dataset.dashboardComponentId;
                      if (target) reorder(component.id, target);
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "mouse") {
                        touchDraggingId.current = null;
                        setDraggingId(null);
                      }
                    }}
                    onPointerCancel={() => {
                      touchDraggingId.current = null;
                      setDraggingId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveComponent(component.id, -1);
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveComponent(component.id, 1);
                      }
                    }}
                    className="flex shrink-0 touch-none cursor-grab items-center gap-2 rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                    <span className="w-5 text-center font-mono text-xs">{index + 1}</span>
                  </div>
                ) : (
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                )}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{component.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {VISUALIZATION_LABELS[component.visualization]} · {component.columns} coluna
                    {component.columns > 1 ? "s" : ""}
                  </p>
                </div>

                <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Switch
                    aria-label={`Exibir ${component.title}`}
                    checked={component.visible}
                    disabled
                  />
                  Visível
                </label>

                <div className="ml-auto flex shrink-0 gap-1.5">
                  {canManage && (
                    <IconButton
                      label="Duplicar"
                      ariaLabel={`Duplicar ${component.title}`}
                      onClick={() =>
                        openConfiguration(duplicateDashboardComponent(component), true)
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  )}
                  {canDelete && !DEFAULT_DASHBOARD_COMPONENT_IDS.has(component.id) && (
                    <IconButton
                      label="Excluir"
                      ariaLabel={`Excluir ${component.title}`}
                      destructive
                      onClick={() => setDeleting(component)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                  {canManage && (
                    <IconButton
                      label="Configurar"
                      ariaLabel={`Configurar ${component.title}`}
                      onClick={() => openConfiguration(component)}
                    >
                      <Settings className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </div>
            );
          })}

          {draft.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhum componente configurado. Use “Novo componente” para começar.
            </div>
          )}
        </div>
      </Modal>

      <DashboardComponentConfigModal
        open={!!configuring}
        value={configuring}
        creating={creating}
        customFields={customFields}
        resolveData={resolveData}
        renderPreview={renderPreview}
        onPreviewConfigChange={onPreviewConfigChange}
        onClose={() => {
          setConfiguring(null);
          setCreating(false);
        }}
        onSave={saveConfiguration}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir componente"
        description={
          deleting
            ? `Deseja excluir “${deleting.title}” do Dashboard? Esta ação removerá apenas este componente.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (deleting && !DEFAULT_DASHBOARD_COMPONENT_IDS.has(deleting.id)) {
            apply(draft.filter((item) => item.id !== deleting.id));
          }
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function DashboardComponentConfigModal({
  open,
  value,
  creating,
  customFields,
  resolveData,
  renderPreview,
  onPreviewConfigChange,
  onSave,
  onClose,
}: {
  open: boolean;
  value: DashboardComponentConfig | null;
  creating: boolean;
  customFields: Array<{ id: string; label: string }>;
  resolveData: (config: DashboardComponentConfig) => DashboardVisualDatum[];
  renderPreview?: (config: DashboardComponentConfig) => React.ReactNode;
  onPreviewConfigChange?: (config: DashboardComponentConfig | null) => void;
  onSave: (component: DashboardComponentConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<DashboardComponentConfig | null>(value);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setDraft(value ? { ...value } : null);
    setError("");
  }, [value]);

  React.useEffect(() => {
    onPreviewConfigChange?.(open ? draft : null);
    return () => onPreviewConfigChange?.(null);
  }, [draft, onPreviewConfigChange, open]);

  if (!draft) return null;
  const groupingOptions = dashboardGroupingOptions(draft.dataSource, customFields);
  const nativeOptions = groupingOptions.filter((option) => option.section === "native");
  const customOptions = groupingOptions.filter((option) => option.section === "custom");
  const groupAvailable = groupingOptions.some((option) => option.value === draft.groupBy);
  const previewData = resolveData(draft);

  const patch = (changes: Partial<DashboardComponentConfig>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const chooseSource = (dataSource: DashboardDataSource) => {
    const firstGroup = dashboardGroupingOptions(dataSource, customFields)[0]?.value ?? "";
    patch({ dataSource, groupBy: firstGroup, valueMode: "count" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurar Componente"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!groupAvailable}
            onClick={() => {
              const title = draft.title.trim();
              if (!title) {
                setError("Informe o título do componente.");
                return;
              }
              onSave({ ...draft, title });
            }}
          >
            {creating ? "Criar" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs text-info">
        <Info className="h-5 w-5 shrink-0" />
        <span>Todos os componentes criados respeitam o painel de filtro do dashboard.</span>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <Field label="Título do componente *" error={error}>
          <Input
            required
            aria-invalid={!!error}
            value={draft.title}
            onChange={(event) => {
              patch({ title: event.target.value });
              if (error) setError("");
            }}
          />
        </Field>
        <label className="flex min-h-10 items-center gap-2 pb-0.5 text-sm font-medium text-foreground">
          <Switch
            aria-label={`Alterar visibilidade de ${draft.title}`}
            checked={draft.visible}
            onCheckedChange={(visible) => patch({ visible })}
          />
          Visível
        </label>
      </div>

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          Tipo de visualização
        </legend>
        <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-8">
          {DASHBOARD_VISUALIZATIONS.map((visualization) => {
            const Icon = VISUALIZATION_ICONS[visualization];
            const selected = draft.visualization === visualization;
            return (
              <button
                key={visualization}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ visualization })}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] transition sm:text-xs ${
                  selected
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-surface-1 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {VISUALIZATION_LABELS[visualization]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Field label="Quantidade de colunas">
            <Select
              value={draft.columns}
              onChange={(event) => patch({ columns: Number(event.target.value) as 1 | 2 | 3 | 4 })}
            >
              <option value={1}>1 coluna (25%)</option>
              <option value={2}>2 colunas (50%)</option>
              <option value={3}>3 colunas (75%)</option>
              <option value={4}>4 colunas (100%)</option>
            </Select>
          </Field>

          <Field label="Fonte de dados">
            <Select
              value={draft.dataSource}
              onChange={(event) => chooseSource(event.target.value as DashboardDataSource)}
            >
              {DASHBOARD_SOURCE_OPTIONS.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Campo agrupador"
            error={groupAvailable ? undefined : "Este campo não está mais disponível."}
          >
            <Select
              value={draft.groupBy}
              onChange={(event) => patch({ groupBy: event.target.value })}
            >
              {!groupAvailable && (
                <option value={draft.groupBy} disabled>
                  Campo indisponível
                </option>
              )}
              <optgroup label="Campos nativos">
                {nativeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {customOptions.length > 0 && (
                <optgroup label="Campos personalizados">
                  {customOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>

          <Field label="Campo p/ valor">
            <Select
              value={draft.valueMode}
              onChange={(event) => patch({ valueMode: event.target.value as DashboardValueMode })}
            >
              <option value="count">Quantidade (∑)</option>
              <option value="percentage">Percentual (%)</option>
            </Select>
          </Field>
        </div>

        <section
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-1 p-3"
          aria-label="Preview"
        >
          <h3 className="mb-2 text-sm font-semibold text-foreground">Preview</h3>
          {renderPreview?.(draft) ?? (
            <DashboardComponentRenderer
              visualization={draft.visualization}
              columns={draft.columns}
              valueMode={draft.valueMode}
              data={previewData}
              compact
            />
          )}
        </section>
      </div>
    </Modal>
  );
}

function IconButton({
  label,
  ariaLabel,
  destructive = false,
  children,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  destructive?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition ${
        destructive ? "hover:text-destructive" : "hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
