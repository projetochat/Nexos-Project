import { DashboardDateInput } from "@/components/dashboard-filters";
import { ClearFiltersButton } from "@/components/clear-filters-button";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Field, Select, SearchInput } from "@/components/ui-kit";
import { taskManagementApi, taskDayBoundary, type TaskOccurrence } from "@/lib/task-management";
import { TaskError, TaskPager, TaskStatus, TaskDeliveryFailure } from "./task-ui";
import { taskDate, taskStatusLabels, taskChannelLabels } from "./task-labels";
export function TaskHistory({
  tenantId,
  authorizationScope,
  memberships,
  timezone,
  onView,
}: {
  tenantId?: string;
  authorizationScope?: string;
  memberships: Array<{ id: string; name: string }>;
  timezone: string;
  onView: (id: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [selected, setSelected] = React.useState<TaskOccurrence | null>(null);
  const history = useQuery({
    queryKey: [
      "trixus",
      "task-management",
      tenantId,
      authorizationScope,
      "history",
      { status, page, pageSize, start, end, search, assignedMembershipId, channel },
    ],
    refetchInterval: 30_000,
    queryFn: () =>
      taskManagementApi.history({
        status: status || undefined,
        search: search || undefined,
        assignedMembershipId: assignedMembershipId || undefined,
        channel: (channel as "popup" | "bell" | "whatsapp" | "email") || undefined,
        page,
        pageSize,
        start: start ? taskDayBoundary(start, timezone) : undefined,
        end: end
          ? new Date(
              Date.parse(
                taskDayBoundary(
                  new Date(Date.parse(`${end}T12:00:00Z`) + 86400000).toISOString().slice(0, 10),
                  timezone,
                ),
              ) - 1,
            ).toISOString()
          : undefined,
      }),
  });
  React.useEffect(() => {
    if (history.data && page > Math.max(1, history.data.totalPages))
      setPage(Math.max(1, history.data.totalPages));
  }, [history.data, page]);
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid min-w-0 grid-cols-2 gap-3 [&>label]:min-w-0 [&>label>span]:mb-1 lg:grid-cols-[minmax(180px,1.5fr)_minmax(128px,1fr)_minmax(112px,1fr)_minmax(160px,1fr)_repeat(2,minmax(132px,1fr))_auto] lg:overflow-x-auto lg:pb-1">
          <Field label="Busca">
            <SearchInput
              ariaLabel="Buscar execuções"
              value={search}
              placeholder="Título ou destinatário..."
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Responsável">
            <Select
              value={assignedMembershipId}
              onChange={(event) => {
                setAssignedMembershipId(event.target.value);
                setPage(1);
              }}
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
            <Select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            >
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
          <Field label="Situação da execução">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {["pending", "processing", "completed", "failed", "cancelled"].map((value) => (
                <option key={value} value={value}>
                  {taskStatusLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dt. Inicial">
            <DashboardDateInput
              readOnly={false}
              value={start}
              onChange={(date) => {
                setStart(date);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Dt. Final">
            <DashboardDateInput
              readOnly={false}
              value={end}
              onChange={(date) => {
                setEnd(date);
                setPage(1);
              }}
            />
          </Field>
          <div className="flex items-end">
            <ClearFiltersButton
              onClick={() => {
                setSearch("");
                setAssignedMembershipId("");
                setChannel("");
                setStatus("");
                setStart("");
                setEnd("");
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>
      <TaskError error={history.error} />
      <div
        className={`grid items-start gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}
      >
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-surface-2">
                <tr>
                  {["Agendamento", "Data e hora", "Situação", "Canais", "Ações"].map((label) => (
                    <th key={label} className="p-3 text-xs">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data?.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="p-3">
                      {item.taskTitle}
                      {item.assignedName && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.assignedName}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{taskDate(item.dueAt, timezone)}</td>
                    <td className="p-3">
                      <TaskStatus value={item.status} />
                    </td>
                    <td className="p-3">
                      {[
                        ...new Set(
                          item.deliveries.map((delivery) => taskChannelLabels[delivery.channel]),
                        ),
                      ].join(", ") || "—"}
                    </td>
                    <td className="p-3">
                      <Button size="sm" onClick={() => setSelected(item)}>
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.isLoading ? (
            <p className="p-5 text-sm">Carregando histórico...</p>
          ) : (
            !history.data?.items.length && (
              <p className="p-5 text-center text-sm text-muted-foreground">
                Nenhuma execução encontrada.
              </p>
            )
          )}
          {history.data && (
            <TaskPager
              page={page}
              totalPages={history.data.totalPages}
              total={history.data.total}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          )}
        </Card>
        {selected && (
          <Card>
            <div className="mb-4 flex justify-between gap-2">
              <h3 className="font-semibold">Detalhes da execução</h3>
              <Button size="sm" onClick={() => setSelected(null)}>
                Fechar
              </Button>
            </div>
            <p className="mb-2 text-sm font-medium">{selected.taskTitle}</p>
            <TaskStatus value={selected.status} />
            {selected.executionError && <TaskDeliveryFailure code={selected.executionError} />}
            <p className="my-3 text-xs text-muted-foreground">
              {taskDate(selected.dueAt, timezone)}
            </p>
            <ul className="divide-y divide-border">
              {selected.deliveries.map((delivery) => (
                <li key={delivery.id} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">{taskChannelLabels[delivery.channel]}</p>
                  <p className="break-words text-muted-foreground">{delivery.destination}</p>
                  <TaskStatus value={delivery.status} />
                  {delivery.lastError && <TaskDeliveryFailure code={delivery.lastError} />}
                  <p className="text-xs">
                    {taskDate(delivery.sentAt || delivery.createdAt, timezone)}
                  </p>
                </li>
              ))}
            </ul>
            <Button className="mt-4" onClick={() => onView(selected.taskId)}>
              Visualizar tarefa
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
