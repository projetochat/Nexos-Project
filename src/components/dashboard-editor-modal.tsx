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
  Pencil,
  RotateCcw,
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
  type DashboardGroupingOption,
  type DashboardVisualization,
  type DashboardValueMode,
} from "@/lib/dashboard-components";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";

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
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  sourceOptions = DASHBOARD_SOURCE_OPTIONS,
  groupingOptions = dashboardGroupingOptions,
  createComponent = createDashboardComponent,
  restoreComponents = restoreNativeDashboardComponents,
  nativeComponentIds,
}: {
  open: boolean;
  components: DashboardComponentConfig[];
  customFields: Array<{ id: string; label: string }>;
  resolveData: (config: DashboardComponentConfig) => DashboardVisualDatum[];
  renderPreview?: (config: DashboardComponentConfig) => React.ReactNode;
  onPreviewConfigChange?: (config: DashboardComponentConfig | null) => void;
  onChange: (components: DashboardComponentConfig[]) => void;
  onClose: () => void;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  sourceOptions?: Array<{ value: DashboardDataSource; label: string }>;
  groupingOptions?: (
    source: DashboardDataSource,
    customFields: Array<{ id: string; label: string }>,
  ) => DashboardGroupingOption[];
  createComponent?: () => DashboardComponentConfig;
  restoreComponents?: (components: DashboardComponentConfig[]) => DashboardComponentConfig[];
  nativeComponentIds?: ReadonlySet<string>;
}) {
  const [draft, setDraft] = React.useState(components);
  const [configuring, setConfiguring] = React.useState<DashboardComponentConfig | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DashboardComponentConfig | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const touchDraggingId = React.useRef<string | null>(null);
  const dragBlockedByControl = React.useRef(false);
  const protectedComponentIds = nativeComponentIds ?? DEFAULT_DASHBOARD_COMPONENT_IDS;

  React.useEffect(() => {
    if (!open) return;
    setDraft(components.map((item) => ({ ...item })));
    setConfiguring(null);
    setCreating(false);
    setDeleting(null);
    setRestoring(false);
  }, [components, open]);

  const apply = React.useCallback((next: DashboardComponentConfig[]) => setDraft(next), []);

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
    if (!canUpdate) return;
    const index = draft.findIndex((item) => item.id === id);
    const target = draft[index + direction];
    if (index < 0 || !target) return;
    apply(reorderDashboardComponents(draft, id, target.id));
  };

  const restoreDefaults = () => {
    const restored = restoreComponents(draft);
    setDraft(restored);
    onChange(restored);
    onClose();
  };

  const reorder = (sourceId: string, targetId: string) => {
    if (!canUpdate || sourceId === targetId) return;
    const next = reorderDashboardComponents(draft, sourceId, targetId);
    if (next !== draft) apply(next);
  };

  return (
    <>
      <Modal
        open={open && !configuring}
        onClose={onClose}
        title="Configuração de Dashboards"
        description="Arraste e solte para definir a posição dos componentes."
        size="xl"
        className="sm:max-w-5xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {canUpdate ? (
              <Button variant="ghost" onClick={() => setRestoring(true)}>
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </Button>
            ) : (
              <span />
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="save-action-button"
                onClick={() => {
                  onChange(draft);
                  onClose();
                }}
              >
                Salvar
              </Button>
            </div>
          </div>
        }
      >
        {canCreate && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => openConfiguration(createComponent(), true)}>
              <Plus className="h-4 w-4" />
              Novo componente
            </Button>
          </div>
        )}

        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Componentes do dashboard"
        >
          {draft.map((component, index) => {
            const Icon = VISUALIZATION_ICONS[component.visualization];
            return (
              <div
                key={component.id}
                data-dashboard-component-id={component.id}
                role={canUpdate ? "group" : undefined}
                tabIndex={canUpdate ? 0 : undefined}
                draggable={canUpdate}
                aria-label={canUpdate ? `Reordenar ${component.title}` : undefined}
                onPointerDownCapture={(event) => {
                  dragBlockedByControl.current = Boolean(
                    (event.target as HTMLElement).closest("[data-dashboard-interactive]"),
                  );
                }}
                onDragStart={(event) => {
                  if (!canUpdate || dragBlockedByControl.current) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", component.id);
                  setDraggingId(component.id);
                }}
                onDragOver={(event) => {
                  if (canUpdate) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canUpdate) return;
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  reorder(sourceId, component.id);
                  setDraggingId(null);
                }}
                onDragEnd={() => {
                  dragBlockedByControl.current = false;
                  setDraggingId(null);
                }}
                onPointerDown={(event) => {
                  if (
                    !canUpdate ||
                    event.pointerType === "mouse" ||
                    (event.target as HTMLElement).closest("[data-dashboard-interactive]")
                  )
                    return;
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
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  dragBlockedByControl.current = false;
                  touchDraggingId.current = null;
                  setDraggingId(null);
                }}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  dragBlockedByControl.current = false;
                  touchDraggingId.current = null;
                  setDraggingId(null);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "ArrowUp") moveComponent(component.id, -1);
                  if (event.key === "ArrowDown") moveComponent(component.id, 1);
                }}
                className={`grid min-h-32 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[1fr_auto] gap-x-3 gap-y-3 rounded-xl border border-border bg-surface-1 p-3 transition hover:border-primary/30 hover:bg-surface-2 ${
                  canUpdate
                    ? "touch-none cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
                    : ""
                } ${draggingId === component.id ? "opacity-50" : ""}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-9 sm:w-9">
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{component.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {VISUALIZATION_LABELS[component.visualization]} · {component.columns} coluna
                    {component.columns > 1 ? "s" : ""}
                  </p>
                </div>

                {canUpdate ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none self-start text-muted-foreground"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                ) : (
                  <span />
                )}

                <div className="col-span-3 flex items-center border-t border-border pt-3">
                  <span className="mr-auto font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <span data-dashboard-interactive>
                    <Switch
                      aria-label={`Exibir ${component.title}`}
                      checked={component.visible}
                      disabled={!canUpdate}
                      onCheckedChange={(visible) =>
                        apply(
                          draft.map((item) =>
                            item.id === component.id ? { ...item, visible } : item,
                          ),
                        )
                      }
                    />
                  </span>
                  <div data-dashboard-interactive className="ml-2 flex shrink-0 gap-1.5">
                    {canCreate && (
                      <IconButton
                        label="Duplicar"
                        ariaLabel={`Duplicar ${component.title}`}
                        primary
                        onClick={() =>
                          openConfiguration(duplicateDashboardComponent(component), true)
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </IconButton>
                    )}
                    {canDelete && !protectedComponentIds.has(component.id) && (
                      <IconButton
                        label="Excluir"
                        ariaLabel={`Excluir ${component.title}`}
                        destructive
                        onClick={() => setDeleting(component)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    )}
                    {canUpdate && (
                      <IconButton
                        label="Editar"
                        ariaLabel={`Editar ${component.title}`}
                        onClick={() => openConfiguration(component)}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                  </div>
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
        sourceOptions={sourceOptions}
        groupingOptions={groupingOptions}
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
        open={restoring}
        title="Restaurar padrão?"
        description={
          <div className="space-y-2">
            <p>Tem certeza de que deseja restaurar o dashboard?</p>
            <div>
              <p>Esta ação irá restaurar:</p>
              <ul className="list-disc pl-5">
                <li>A ordem dos componentes.</li>
                <li>Os tipos de visualização dos BIs nativos.</li>
                <li>As configurações padrão dos componentes.</li>
              </ul>
            </div>
          </div>
        }
        confirmLabel="Restaurar padrão"
        destructive
        onConfirm={restoreDefaults}
        onClose={() => setRestoring(false)}
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
          if (deleting && !protectedComponentIds.has(deleting.id)) {
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
  sourceOptions,
  groupingOptions,
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
  sourceOptions: Array<{ value: DashboardDataSource; label: string }>;
  groupingOptions: (
    source: DashboardDataSource,
    customFields: Array<{ id: string; label: string }>,
  ) => DashboardGroupingOption[];
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
  const availableGroupings = groupingOptions(draft.dataSource, customFields);
  const nativeOptions = availableGroupings.filter((option) => option.section === "native");
  const customOptions = availableGroupings.filter((option) => option.section === "custom");
  const groupAvailable = availableGroupings.some((option) => option.value === draft.groupBy);
  const previewData = resolveData(draft);

  const patch = (changes: Partial<DashboardComponentConfig>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const chooseSource = (dataSource: DashboardDataSource) => {
    const firstGroup = groupingOptions(dataSource, customFields)[0]?.value ?? "";
    patch({ dataSource, groupBy: firstGroup, valueMode: "count" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurar Componente"
      size="xl"
      className="md:max-w-[57.6rem]"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className={!creating ? "save-action-button" : undefined}
            disabled={!groupAvailable}
            onClick={() => {
              const title = draft.title.trim();
              if (!title) {
                setError("Informe o título do componente.");
                showRequiredFieldsToast(["Título do componente"]);
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

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:gap-3">
        <div className="min-w-0" data-dashboard-component-title-field>
          <Field label="Título do componente *">
            <Input
              required
              aria-invalid={!!error}
              className={requiredFieldClassName(Boolean(error))}
              value={draft.title}
              onChange={(event) => {
                patch({ title: event.target.value });
                if (error) setError("");
              }}
            />
          </Field>
        </div>
        <label
          className="flex min-h-10 flex-col items-start justify-end gap-1 pb-0.5 text-sm font-medium text-foreground sm:flex-row sm:items-center sm:gap-2"
          data-dashboard-mobile-visibility-control
        >
          <span className="sm:order-2">Visível</span>
          <Switch
            className="sm:order-1"
            aria-label={`Alterar visibilidade de ${draft.title}`}
            checked={draft.visible}
            onCheckedChange={(visible) => patch({ visible })}
          />
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
        <div
          className="grid min-w-0 grid-cols-2 gap-3 lg:block lg:space-y-3"
          data-dashboard-mobile-config-grid
        >
          <div className="min-w-0">
            <Field label="Quantidade de colunas">
              <Select
                value={draft.columns}
                onChange={(event) =>
                  patch({ columns: Number(event.target.value) as 1 | 2 | 3 | 4 })
                }
              >
                <option value={1}>1 coluna (25%)</option>
                <option value={2}>2 colunas (50%)</option>
                <option value={3}>3 colunas (75%)</option>
                <option value={4}>4 colunas (100%)</option>
              </Select>
            </Field>
          </div>

          <div className="min-w-0">
            <Field label="Fonte de dados">
              <Select
                value={draft.dataSource}
                onChange={(event) => chooseSource(event.target.value as DashboardDataSource)}
              >
                {sourceOptions.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-0">
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
          </div>

          <div className="min-w-0">
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
        </div>

        <section
          className="grid h-80 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-surface-1 p-3 lg:h-auto"
          aria-label="Preview"
          data-dashboard-mobile-preview
        >
          <h3 className="mb-2 text-sm font-semibold text-foreground">Preview</h3>
          <div className="min-h-0 min-w-0 overflow-auto">
            {renderPreview?.(draft) ?? (
              <DashboardComponentRenderer
                visualization={draft.visualization}
                columns={draft.columns}
                valueMode={draft.valueMode}
                data={previewData}
                compact
              />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function IconButton({
  label,
  ariaLabel,
  destructive = false,
  primary = false,
  children,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  destructive?: boolean;
  primary?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 transition ${
        destructive
          ? "text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          : primary
            ? "text-primary hover:border-primary/40 hover:bg-primary/10"
            : "text-foreground hover:border-primary/30 hover:bg-muted hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}
