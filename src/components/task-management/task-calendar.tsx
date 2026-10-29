import { DashboardDateInput } from "@/components/dashboard-filters";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Select, SearchInput } from "@/components/ui-kit";
import { taskManagementApi, taskDayBoundary, taskLocalDateTime } from "@/lib/task-management";
import { TaskError, TaskPriority } from "./task-ui";
import { taskDate } from "./task-labels";
const civil = (date: Date) => date.toISOString().slice(0, 10);
export function TaskCalendar({
  timezone,
  onView,
  canUpdate,
  tenantId,
  authorizationScope,
  memberships,
}: {
  timezone: string;
  onView: (id: string) => void;
  canUpdate: boolean;
  tenantId?: string;
  authorizationScope?: string;
  memberships: Array<{ id: string; name: string }>;
}) {
  const [search, setSearch] = React.useState("");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [mode, setMode] = React.useState<"month" | "week" | "day">("month");
  const [anchor, setAnchor] = React.useState(
    () =>
      new Date(`${taskLocalDateTime(new Date().toISOString(), timezone).slice(0, 10)}T00:00:00Z`),
  );
  const dates = React.useMemo(() => {
    const first = new Date(anchor);
    if (mode === "month") first.setUTCDate(1);
    if (mode !== "day") first.setUTCDate(first.getUTCDate() - first.getUTCDay());
    const count = mode === "month" ? 42 : mode === "week" ? 7 : 1;
    return Array.from({ length: count }, (_, index) => {
      const next = new Date(first);
      next.setUTCDate(next.getUTCDate() + index);
      return next;
    });
  }, [anchor, mode]);
  const range = React.useMemo(() => {
    const end = new Date(dates.at(-1)!);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      start: taskDayBoundary(civil(dates[0]), timezone),
      end: new Date(Date.parse(taskDayBoundary(civil(end), timezone)) - 1).toISOString(),
    };
  }, [dates, timezone]);
  const queryFilters = {
    ...range,
    search: search || undefined,
    assignedMembershipId: assignedMembershipId || undefined,
    channel: (channel as "popup" | "bell" | "whatsapp" | "email") || undefined,
    status: status || undefined,
  };
  const qc = useQueryClient();
  const occurrences = useQuery({
    queryKey: ["trixus", "task-management", tenantId, authorizationScope, "calendar", queryFilters],
    refetchInterval: 30_000,
    queryFn: async () => {
      const first = await taskManagementApi.occurrences({
        ...queryFilters,
        pageSize: 100,
        page: 1,
      });
      const items = [...first.items];
      for (let page = 2; page <= Math.min(first.totalPages, 20); page++) {
        const next = await taskManagementApi.occurrences({ ...queryFilters, pageSize: 100, page });
        items.push(...next.items);
      }
      return { ...first, items };
    },
  });
  const materialize = useMutation({
    mutationFn: () => taskManagementApi.materialize(range),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["trixus", "task-management", tenantId, authorizationScope, "calendar"],
      }),
  });
  const shift = (direction: number) =>
    setAnchor((current) => {
      const next = new Date(current);
      if (mode === "month") {
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + direction);
      } else next.setUTCDate(next.getUTCDate() + direction * (mode === "week" ? 7 : 1));
      return next;
    });
  const items = occurrences.data?.items ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid min-w-0 grid-cols-2 gap-3 [&>label]:min-w-0 [&>label>span]:mb-1 lg:grid-cols-[minmax(180px,1.5fr)_repeat(3,minmax(128px,1fr))_auto] lg:overflow-x-auto lg:pb-1">
          <Field label="Busca">
            <SearchInput
              ariaLabel="Buscar no calendário"
              value={search}
              placeholder="Título ou destinatário..."
              onChange={setSearch}
            />
          </Field>
          <Field label="Responsável">
            <Select
              value={assignedMembershipId}
              onChange={(event) => setAssignedMembershipId(event.target.value)}
            >
              <option value="">Todos</option>
              {memberships.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal">
            <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="">Todos</option>
              {[
                ["popup", "Popup interno"],
                ["bell", "Sino do TRIXUS"],
                ["whatsapp", "WhatsApp"],
                ["email", "E-mail"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todas</option>
              {[
                ["pending", "Pendente"],
                ["processing", "Em processamento"],
                ["completed", "Concluído"],
                ["failed", "Falhou"],
                ["cancelled", "Cancelado"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setAssignedMembershipId("");
                setChannel("");
                setStatus("");
              }}
            />
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button aria-label="Período anterior" onClick={() => shift(-1)}>
            Anterior
          </Button>
          <Button aria-label="Próximo período" onClick={() => shift(1)}>
            Próximo
          </Button>
          <Button
            onClick={() =>
              setAnchor(
                new Date(
                  `${taskLocalDateTime(new Date().toISOString(), timezone).slice(0, 10)}T00:00:00Z`,
                ),
              )
            }
          >
            Hoje
          </Button>
          <h3 className="text-sm font-semibold">
            {anchor.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h3>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["month", "Mês"],
              ["week", "Semana"],
              ["day", "Dia"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={mode === value ? "primary" : "outline"}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <TaskError error={occurrences.error || materialize.error} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card padding={false} className="overflow-x-auto">
          <div className={mode === "day" ? "min-w-0" : "min-w-[700px]"}>
            {mode !== "day" && (
              <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-medium">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                  <div key={day} className="p-2">
                    {day}
                  </div>
                ))}
              </div>
            )}
            <div className={mode === "day" ? "grid grid-cols-1" : "grid grid-cols-7"}>
              {dates.map((date) => {
                const key = civil(date);
                const dayItems = items.filter((item) =>
                  taskLocalDateTime(item.dueAt, timezone).startsWith(key),
                );
                return (
                  <div
                    key={key}
                    className={`min-h-32 border-b border-r border-border p-2 ${date.getUTCMonth() === anchor.getUTCMonth() ? "" : "bg-surface-2/50 text-muted-foreground"}`}
                  >
                    <span className="text-xs font-medium">
                      {mode === "day"
                        ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" })
                        : date.getUTCDate()}
                    </span>
                    <ul className="mt-2 space-y-1">
                      {dayItems.map((item) => (
                        <li key={item.id}>
                          <button
                            className={`w-full rounded border px-2 py-1 text-left text-[11px] ${item.taskPriority === "high" ? "border-destructive/30 bg-destructive/5" : item.taskPriority === "medium" ? "border-warning/30 bg-warning/5" : item.taskPriority === "low" ? "border-success/30 bg-success/5" : "border-primary/10 bg-primary/5"}`}
                            title={item.taskTitle}
                            onClick={() => onView(item.taskId)}
                          >
                            <span className="font-medium">
                              {taskLocalDateTime(item.dueAt, timezone).slice(11)}
                            </span>{" "}
                            {item.taskTitle}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Próximos agendamentos</h3>
          <ul className="divide-y divide-border">
            {items
              .filter((item) => new Date(item.dueAt).getTime() >= Date.now())
              .slice(0, 8)
              .map((item) => (
                <li key={item.id}>
                  <button className="w-full py-3 text-left" onClick={() => onView(item.taskId)}>
                    <span className="block text-sm font-medium">{item.taskTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {taskDate(item.dueAt, timezone)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <h4 className="text-sm font-medium">Prioridade</h4>
            <div className="flex flex-wrap gap-2">
              {["low", "medium", "high"].map((value) => (
                <TaskPriority key={value} value={value} />
              ))}
            </div>
          </div>
          {!items.length && !occurrences.isLoading && (
            <p className="text-sm text-muted-foreground">
              Sem ocorrências registradas neste período.
            </p>
          )}
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Fuso: {timezone}. São exibidas as ocorrências registradas, sem enviar avisos ao consultar o
        calendário.
        {occurrences.data && occurrences.data.total > items.length
          ? ` Exibindo ${items.length} de ${occurrences.data.total}; reduza o período para consultar os demais.`
          : ""}
      </p>
      {canUpdate && (
        <Button disabled={materialize.isPending} onClick={() => materialize.mutate()}>
          Preparar ocorrências deste período
        </Button>
      )}
    </div>
  );
}
