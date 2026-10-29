import { DashboardDateInput } from "@/components/dashboard-filters";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
  PauseCircle,
  Play,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Select, SearchInput } from "@/components/ui-kit";
import { ConfirmDialog } from "@/components/modal";
import { DashboardComponentRenderer } from "@/components/dashboard-component-renderer";
import { useSession } from "@/lib/session";
import {
  taskManagementApi,
  taskDayBoundary,
  taskLocalDateTime,
  type ManagedTask,
  type TaskListFilters,
} from "@/lib/task-management";
import { TaskWizard } from "./task-wizard";
import { TaskCalendar } from "./task-calendar";
import { TaskHistory } from "./task-history";
import { TaskSettingsPanel } from "./task-settings-panel";
import { TaskError, TaskPager, TaskPriority, TaskStatus } from "./task-ui";
import {
  taskDate,
  taskFrequencyLabels,
  taskPriorityLabels,
  taskStatusLabels,
  taskTypeLabels,
} from "./task-labels";
type View = "dashboard" | "tasks" | "calendar" | "history" | "settings";
type Editor = {
  authorizationScope: string;
  task?: ManagedTask;
  readOnly?: boolean;
  duplicate?: boolean;
};
const views: Array<[View, string]> = [
  ["dashboard", "Dashboard"],
  ["tasks", "Tarefas"],
  ["calendar", "Calendário"],
  ["history", "Histórico"],
  ["settings", "Configurações"],
];

export function TaskManagementPage({
  initialTaskId,
  onTaskLocated,
}: {
  initialTaskId?: string;
  onTaskLocated?: () => void;
}) {
  const user = useSession((state) => state.user);
  const tenantId = user?.empresaId;
  const permissions = user?.permissions ?? [];
  const canRead = permissions.includes("schedules.read"),
    canCreate = permissions.includes("schedules.create"),
    canUpdate = permissions.includes("schedules.update"),
    canDelete = permissions.includes("schedules.delete"),
    canSend = permissions.includes("messages.send");
  const authorizationScope = `${user?.id}:${user?.roleId}:${user?.roleKey}:${user?.role}:${[...permissions].sort().join(",")}`;
  const qc = useQueryClient();
  const base = React.useMemo(
    () => ["trixus", "task-management", tenantId, authorizationScope],
    [tenantId, authorizationScope],
  );
  const capabilities = useQuery({
    queryKey: ["trixus", "task-management", "capabilities", tenantId],
    queryFn: taskManagementApi.capabilities,
    enabled: canRead,
  });
  const enabled = canRead && capabilities.data?.enabled === true;
  const [view, setView] = React.useState<View>("tasks");
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [removing, setRemoving] = React.useState<ManagedTask | null>(null);
  const [filters, setFilters] = React.useState<TaskListFilters>({ page: 1, pageSize: 25 });
  const [cards, setCards] = React.useState(false);
  const options = useQuery({
    queryKey: [...base, "options"],
    queryFn: taskManagementApi.options,
    enabled,
  });
  const fields = useQuery({
    queryKey: [...base, "fields"],
    queryFn: taskManagementApi.filterFields,
    enabled,
  });
  const settings = useQuery({
    queryKey: [...base, "settings"],
    queryFn: taskManagementApi.settings,
    enabled,
  });
  const smtp = useQuery({ queryKey: [...base, "smtp"], queryFn: taskManagementApi.smtp, enabled });
  const summary = useQuery({
    queryKey: [...base, "summary", filters],
    queryFn: () => taskManagementApi.summary({ ...filters, page: undefined, pageSize: undefined }),
    refetchInterval: 30_000,
    enabled,
  });
  const list = useQuery({
    queryKey: [...base, "list", filters],
    queryFn: () => taskManagementApi.list(filters),
    enabled: enabled && view === "tasks",
    refetchInterval: 30_000,
  });
  React.useEffect(() => {
    const last = Math.max(1, list.data?.totalPages ?? 1);
    if (list.data && (filters.page ?? 1) > last)
      setFilters((current) => ({ ...current, page: last }));
  }, [list.data, filters.page]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: base });
  };
  const requests = React.useRef(0);
  const scope = React.useRef(`${tenantId}:${authorizationScope}`);
  if (scope.current !== `${tenantId}:${authorizationScope}`) {
    scope.current = `${tenantId}:${authorizationScope}`;
    requests.current += 1;
  }
  React.useEffect(
    () => () => {
      requests.current += 1;
    },
    [],
  );
  const detail = useMutation({ mutationFn: (id: string) => taskManagementApi.get(id) });
  const openDetail = React.useCallback(
    (id: string, readOnly = true, onLocated?: () => void) => {
      const request = ++requests.current;
      void detail
        .mutateAsync(id)
        .then((task) => {
          if (request === requests.current && task.tenantId === tenantId) {
            setEditor({ task, readOnly, authorizationScope });
            onLocated?.();
          }
        })
        .catch(() => {
          if (request === requests.current) onLocated?.();
        });
    },
    [detail, tenantId, authorizationScope],
  );
  React.useEffect(() => {
    setEditor(null);
    setRemoving(null);
    setFilters({ page: 1, pageSize: 25 });
  }, [tenantId, authorizationScope]);
  const initialOpened = React.useRef("");
  React.useEffect(() => {
    if (!initialTaskId) initialOpened.current = "";
    if (enabled && initialTaskId && initialOpened.current !== `${tenantId}:${initialTaskId}`) {
      initialOpened.current = `${tenantId}:${initialTaskId}`;
      openDetail(initialTaskId, true, onTaskLocated);
    }
  }, [enabled, initialTaskId, openDetail, tenantId, onTaskLocated]);
  const action = useMutation({
    mutationFn: async ({
      task,
      kind,
    }: {
      task: ManagedTask;
      kind: "pause" | "resume" | "complete" | "remove";
    }) => {
      if (kind === "complete") {
        if (!task.nextOccurrenceId) throw Error("Não há ocorrência disponível para concluir.");
        return taskManagementApi.complete(task.nextOccurrenceId);
      }
      if (kind === "remove") return taskManagementApi.remove(task.id);
      return kind === "pause"
        ? taskManagementApi.pause(task.id)
        : taskManagementApi.resume(task.id);
    },
    onSuccess: () => {
      setRemoving(null);
      refresh();
      toast.success("Agendamento atualizado.");
    },
  });
  const setFilter = (patch: Partial<TaskListFilters>) =>
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  const timezone = settings.data?.timezone || options.data?.timezone || "America/Sao_Paulo";
  const ready = options.data && fields.data && settings.data && smtp.data;
  const rows = list.data?.items ?? [];
  const rowActions = (task: ManagedTask) => (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" onClick={() => openDetail(task.id)}>
        Visualizar
      </Button>
      {canUpdate && (
        <>
          <Button size="sm" onClick={() => openDetail(task.id, false)}>
            Editar
          </Button>
          {task.status !== "completed" &&
            !(
              task.status === "paused" &&
              (task.channels.whatsapp.enabled || task.channels.email.enabled) &&
              !canSend
            ) && (
              <Button
                size="sm"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ task, kind: task.status === "paused" ? "resume" : "pause" })
                }
              >
                {task.status === "paused" ? "Retomar" : "Pausar"}
              </Button>
            )}
          {task.nextOccurrenceId && (
            <Button
              size="sm"
              disabled={action.isPending}
              onClick={() => action.mutate({ task, kind: "complete" })}
            >
              Concluir ocorrência
            </Button>
          )}
        </>
      )}
      {canCreate && (
        <Button size="sm" onClick={() => setEditor({ task, duplicate: true, authorizationScope })}>
          Duplicar
        </Button>
      )}
      {canDelete && (
        <Button size="sm" onClick={() => setRemoving(task)}>
          Excluir
        </Button>
      )}
    </div>
  );
  if (!canRead)
    return (
      <Alert tone="destructive" title="Acesso não permitido">
        Seu perfil não permite consultar agendamentos.
      </Alert>
    );
  if (capabilities.isLoading)
    return <p className="text-sm text-muted-foreground">Verificando disponibilidade...</p>;
  if (capabilities.error) return <TaskError error={capabilities.error} />;
  if (!enabled)
    return (
      <Alert tone="info" title="Gestão de Tarefas aguardando ativação">
        A funcionalidade ainda não está habilitada neste ambiente. Os agendamentos existentes
        permanecem preservados.
      </Alert>
    );
  if (editor && editor.authorizationScope === authorizationScope && ready)
    return (
      <TaskWizard
        key={`${editor.task?.id ?? "new"}:${editor.readOnly}:${editor.duplicate}`}
        initial={editor.task}
        readOnly={editor.readOnly}
        duplicate={editor.duplicate}
        options={options.data!}
        fields={fields.data!}
        smtp={smtp.data!}
        settings={settings.data!}
        capabilities={capabilities.data!}
        canSend={canSend}
        onClose={() => setEditor(null)}
        onSaved={() => {
          if (scope.current !== `${tenantId}:${authorizationScope}`) return;
          setEditor(null);
          refresh();
          toast.success("Agendamento salvo.");
        }}
      />
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Agendamentos</h2>
          <p className="text-sm text-muted-foreground">
            Planeje tarefas, lembretes e notificações.
          </p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => setEditor({ authorizationScope })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo agendamento
          </Button>
        )}
      </div>
      <nav
        className="flex flex-wrap gap-1 border-b border-border pb-3"
        aria-label="Gestão de Tarefas"
      >
        {views.map(([value, label]) => (
          <Button
            key={value}
            variant={view === value ? "primary" : "ghost"}
            aria-current={view === value ? "page" : undefined}
            onClick={() => setView(value)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {!capabilities.data?.workerEnabled && (
        <Alert tone="warning" title="Execução automática aguardando ativação">
          Os dados podem ser cadastrados e consultados. Avisos automáticos só serão processados
          quando a execução estiver habilitada.
        </Alert>
      )}
      <TaskError
        error={
          options.error ||
          fields.error ||
          settings.error ||
          smtp.error ||
          summary.error ||
          list.error ||
          detail.error ||
          action.error
        }
      />
      {detail.isPending && <p className="text-sm text-muted-foreground">Carregando tarefa...</p>}
      {(view === "dashboard" || view === "tasks") && (
        <>
          <Card className="min-w-0 p-4">
            <div
              aria-label="Filtros dos agendamentos"
              className="grid min-w-0 grid-cols-2 gap-3 [&>label]:min-w-0 [&>label>span]:mb-1 lg:grid-cols-[minmax(180px,1.5fr)_repeat(4,minmax(128px,1fr))_repeat(2,minmax(132px,1fr))_auto] lg:overflow-x-auto lg:pb-1"
            >
              <Field label="Busca">
                <SearchInput
                  ariaLabel="Busca de tarefas"
                  placeholder="Buscar título ou descrição..."
                  value={filters.search ?? ""}
                  onChange={(search) => setFilter({ search })}
                />
              </Field>
              <Field label="Responsável">
                <Select
                  value={filters.assignedMembershipId ?? ""}
                  onChange={(event) => setFilter({ assignedMembershipId: event.target.value })}
                >
                  <option value="">Todos</option>
                  {options.data?.memberships.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situação">
                <Select
                  value={filters.status ?? ""}
                  onChange={(event) => setFilter({ status: event.target.value })}
                >
                  <option value="">Todas</option>
                  {["active", "paused", "completed"].map((value) => (
                    <option key={value} value={value}>
                      {taskStatusLabels[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prioridade">
                <Select
                  value={filters.priority ?? ""}
                  onChange={(event) => setFilter({ priority: event.target.value })}
                >
                  <option value="">Todas</option>
                  {Object.entries(taskPriorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select
                  value={filters.type ?? ""}
                  onChange={(event) => setFilter({ type: event.target.value })}
                >
                  <option value="">Todos</option>
                  {Object.entries(taskTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dt. Inicial">
                <DashboardDateInput
                  readOnly={false}
                  value={
                    filters.start ? taskLocalDateTime(filters.start, timezone).slice(0, 10) : ""
                  }
                  onChange={(date) =>
                    setFilter({
                      start: date ? taskDayBoundary(date, timezone) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Dt. Final">
                <DashboardDateInput
                  readOnly={false}
                  value={
                    filters.end
                      ? taskLocalDateTime(
                          new Date(Date.parse(filters.end) - 1).toISOString(),
                          timezone,
                        ).slice(0, 10)
                      : ""
                  }
                  onChange={(date) => {
                    const value = date;
                    if (!value) {
                      setFilter({ end: undefined });
                      return;
                    }
                    const next = new Date(`${value}T12:00:00Z`);
                    next.setUTCDate(next.getUTCDate() + 1);
                    setFilter({
                      end: new Date(
                        Date.parse(taskDayBoundary(next.toISOString().slice(0, 10), timezone)) - 1,
                      ).toISOString(),
                    });
                  }}
                />
              </Field>
              <div className="flex items-end">
                <ClearFiltersButton onClick={() => setFilters({ page: 1, pageSize: 25 })} />
              </div>
            </div>
          </Card>
          {summary.data && (
            <div
              aria-label="Indicadores dos agendamentos"
              className="grid min-w-0 grid-flow-col auto-cols-[minmax(140px,1fr)] gap-3 overflow-x-auto pb-1"
            >
              {(view === "tasks"
                ? [
                    ["Ativos", summary.data.active, Play, "bg-success/5"],
                    ["Hoje", summary.data.today, CalendarClock, "bg-info/5"],
                    ["Pausados", summary.data.paused, PauseCircle, "bg-warning/5"],
                    ["Concluídos", summary.data.completed, CheckCircle2, "bg-primary/5"],
                  ]
                : [
                    ["Total", summary.data.total, CalendarClock, "bg-primary/5"],
                    ["Pendentes", summary.data.pending, Clock, "bg-warning/5"],
                    ["Em andamento", summary.data.inProgress, Play, "bg-info/5"],
                    ["Atrasadas", summary.data.overdue, Clock, "bg-destructive/5"],
                    ["Concluídas", summary.data.completed, CheckCircle2, "bg-success/5"],
                    ["Recorrentes", summary.data.recurring, CalendarClock, "bg-primary/5"],
                  ]
              ).map(([label, value, Icon, color]) => {
                const Component = Icon as React.ComponentType<{ className?: string }>;
                return (
                  <Card key={String(label)} className={String(color)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase text-muted-foreground">
                        {String(label)}
                      </span>
                      <Component className="h-4 w-4" />
                    </div>
                    <strong className="mt-3 block font-mono text-2xl">
                      {typeof value === "number" ? value : "—"}
                    </strong>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      {view === "dashboard" && summary.data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardComponentRenderer
              title="Tarefas por situação"
              visualization="columns"
              columns={1}
              valueMode="count"
              data={summary.data.byStatus.map((item) => ({
                nome: taskStatusLabels[item.name] ?? item.name,
                total: item.total,
              }))}
            />
            <DashboardComponentRenderer
              title="Tarefas por prioridade"
              visualization="bars"
              columns={1}
              valueMode="count"
              data={summary.data.byPriority.map((item) => ({
                nome: taskPriorityLabels[item.name] ?? item.name,
                total: item.total,
              }))}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["Próximas tarefas", summary.data.upcoming],
                ["Tarefas atrasadas", summary.data.overdueTasks],
              ] as const
            ).map(([title, tasks]) => (
              <Card key={title}>
                <h3 className="mb-3 font-semibold">{title}</h3>
                <ul className="divide-y divide-border">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <button className="text-left" onClick={() => openDetail(task.id)}>
                        <span className="block text-sm font-medium">{task.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {taskDate(task.nextDueAt, task.recurrence.timezone)}
                        </span>
                      </button>
                      <TaskPriority value={task.priority} />
                    </li>
                  ))}
                </ul>
                {!tasks.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa neste grupo.</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
      {view === "tasks" && (
        <>
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              aria-label="Visualizar em lista"
              variant={!cards ? "primary" : "outline"}
              onClick={() => setCards(false)}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              aria-label="Visualizar em cards"
              variant={cards ? "primary" : "outline"}
              onClick={() => setCards(true)}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          {cards ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((task) => (
                <Card key={task.id}>
                  <h3 className="font-semibold">{task.title}</h3>
                  <div className="my-3 flex flex-wrap gap-2">
                    <TaskPriority value={task.priority} />
                    <TaskStatus value={task.status} />
                  </div>
                  <p className="text-sm">
                    {task.assignedName ||
                      options.data?.memberships.find(
                        (item) => item.id === task.assignedMembershipId,
                      )?.name ||
                      "—"}
                  </p>
                  <p className="my-2 text-xs text-muted-foreground">
                    {taskDate(task.nextDueAt, task.recurrence.timezone)} ·{" "}
                    {taskFrequencyLabels[task.recurrence.frequency]}
                  </p>
                  {rowActions(task)}
                </Card>
              ))}
            </div>
          ) : (
            <Card padding={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-surface-2">
                    <tr>
                      {[
                        "Título",
                        "Responsável",
                        "Prioridade",
                        "Situação",
                        "Periodicidade",
                        "Próxima execução",
                        "Vínculos",
                        "Ações",
                      ].map((label) => (
                        <th key={label} className="p-3 text-xs font-medium uppercase">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((task) => (
                      <tr key={task.id} className="border-t border-border">
                        <td className="p-3">
                          <span className="block font-medium">{task.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {taskTypeLabels[task.type]}
                          </span>
                        </td>
                        <td className="p-3">{task.assignedName || "—"}</td>
                        <td className="p-3">
                          <TaskPriority value={task.priority} />
                        </td>
                        <td className="p-3">
                          <TaskStatus value={task.status} />
                        </td>
                        <td className="p-3">{taskFrequencyLabels[task.recurrence.frequency]}</td>
                        <td className="p-3">
                          {taskDate(task.nextDueAt, task.recurrence.timezone)}
                        </td>
                        <td className="p-3">
                          {task.audience.mode === "filters"
                            ? "Por filtros"
                            : `${task.audience.contactIds.length} contato(s), ${task.audience.groupIds.length} grupo(s)`}
                        </td>
                        <td className="p-3">{rowActions(task)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {list.isLoading ? (
            <p className="text-sm">Carregando tarefas...</p>
          ) : (
            !rows.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma tarefa encontrada.
              </p>
            )
          )}
          {list.data && (
            <TaskPager
              page={filters.page ?? 1}
              totalPages={list.data.totalPages}
              total={list.data.total}
              pageSize={filters.pageSize ?? 25}
              onPage={(page) => setFilter({ page })}
              onPageSize={(pageSize) => setFilter({ pageSize })}
            />
          )}
        </>
      )}
      {view === "calendar" && (
        <TaskCalendar
          key={`${tenantId}:${authorizationScope}`}
          memberships={options.data?.memberships ?? []}
          timezone={timezone}
          onView={openDetail}
          canUpdate={canUpdate}
          tenantId={tenantId}
          authorizationScope={authorizationScope}
        />
      )}
      {view === "history" && (
        <TaskHistory
          key={`${tenantId}:${authorizationScope}`}
          memberships={options.data?.memberships ?? []}
          timezone={timezone}
          tenantId={tenantId}
          authorizationScope={authorizationScope}
          onView={openDetail}
        />
      )}
      {view === "settings" && settings.data && smtp.data && (
        <TaskSettingsPanel
          key={`${tenantId}:${authorizationScope}`}
          settings={settings.data}
          smtp={smtp.data}
          capabilities={capabilities.data!}
          canUpdate={canUpdate}
          canSend={canSend}
          onChanged={refresh}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title="Excluir tarefa?"
        description="A tarefa será arquivada. O histórico de execuções será preservado."
        confirmLabel="Excluir"
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          action.mutateAsync({ task: removing!, kind: "remove" }).then(() => undefined)
        }
      />
    </div>
  );
}
