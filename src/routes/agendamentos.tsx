import { selectableConnections } from "@/lib/connection-options";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  TicketCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  InstanceFilterSelect,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  connectionsApi,
  crmApi,
  organizationApi,
  type ApiContact,
  type ApiDepartment,
  type ApiMessagingConnection,
  type ApiUserMembership,
} from "@/lib/trixus-api";
import { num } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/agendamentos")({ component: SchedulingPage });

type ScheduleType = "message" | "task";
type ScheduleStatus = "pending" | "completed";
type Schedule = {
  id: string;
  identifier: string;
  type: ScheduleType;
  title: string;
  destination: string;
  scheduledAt: string;
  recurrence: "once" | "weekly" | "monthly";
  delivery: boolean;
  status: ScheduleStatus;
  connectionId: string;
  departmentId: string;
  content: string;
  recipientIds: string[];
  recipients: Array<{ id: string; name: string }>;
  recurrenceDays: string[];
  recurrenceLimit: string;
  recurrenceUntil: string;
  assignedMembershipId: string;
  attachmentName: string | null;
};
const STORAGE_KEY = "trixus.schedules";
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function SchedulingPage() {
  const [items, setItems] = React.useState<Schedule[]>(() => readSchedules());
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [connectionId, setConnectionId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = React.useState<Schedule | null>(null);
  const [removing, setRemoving] = React.useState<Schedule | null>(null);
  const { data: connections = [] } = useQuery({
    queryKey: ["trixus", "messaging-connections"],
    queryFn: connectionsApi.list,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["trixus", "departments"],
    queryFn: organizationApi.listDepartments,
  });
  React.useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(items)), [items]);
  const filtered = items.filter(
    (item) =>
      (!query ||
        `${item.identifier} ${item.title} ${item.destination}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!type || item.type === type) &&
      (!status || item.status === status) &&
      (!connectionId || item.connectionId === connectionId) &&
      (!departmentId || item.departmentId === departmentId),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [query, type, status, connectionId, departmentId, pageSize]);

  const save = (item: Schedule) => {
    setItems((current) =>
      current.some((entry) => entry.id === item.id)
        ? current.map((entry) => (entry.id === item.id ? item : entry))
        : [item, ...current],
    );
    setEditing(null);
    toast.success("Agendamento salvo.");
  };
  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Agendamentos"
          subtitle={`${num(items.length)} agendamento(s) cadastrado(s).`}
          actions={
            <Button variant="primary" size="sm" onClick={() => setEditing(blankSchedule())}>
              <Plus className="h-3.5 w-3.5" /> Novo Agendamento
            </Button>
          }
        />
        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(16rem,1fr)_10rem_10rem_12rem_12rem]">
            <div className="col-span-2 xl:col-span-1">
              <Field label="Busca">
                <SearchInput value={query} onChange={setQuery} placeholder="Buscar agendamento..." />
              </Field>
            </div>
            <Filter
              label="Tipo"
              value={type}
              onChange={setType}
              options={[
                ["message", "Mensagem"],
                ["task", "Tarefa"],
              ]}
            />
            <Filter
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                ["pending", "Pendente"],
                ["completed", "Concluída"],
              ]}
            />
            <Field label="Instância">
              <InstanceFilterSelect
              value={connectionId}
              onChange={setConnectionId}
              options={selectableConnections(connections).map((connection) => ({
                value: connection.id,
                label: connection.name,
                color: connection.color,
              }))}
              />
            </Field>
            <Filter
              label="Departamento"
              value={departmentId}
              onChange={setDepartmentId}
              options={departments.map((item) => [item.id, item.name])}
            />
          </div>
        </Card>
        <div className="space-y-3 md:hidden">
          {paginated.map((item) => (
            <ScheduleMobileCard
              key={item.id}
              item={item}
              connections={connections}
              departments={departments}
              onEdit={() => setEditing(item)}
              onDuplicate={() =>
                setEditing({
                  ...item,
                  id: crypto.randomUUID(),
                  identifier: `${item.identifier}-Cópia`,
                  status: "pending",
                })
              }
              onRemove={() => setRemoving(item)}
            />
          ))}
          {!filtered.length && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum agendamento encontrado.
            </Card>
          )}
          <Card padding={false} className="overflow-hidden">
            <SchedulePagination
              shown={paginated.length}
              total={filtered.length}
              page={pageSafe}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </Card>
        </div>
        <Card padding={false} className="hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  {[
                    "Tipo",
                    "Título",
                    "Destino",
                    "Agendamento",
                    "Recorrência",
                    "Entrega",
                    "Status",
                    "Ações",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((item) => (
                  <ScheduleRow
                    key={item.id}
                    item={item}
                    connections={connections}
                    departments={departments}
                    onEdit={() => setEditing(item)}
                    onDuplicate={() =>
                      setEditing({
                        ...item,
                        id: crypto.randomUUID(),
                        identifier: `${item.identifier}-Cópia`,
                        status: "pending",
                      })
                    }
                    onRemove={() => setRemoving(item)}
                  />
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhum agendamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <SchedulePagination
            shown={paginated.length}
            total={filtered.length}
            page={pageSafe}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        </Card>
        <ScheduleForm
          item={editing}
          connections={connections}
          departments={departments}
          onClose={() => setEditing(null)}
          onSave={save}
        />
        <ConfirmDialog
          open={!!removing}
          title="Excluir Agendamento?"
          destructive
          description={
            <p>
              Deseja realmente excluir o agendamento{" "}
              <strong className="font-semibold text-foreground">"{removing?.title ?? ""}"</strong>?
            </p>
          }
          confirmLabel="Excluir"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            if (!removing) return;
            setItems((current) => current.filter((item) => item.id !== removing.id));
            setRemoving(null);
            toast.success("Agendamento excluído.");
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function SchedulePagination({
  shown,
  total,
  page,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrevious,
  onNext,
}: {
  shown: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 leading-tight sm:leading-normal">
          <span className="block sm:inline">Mostrando</span>
          <span className="block sm:inline">
            {" "}
            {num(shown)} de {num(total)}
          </span>
        </span>
        <Select
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 w-20 text-xs sm:w-24"
          aria-label="Itens por página"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page === 1}
          onClick={onPrevious}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page === totalPages}
          onClick={onNext}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </footer>
  );
}

function ScheduleMobileCard({
  item,
  connections,
  departments,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  item: Schedule;
  connections: ApiMessagingConnection[];
  departments: ApiDepartment[];
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const connection = connections.find((entry) => entry.id === item.connectionId)?.name ?? "—";
  const department = departments.find((entry) => entry.id === item.departmentId)?.name ?? "—";
  const isMessage = item.type === "message";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded-lg p-2 text-white ${isMessage ? "bg-emerald-500" : "bg-primary"}`}
        >
          {isMessage ? <MessageCircle className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{item.title || "Sem título"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isMessage ? "Mensagem" : "Tarefa"} · {item.identifier || "Sem identificador"}
              </p>
            </div>
            <Badge tone={item.status === "completed" ? "success" : "warning"}>
              {item.status === "completed" ? "Concluída" : "Pendente"}
            </Badge>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">{new Date(item.scheduledAt).toLocaleString("pt-BR")}</span>
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">
                {item.destination || "Sistema"} · {department}
              </span>
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4 shrink-0 text-primary" />
              {{ once: "Única", weekly: "Semanal", monthly: "Mensal" }[item.recurrence]} ·{" "}
              {connection}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          title="Duplicar"
          aria-label="Duplicar"
          onClick={onDuplicate}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" title="Editar" aria-label="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Excluir"
          aria-label="Excluir"
          className="trash-action"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function ScheduleRow({
  item,
  connections,
  departments,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  item: Schedule;
  connections: ApiMessagingConnection[];
  departments: ApiDepartment[];
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const connection = connections.find((entry) => entry.id === item.connectionId)?.name ?? "—";
  const department = departments.find((entry) => entry.id === item.departmentId)?.name ?? "—";
  return (
    <tr className="hover:bg-surface-1">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {item.type === "message" ? (
            <span className="rounded-lg bg-emerald-500 p-2 text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
          ) : (
            <span className="rounded-lg bg-primary p-2 text-white">
              <CheckSquare className="h-4 w-4" />
            </span>
          )}
          <span className="font-medium">{item.type === "message" ? "Mensagem" : "Tarefa"}</span>
        </div>
      </td>
      <td className="max-w-48 px-4 py-3">
        <p className="truncate font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.content}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium">{item.destination || "Sistema"}</p>
        <p className="text-xs text-muted-foreground">{department}</p>
      </td>
      <td className="px-4 py-3">
        <p className="inline-flex items-center gap-1 font-medium">
          <CalendarClock className="h-4 w-4 text-primary" />
          {new Date(item.scheduledAt).toLocaleString("pt-BR")}
        </p>
        <p className="text-xs text-muted-foreground">{connection}</p>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-4 w-4 text-primary" />
          {{ once: "Única", weekly: "Semanal", monthly: "Mensal" }[item.recurrence]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1">
          <TicketCheck className="h-4 w-4 text-primary" />
          Abrir Ticket: {item.delivery ? "Sim" : "Não"}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge tone={item.status === "completed" ? "success" : "warning"}>
          {item.status === "completed" ? "Concluída" : "Pendente"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" title="Duplicar" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" title="Editar" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Excluir"
            className="trash-action"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
function ScheduleForm({
  item,
  connections,
  departments,
  onClose,
  onSave,
}: {
  item: Schedule | null;
  connections: ApiMessagingConnection[];
  departments: ApiDepartment[];
  onClose: () => void;
  onSave: (item: Schedule) => void;
}) {
  const [form, setForm] = React.useState<Schedule | null>(null);
  const [contactSearch, setContactSearch] = React.useState("");
  const [multipleContacts, setMultipleContacts] = React.useState(false);
  React.useEffect(() => setForm(item), [item]);
  React.useEffect(() => {
    setContactSearch("");
    setMultipleContacts((item?.recipientIds?.length ?? 0) > 1);
  }, [item]);
  const contacts = useQuery({
    queryKey: ["trixus", "schedule-contacts", contactSearch],
    queryFn: () => crmApi.listContacts({ q: contactSearch || undefined, pageSize: 8 }),
    enabled: !!form && form.type === "message",
  });
  const users = useQuery({
    queryKey: ["trixus", "schedule-users"],
    queryFn: organizationApi.listUsers,
    enabled: !!form,
  });
  if (!form) return null;
  const update = (patch: Partial<Schedule>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));
  const selectedContacts = form.recipients ?? [];
  const selectContact = (contact: ApiContact) => {
    const recipientIds = multipleContacts
      ? Array.from(new Set([...form.recipientIds, contact.id]))
      : [contact.id];
    const selected = multipleContacts
      ? [
          ...selectedContacts.filter((item) => item.id !== contact.id),
          { id: contact.id, name: contact.nome },
        ]
      : [{ id: contact.id, name: contact.nome }];
    update({
      recipientIds,
      recipients: selected,
      destination: selected.map((item) => item.name).join(", "),
    });
    setContactSearch("");
  };
  const removeContact = (contactId: string) => {
    const recipientIds = form.recipientIds.filter((id) => id !== contactId);
    const recipients = selectedContacts.filter((contact) => contact.id !== contactId);
    const destination = recipients.map((contact) => contact.name).join(", ");
    update({ recipientIds, recipients, destination });
  };
  const toggleMultipleContacts = (enabled: boolean) => {
    setMultipleContacts(enabled);
    if (!enabled && form.recipientIds.length > 1) {
      update({
        recipientIds: form.recipientIds.slice(0, 1),
        recipients: selectedContacts.slice(0, 1),
        destination: selectedContacts[0]?.name ?? "",
      });
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Agendamento"
      description="Configure os detalhes do agendamento e programe o envio ou a tarefa."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!form.identifier.trim() || !form.title.trim() || !form.scheduledAt)
                return toast.error("Preencha identificador, título e data de agendamento.");
              if (!form.content.trim()) return toast.error("Informe o conteúdo do agendamento.");
              if (form.type === "message" && !form.recipientIds.length)
                return toast.error("Selecione ao menos um contato destinatário.");
              if (form.recurrence === "weekly" && !form.recurrenceDays.length)
                return toast.error("Selecione ao menos um dia da semana.");
              onSave(form);
            }}
          >
            Salvar Agendamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">Informações gerais</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Identificador *">
              <Input
                value={form.identifier}
                onChange={(e) => update({ identifier: e.target.value })}
                placeholder="Ex.: AGD-001"
              />
            </Field>
            <Field label="Tipo de agendamento *">
              <Select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as ScheduleType;
                  update({
                    type,
                    ...(type === "task"
                      ? { recipientIds: [], recipients: [], destination: "" }
                      : {}),
                  });
                }}
              >
                <option value="message">Mensagem</option>
                <option value="task">Tarefa</option>
              </Select>
            </Field>
          </div>
        </section>
        {form.type === "message" && (
          <section className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Destinatário</h3>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Contato">
                  <SearchInput
                    value={contactSearch}
                    onChange={setContactSearch}
                    placeholder="Buscar contato..."
                  />
                </Field>
              </div>
              <label className="mb-2 flex shrink-0 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={multipleContacts}
                  onChange={(event) => toggleMultipleContacts(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Múltiplos contatos
              </label>
            </div>
            {contacts.isFetching && (
              <p className="mt-2 text-xs text-muted-foreground">Buscando contatos...</p>
            )}
            {!!contactSearch && !contacts.isFetching && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-1">
                {contacts.data?.items.length ? (
                  contacts.data.items.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => selectContact(contact)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                    >
                      <span className="font-medium">{contact.nome}</span>
                      <span className="text-xs text-muted-foreground">{contact.telefone}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    Nenhum contato encontrado.
                  </p>
                )}
              </div>
            )}
            {!!selectedContacts.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedContacts.map((contact) => (
                  <span
                    key={contact.id}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary"
                  >
                    {contact.name}
                    <button
                      type="button"
                      onClick={() => removeContact(contact.id)}
                      aria-label={`Remover ${contact.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
        <section className="rounded-lg border border-border p-4">
          <Field label={form.type === "message" ? "Mensagem *" : "Descrição *"}>
            <Textarea
              rows={4}
              value={form.content}
              onChange={(e) => update({ content: e.target.value })}
              placeholder={
                form.type === "message"
                  ? "Digite a mensagem que será enviada..."
                  : "Descreva a tarefa..."
              }
            />
          </Field>
          {form.type === "message" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Você pode utilizar variáveis. Consulte o dicionário de variáveis das Instâncias.
            </p>
          )}
          <div className="mt-3">
            <Field label="Título *">
              <Input
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Informe um título para o agendamento"
              />
            </Field>
          </div>
        </section>
        <section className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">Quando enviar / Executar</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Data e hora *">
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => update({ scheduledAt: e.target.value })}
              />
            </Field>
            <Field label="Recorrência">
              <Select
                value={form.recurrence}
                onChange={(e) => update({ recurrence: e.target.value as Schedule["recurrence"] })}
              >
                <option value="once">Única</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </Select>
            </Field>
            <Field label="Abrir Ticket">
              <Select
                value={String(form.delivery)}
                onChange={(e) => update({ delivery: e.target.value === "true" })}
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </Select>
            </Field>
          </div>
          {form.recurrence !== "once" && (
            <>
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {form.recurrence === "weekly" ? "Dias da semana" : "Dia do mês"}
                </p>
                {form.recurrence === "weekly" ? (
                  <div className="grid gap-2 sm:grid-cols-4">
                    {[
                      ["mon", "Segunda-feira"],
                      ["tue", "Terça-feira"],
                      ["wed", "Quarta-feira"],
                      ["thu", "Quinta-feira"],
                      ["fri", "Sexta-feira"],
                      ["sat", "Sábado"],
                      ["sun", "Domingo"],
                    ].map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.recurrenceDays.includes(value)}
                          onChange={(event) =>
                            update({
                              recurrenceDays: event.target.checked
                                ? [...form.recurrenceDays, value]
                                : form.recurrenceDays.filter((day) => day !== value),
                            })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.recurrenceDays[0] ?? ""}
                    onChange={(event) =>
                      update({ recurrenceDays: event.target.value ? [event.target.value] : [] })
                    }
                    placeholder="Ex.: 15"
                    className="max-w-40"
                  />
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Limite da recorrência (opcional)" hint="Quantidade máxima de envios.">
                  <Input
                    type="number"
                    min="1"
                    value={form.recurrenceLimit}
                    onChange={(event) => update({ recurrenceLimit: event.target.value })}
                    placeholder="Quantidade de envios"
                  />
                </Field>
                <Field label="Enviar até" hint="Deixe em branco para não limitar a data.">
                  <Input
                    type="date"
                    value={form.recurrenceUntil}
                    onChange={(event) => update({ recurrenceUntil: event.target.value })}
                  />
                </Field>
              </div>
            </>
          )}
        </section>
        <section className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">Entrega / Execução</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Instância">
              <Select
                value={form.connectionId}
                onChange={(e) => update({ connectionId: e.target.value })}
              >
                <option value="">Selecione</option>
                {selectableConnections(connections).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Usuário responsável">
              <Select
                value={form.assignedMembershipId}
                onChange={(e) => update({ assignedMembershipId: e.target.value })}
              >
                <option value="">Fila</option>
                {(users.data ?? [])
                  .filter((entry: ApiUserMembership) => entry.status === "ACTIVE")
                  .map((entry: ApiUserMembership) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.user.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Departamento">
              <Select
                value={form.departmentId}
                onChange={(e) => update({ departmentId: e.target.value })}
              >
                <option value="">Selecione</option>
                {departments
                  .filter((entry) => entry.active)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        </section>
        <section className="rounded-lg border border-border p-4">
          <p className="mb-2 text-sm font-semibold">
            Atrixus <span className="font-normal text-muted-foreground">(opcional)</span>
          </p>
          <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-1 px-4 text-sm text-muted-foreground hover:border-primary hover:text-primary">
            <Paperclip className="h-4 w-4" />
            {form.attachmentName ?? "Clique para anexar um arquivo"}
            <input
              type="file"
              className="hidden"
              onChange={(event) =>
                update({ attachmentName: event.target.files?.[0]?.name ?? null })
              }
            />
          </label>
        </section>
      </div>
    </Modal>
  );
}
function blankSchedule(): Schedule {
  return {
    id: crypto.randomUUID(),
    identifier: "",
    type: "message",
    title: "",
    destination: "",
    scheduledAt: new Date().toISOString().slice(0, 16),
    recurrence: "once",
    delivery: false,
    status: "pending",
    connectionId: "",
    departmentId: "",
    content: "",
    recipientIds: [],
    recipients: [],
    recurrenceDays: [],
    recurrenceLimit: "",
    recurrenceUntil: "",
    assignedMembershipId: "",
    attachmentName: null,
  };
}
function readSchedules(): Schedule[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.map((item) => ({
          ...blankSchedule(),
          ...item,
          recipientIds: Array.isArray(item.recipientIds) ? item.recipientIds : [],
          recipients: Array.isArray(item.recipients) ? item.recipients : [],
          recurrenceDays: Array.isArray(item.recurrenceDays) ? item.recurrenceDays : [],
        }))
      : [];
  } catch {
    return [];
  }
}
