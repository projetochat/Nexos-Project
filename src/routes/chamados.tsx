import { RichTextEditor } from "@/components/ticket-rich-text-editor";
import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  Eye,
  Headphones,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Ticket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  SectionHeader,
  Select,
} from "@/components/ui-kit";
import { Modal } from "@/components/modal";
import { DeletionConfirmDialog } from "@/components/deletion-confirm-dialog";
import {
  Select as RichSelect,
  SelectContent as RichSelectContent,
  SelectItem as RichSelectItem,
  SelectTrigger as RichSelectTrigger,
} from "@/components/ui/select";
import { useDisclosure } from "@/hooks/use-disclosure";
import { num } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/input-masks";
import {
  conversationApi,
  crmApi,
  messageApi,
  organizationApi,
  ticketApi,
  type ApiConversation,
  type ApiMessage,
  type ApiCustomer,
  type ApiDepartment,
  type ApiTicket,
  type ApiTicketAttachment,
  type ApiTicketCategory,
  type ApiTicketPriority,
  type ApiTicketStatus,
  type ApiTicketSubstatus,
  type ApiUserMembership,
} from "@/lib/trixus-api";
import { onRealtimeEvent } from "@/lib/realtime/client";
import { useSession } from "@/lib/session";
import { sortByOptionLabel } from "@/lib/sort-options";

export const Route = createFileRoute("/chamados")({
  validateSearch: (search) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    ticketId: typeof search.ticketId === "string" ? search.ticketId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Trixus" },
      { name: "description", content: "Chamados gerenciados pela API Trixus." },
    ],
  }),
  component: ChamadosPage,
});

const statuses: ApiTicketStatus[] = [
  "NOVO",
  "AGUARDANDO_APROVACAO",
  "NA_FILA",
  "EM_EXECUCAO",
  "CONCLUIDA",
  "VALIDADO",
  "REPROVADO",
  "CANCELADO",
];
const priorities: ApiTicketPriority[] = ["BAIXA", "NORMAL", "ALTA", "URGENTE", "ALTISSIMA"];
const categories: ApiTicketCategory[] = ["SUPORTE", "DEV", "FINANCEIRO", "OPERACIONAL"];
const listKey = ["tickets", "list"] as const;
const summaryKey = ["tickets", "summary"] as const;
const maxAttachmentSizeMb = 10;
const maxAttachmentCount = 10;
const allowedAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

function ChamadosPage() {
  const qc = useQueryClient();
  const permissions = useSession((state) => state.user?.permissions ?? []);
  const isCustomerPortal = useSession((state) => state.user?.roleKey === "customer_portal");
  const canCreate = permissions.includes("tickets.create");
  const canUpdate = permissions.includes("tickets.update");
  const canUpdateStatus = canUpdate;
  const canComment = canUpdate;
  const canUploadAttachment = canUpdate;
  const canDeleteAttachment = permissions.includes("tickets.delete");
  const canDelete = permissions.includes("tickets.delete");
  const search = useSearch({ from: "/chamados" });
  const novo = useDisclosure();
  const setNewTicketOpen = novo.set;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApiTicketStatus | "">("");
  const [customerId, setCustomerId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editingTicket, setEditingTicket] = React.useState<ApiTicket | null>(null);
  const [duplicatingTicket, setDuplicatingTicket] = React.useState<ApiTicket | null>(null);
  const [deletingTicket, setDeletingTicket] = React.useState<ApiTicket | null>(null);
  const params = {
    search: query || undefined,
    status: status || undefined,
    customerId: customerId || undefined,
    departmentId: departmentId || undefined,
    conversationId: search.conversationId,
    pageSize: 25,
  };
  const tickets = useQuery({
    queryKey: [...listKey, params],
    queryFn: () => ticketApi.list(params),
  });
  const ticketSummary = useQuery({
    queryKey: [...summaryKey, params],
    queryFn: () =>
      ticketApi.summary({
        search: params.search,
        status: params.status,
        customerId: params.customerId,
        departmentId: params.departmentId,
        conversationId: params.conversationId,
      }),
    enabled: !isCustomerPortal,
  });
  const options = useTicketOptions(!isCustomerPortal);
  const summary = {
    new: ticketSummary.data?.counts.NOVO ?? 0,
    approval: ticketSummary.data?.counts.AGUARDANDO_APROVACAO ?? 0,
    queue: ticketSummary.data?.counts.NA_FILA ?? 0,
    running: ticketSummary.data?.counts.EM_EXECUCAO ?? 0,
    done: ticketSummary.data?.counts.CONCLUIDA ?? 0,
    validated: ticketSummary.data?.counts.VALIDADO ?? 0,
    rejected: ticketSummary.data?.counts.REPROVADO ?? 0,
  };

  const refreshTickets = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: listKey });
    qc.invalidateQueries({ queryKey: summaryKey });
    if (selectedId) qc.invalidateQueries({ queryKey: ["tickets", "detail", selectedId] });
  }, [qc, selectedId]);
  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("ticket.")) refreshTickets();
      }),
    [refreshTickets],
  );

  React.useEffect(() => {
    if (search.conversationId && canCreate) setNewTicketOpen(true);
  }, [canCreate, search.conversationId, setNewTicketOpen]);

  React.useEffect(() => {
    if (search.ticketId) setSelectedId(search.ticketId);
  }, [search.ticketId]);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title={isCustomerPortal ? "Meus chamados" : "Chamados"}
          subtitle={`${num(tickets.data?.total ?? 0)} chamados em acompanhamento.`}
          actions={
            canCreate ? (
              <Button variant="primary" size="sm" onClick={novo.show}>
                <Plus className="h-3.5 w-3.5" /> Novo chamado
              </Button>
            ) : null
          }
        />

        <Card className="mb-4 p-4">
          <div
            className={`grid grid-cols-2 gap-3 ${isCustomerPortal ? "lg:grid-cols-[1fr_220px]" : "lg:grid-cols-[minmax(280px,1.6fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)]"}`}
          >
            <div className="col-span-2 lg:col-span-1">
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar por ID, título ou solicitante"
                />
              </Field>
            </div>
            {!isCustomerPortal && (
              <Field label="Cliente">
                <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Todos</option>
                  {options.customers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {!isCustomerPortal && (
              <Field label="Departamento">
                <Select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">Todos</option>
                  {options.departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Status">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as ApiTicketStatus | "")}
              >
                <option value="">Todos</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {!isCustomerPortal && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <SummaryCard label="Novos" value={summary.new} tone="green" icon={<Ticket />} />
            <SummaryCard
              label="Aguardando aprovação"
              value={summary.approval}
              tone="purple"
              icon={<Clock3 />}
            />
            <SummaryCard label="Na fila" value={summary.queue} tone="green" icon={<ListChecks />} />
            <SummaryCard label="Em execução" value={summary.running} tone="amber" icon={<Send />} />
            <SummaryCard
              label="Concluída"
              value={summary.done}
              tone="blue"
              icon={<CheckCircle2 />}
            />
            <SummaryCard
              label="Validados"
              value={summary.validated}
              tone="blue"
              icon={<CheckCircle2 />}
            />
            <SummaryCard label="Reprovados" value={summary.rejected} tone="red" icon={<Ban />} />
          </div>
        )}

        {tickets.isLoading ? (
          <Card>Carregando chamados...</Card>
        ) : !tickets.data?.items.length ? (
          <EmptyState
            icon={<Ticket className="h-5 w-5" />}
            title="Nenhum chamado"
            description="Crie um chamado com workflow, comentários e atrixus privados."
            action={
              canCreate ? (
                <Button variant="primary" size="sm" onClick={novo.show}>
                  <Plus className="h-3.5 w-3.5" /> Criar chamado
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{num(tickets.data.total)} chamados encontrados</span>
                <span>Ordenar por</span>
              </div>
              {tickets.data.items.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-card"
                >
                  <div className="grid grid-cols-[.8fr_2fr] gap-3">
                    <TicketDatum
                      label="Nº do chamado"
                      value={`#${ticket.protocol.replace(/^#/, "")}`}
                      strong
                    />
                    <TicketDatum label="Título" value={ticket.title} link />
                    <TicketDatum label="Cliente" value={ticket.customer?.name ?? "Sem vínculo"} />
                    <TicketDatum
                      label="Departamento"
                      value={ticket.department?.name ?? "Sem departamento"}
                    />
                    <TicketDatum
                      label="Solicitante"
                      value={ticket.requesterContact?.name ?? ticket.createdByMembership.user.name}
                    />
                    <TicketDatum
                      label="Prioridade"
                      value={priorityLabel(ticket.priority)}
                      dot={priorityDot(ticket.priority)}
                    />
                    <TicketDatum
                      label="Tipo"
                      value={categoryLabel(ticket.category)}
                      dot={ticket.category === "DEV" ? "#ef4444" : "#1687ff"}
                    />
                    <TicketDatum
                      label="Status"
                      value={statusLabel(ticket.status)}
                      dot={statusDot(ticket.status)}
                    />
                    <TicketDatum label="Dt. abertura" value={formatDate(ticket.createdAt)} icon />
                    <TicketDatum label="Dt. aprovação" value="-" icon />
                    <TicketDatum
                      label="Dt. conclusão"
                      value={ticket.closedAt ? formatDate(ticket.closedAt) : "-"}
                      icon
                    />
                  </div>
                </button>
              ))}
            </div>
            <Card className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                      <th className="w-20 px-3 py-3">ID</th>
                      <th className="w-[290px] px-3 py-3">Título</th>
                      <th className="px-4 py-3">Prioridade</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Departamento</th>
                      <th className="px-4 py-3">Solicitante</th>
                      <th className="px-4 py-3">Dt. abertura</th>
                      <th className="px-4 py-3">Dt. conclusão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.data.items.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="cursor-pointer border-b border-border/60 hover:bg-surface-1"
                        onClick={() => setSelectedId(ticket.id)}
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          {ticket.protocol.replace(/^#/, "")}
                        </td>
                        <td className="max-w-[290px] truncate px-3 py-3 font-medium text-primary underline-offset-2 hover:underline">
                          {ticket.title}
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot color={priorityDot(ticket.priority)} />
                          {priorityLabel(ticket.priority)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot color={statusDot(ticket.status)} />
                          {statusLabel(ticket.status)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary">
                            {categoryLabel(ticket.category)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {ticket.customer?.name ?? "Sem vínculo"}
                        </td>
                        <td className="px-4 py-3">
                          {ticket.department?.name ?? "Sem departamento"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {ticket.requesterContact?.name ?? ticket.createdByMembership.user.name}
                        </td>
                        <td className="px-4 py-3 text-xs">{formatDate(ticket.createdAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          {ticket.closedAt ? formatDate(ticket.closedAt) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Mostrando {tickets.data.items.length} de {tickets.data.total} registros
                </span>
                <span>1 / {Math.max(1, Math.ceil(tickets.data.total / 25))}</span>
              </div>
            </Card>
          </>
        )}

        {canCreate && (
          <TicketEditor
            open={novo.open}
            customerPortal={isCustomerPortal}
            initialConversationId={search.conversationId}
            onClose={novo.hide}
            onSaved={(ticket) => {
              novo.hide();
              setSelectedId(ticket.id);
              refreshTickets();
            }}
          />
        )}
        <TicketDetail
          ticketId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refreshTickets}
          canUpdate={canUpdate}
          canUpdateStatus={canUpdateStatus}
          canComment={canComment}
          canUploadAttachment={canUploadAttachment}
          canDeleteAttachment={canDeleteAttachment}
          canDelete={canDelete}
          customerPortal={isCustomerPortal}
          onDelete={(ticket) => setDeletingTicket(ticket)}
        />
        {canCreate && (
          <TicketEditor
            open={!!duplicatingTicket}
            customerPortal={isCustomerPortal}
            initialTicket={duplicatingTicket}
            clone
            onClose={() => setDuplicatingTicket(null)}
            onSaved={(ticket) => {
              setDuplicatingTicket(null);
              setSelectedId(ticket.id);
              refreshTickets();
            }}
          />
        )}
        {canUpdate && (
          <TicketEditor
            open={!!editingTicket}
            customerPortal={isCustomerPortal}
            initialTicket={editingTicket}
            onClose={() => setEditingTicket(null)}
            onSaved={(ticket) => {
              setEditingTicket(null);
              setSelectedId(ticket.id);
              refreshTickets();
            }}
          />
        )}
        <DeletionConfirmDialog
          open={!!deletingTicket}
          resourceKey={`ticket:${deletingTicket?.id ?? "none"}`}
          onOpenChange={(open) => {
            if (!open) setDeletingTicket(null);
          }}
          loadImpact={(signal) => {
            if (!deletingTicket) return Promise.reject(new Error("Chamado não selecionado."));
            return ticketApi.deletionPreview(deletingTicket.id, signal);
          }}
          onConfirm={({ snapshotToken, signal }) => {
            if (!deletingTicket) return Promise.reject(new Error("Chamado não selecionado."));
            return ticketApi.remove(deletingTicket.id, snapshotToken, signal);
          }}
          onDeleted={() => {
            toast.success("Chamado excluído permanentemente.");
            setDeletingTicket(null);
            setSelectedId(null);
            refreshTickets();
          }}
          formatError={(error) => (error instanceof Error ? error.message : "Falha ao excluir.")}
        />
      </PageContainer>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "green" | "purple" | "amber" | "blue" | "red";
  icon: React.ReactElement;
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50/80 text-emerald-600",
    purple: "border-violet-200 bg-violet-50/80 text-violet-600",
    amber: "border-amber-200 bg-amber-50/80 text-amber-600",
    blue: "border-blue-200 bg-blue-50/80 text-blue-600",
    red: "border-red-200 bg-red-50/80 text-red-600",
  } as const;
  return (
    <div
      className={`flex min-h-20 items-center justify-between rounded-xl border p-4 ${styles[tone]}`}
    >
      <div>
        <p className="text-sm text-foreground/75">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </div>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-current/10 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
    </div>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function TicketDatum({
  label,
  value,
  strong,
  link,
  dot,
  icon,
}: {
  label: string;
  value: string;
  strong?: boolean;
  link?: boolean;
  dot?: string;
  icon?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-primary/75">{label}</p>
      <p
        className={`truncate text-sm ${strong ? "font-semibold" : ""} ${link ? "text-primary" : ""}`}
      >
        {icon && <CalendarDays className="mr-1 inline h-3.5 w-3.5" />}
        {dot && <StatusDot color={dot} />}
        {value}
      </p>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={`${label} *`}>
      <Input value={value} readOnly />
    </Field>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 grid grid-cols-[1fr_auto] gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <CalendarDays className="h-4 w-4 text-primary" />
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function DialogBubble({
  side,
  initials: avatar,
  author,
  date,
  editedDate,
  title,
  body,
  tone,
  onEdit,
}: {
  side: "left" | "right";
  initials: string;
  author: string;
  date: string;
  editedDate?: string;
  title?: string;
  body: string;
  tone: "gray" | "blue" | "green" | "orange" | "red";
  onEdit?: () => void;
}) {
  const toneClass = {
    blue: "bg-blue-50/90",
    green: "bg-emerald-50/90",
    orange: "bg-orange-50/90",
    red: "bg-red-50/90",
    gray: "bg-surface-2",
  }[tone];
  const avatarNode = (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${side === "right" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
    >
      {avatar}
    </span>
  );
  return (
    <div className={`flex items-start gap-3 ${side === "right" ? "justify-end" : "justify-start"}`}>
      {side === "left" && avatarNode}
      <div className={`group relative max-w-[86%] rounded-xl px-4 py-3 ${toneClass}`}>
        {onEdit && (
          <button
            type="button"
            aria-label="Editar diálogo"
            onClick={onEdit}
            className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 focus:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        <div className="flex flex-wrap gap-x-4 text-xs">
          <strong>{author}</strong>
          <span className="text-muted-foreground">{date}</span>
          {editedDate && <span className="text-muted-foreground">Editado em {editedDate}</span>}
        </div>
        {title && <h3 className="mt-2 border-b border-border pb-2 font-semibold">{title}</h3>}
        <p className="mt-2 whitespace-pre-wrap text-sm">{body}</p>
      </div>
      {side === "right" && avatarNode}
    </div>
  );
}

function dialogTone(
  type: import("@/lib/trixus-api").ApiTicketDialogType,
): "gray" | "blue" | "green" | "orange" | "red" {
  return (
    {
      RESPONSE: "gray",
      TRANSFER: "orange",
      APPROVAL_REQUEST: "green",
      SOLUTION: "blue",
      CANCELLATION: "red",
      APPROVAL_DECISION: "green",
      SOLUTION_VALIDATION: "blue",
    } satisfies Record<
      import("@/lib/trixus-api").ApiTicketDialogType,
      "gray" | "blue" | "green" | "orange" | "red"
    >
  )[type];
}

function actionLabel(action: "reply" | "transfer" | "approval" | "solve" | "cancel") {
  return {
    reply: "Responder",
    transfer: "Transferir Chamado",
    approval: "Solicitar aprovação",
    solve: "Solucionar chamado",
    cancel: "Cancelar Chamado",
  }[action];
}

function actionPanelTone(action: "reply" | "transfer" | "approval" | "solve" | "cancel") {
  return {
    reply: "border-border bg-card",
    transfer: "border-orange-200 bg-orange-50/70",
    approval: "border-emerald-200 bg-emerald-50/70",
    solve: "border-blue-200 bg-blue-50/70",
    cancel: "border-red-200 bg-red-50/70",
  }[action];
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function statusDot(status: ApiTicketStatus) {
  return {
    ABERTO: "#16a34a",
    EM_ANDAMENTO: "#f59e0b",
    AGUARDANDO: "#9333ea",
    RESOLVIDO: "#1687ff",
    FECHADO: "#64748b",
    CANCELADO: "#ef4444",
    NOVO: "#16a34a",
    AGUARDANDO_APROVACAO: "#9333ea",
    NA_FILA: "#16a34a",
    EM_EXECUCAO: "#f59e0b",
    CONCLUIDA: "#1687ff",
    VALIDADO: "#2563eb",
    REPROVADO: "#ef4444",
  }[status];
}

function priorityDot(priority: ApiTicketPriority) {
  return {
    BAIXA: "#60a5fa",
    NORMAL: "#9ca3af",
    ALTA: "#ef4444",
    URGENTE: "#ef4444",
    ALTISSIMA: "#111827",
  }[priority];
}

type TicketEditorSelectOption<T extends string> = {
  value: T;
  label: string;
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
};

function TicketEditorSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: TicketEditorSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  const marker = (option: TicketEditorSelectOption<T>) => {
    const Icon = option.icon;
    if (Icon) {
      return <Icon aria-hidden="true" className={`h-4 w-4 ${option.iconClassName ?? ""}`} />;
    }
    return (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/5"
        style={{ backgroundColor: option.color }}
      />
    );
  };

  return (
    <RichSelect value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
      <RichSelectTrigger
        aria-label={ariaLabel}
        className="h-10 rounded-lg border-border bg-surface-1 hover:border-primary/50"
      >
        <div data-ticket-select-value className="flex min-w-0 items-center gap-2">
          {selected && marker(selected)}
          <span className="truncate">{selected?.label}</span>
        </div>
      </RichSelectTrigger>
      <RichSelectContent className="z-[250]">
        {options.map((option) => (
          <RichSelectItem key={option.value} value={option.value} className="py-2">
            <span className="flex min-w-0 items-center gap-2">
              {marker(option)}
              <span className="truncate">{option.label}</span>
            </span>
          </RichSelectItem>
        ))}
      </RichSelectContent>
    </RichSelect>
  );
}

function TicketEditor({
  open,
  onClose,
  onSaved,
  initialConversationId,
  initialTicket,
  clone = false,
  customerPortal = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (ticket: ApiTicket) => void;
  initialConversationId?: string;
  initialTicket?: ApiTicket | null;
  clone?: boolean;
  customerPortal?: boolean;
}) {
  const options = useTicketOptions(open && !customerPortal);
  const initialConversation = useQuery({
    queryKey: ["tickets", "prefill-conversation", initialConversationId],
    queryFn: () => conversationApi.get(initialConversationId!),
    enabled: open && !!initialConversationId,
  });
  const initialMessages = useQuery({
    queryKey: ["tickets", "prefill-conversation-messages", initialConversationId],
    queryFn: () =>
      messageApi.list(initialConversationId!, { limit: 100 }).then((page) => page.items),
    enabled: open && !!initialConversationId,
  });
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<ApiTicketCategory>("SUPORTE");
  const [priority, setPriority] = React.useState<ApiTicketPriority>("NORMAL");
  const [departmentId, setDepartmentId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [requesterSearch, setRequesterSearch] = React.useState("");
  const [requesterResultsOpen, setRequesterResultsOpen] = React.useState(false);
  const [customerId, setCustomerId] = React.useState("");
  const [customerDepartmentId, setCustomerDepartmentId] = React.useState("");
  const [originBranchId, setOriginBranchId] = React.useState("");
  const [conversationId, setConversationId] = React.useState("");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const submittingRef = React.useRef(false);
  const initializedSessionRef = React.useRef<string | null>(null);
  const conversationPrefillRef = React.useRef<string | null>(null);
  const descriptionPrefillRef = React.useRef<string | null>(null);
  const dirtyFieldsRef = React.useRef({
    title: false,
    description: false,
    department: false,
    requester: false,
    customer: false,
    assignee: false,
  });
  const defaultDepartmentId = options.departments[0]?.id ?? "";
  const sessionKey = `${initialTicket?.id ?? "new"}:${clone}:${initialConversationId ?? ""}`;
  const requesterContacts = useQuery({
    queryKey: ["tickets", "requester-contacts", requesterSearch],
    queryFn: () => crmApi.listContacts({ q: requesterSearch.trim() || undefined, pageSize: 20 }),
    enabled: open,
  });
  const customerDepartments = useQuery({
    queryKey: ["tickets", "customer-departments", customerId],
    queryFn: () => crmApi.listCustomerDepartments(customerId),
    enabled: open && !customerPortal && !!customerId,
  });
  const customerBranches = useQuery({
    queryKey: ["tickets", "customer-branches", customerId],
    queryFn: () => crmApi.listCustomerBranches(customerId),
    enabled: open && !customerPortal && !!customerId,
  });

  React.useEffect(() => {
    if (!open) {
      initializedSessionRef.current = null;
      conversationPrefillRef.current = null;
      descriptionPrefillRef.current = null;
      return;
    }
    if (initializedSessionRef.current === sessionKey) return;
    initializedSessionRef.current = sessionKey;
    conversationPrefillRef.current = null;
    descriptionPrefillRef.current = null;
    dirtyFieldsRef.current = {
      title: false,
      description: false,
      department: false,
      requester: false,
      customer: false,
      assignee: false,
    };
    setTitle(initialTicket ? (clone ? `${initialTicket.title} - Cópia` : initialTicket.title) : "");
    setDescription(initialTicket?.descriptionHtmlSanitized ?? initialTicket?.descriptionText ?? "");
    setCategory(initialTicket?.category ?? "SUPORTE");
    setPriority(initialTicket?.priority ?? "NORMAL");
    setDepartmentId(initialTicket?.department?.id ?? (customerPortal ? "portal-context" : ""));
    setContactId(initialTicket?.requesterContact?.id ?? "");
    setRequesterSearch(initialTicket?.requesterContact?.name ?? "");
    setRequesterResultsOpen(false);
    setCustomerId(initialTicket?.customer?.id ?? "");
    setCustomerDepartmentId(initialTicket?.customerDepartment?.id ?? "");
    setOriginBranchId(initialTicket?.originBranch?.id ?? "");
    setConversationId(initialTicket?.conversation?.id ?? initialConversationId ?? "");
    setAssignedMembershipId(initialTicket?.assignedMembership?.id ?? "");
    setAttachments([]);
  }, [clone, customerPortal, initialConversationId, initialTicket, open, sessionKey]);

  React.useEffect(() => {
    if (!open || initialTicket || initialConversationId || departmentId || !defaultDepartmentId)
      return;
    setDepartmentId(defaultDepartmentId);
  }, [defaultDepartmentId, departmentId, initialConversationId, initialTicket, open]);

  React.useEffect(() => {
    const conversation = initialConversation.data;
    if (!open || initialTicket || !conversation) return;
    const prefillKey = `${sessionKey}:${conversation.id}`;
    if (conversationPrefillRef.current === prefillKey) return;
    conversationPrefillRef.current = prefillKey;

    setConversationId(conversation.id);
    if (!dirtyFieldsRef.current.requester) {
      setContactId(conversation.contact_id ?? "");
      setRequesterSearch(conversation.contact?.nome ?? "");
    }
    if (!dirtyFieldsRef.current.customer) {
      setCustomerId(conversation.contact?.customer_id ?? conversation.contact?.customer?.id ?? "");
    }
    if (!dirtyFieldsRef.current.department) {
      setDepartmentId(conversation.department_id ?? defaultDepartmentId);
    }
    if (!dirtyFieldsRef.current.assignee) {
      setAssignedMembershipId(conversation.assigned_membership_id ?? "");
    }
    if (!dirtyFieldsRef.current.title) {
      setTitle(
        `Chamado aberto pelo Chat - ${conversation.protocolo ?? conversation.id.slice(0, 8)}`,
      );
    }
  }, [defaultDepartmentId, initialConversation.data, initialTicket, open, sessionKey]);

  React.useEffect(() => {
    const conversation = initialConversation.data;
    const messages = initialMessages.data;
    if (!open || initialTicket || !conversation || !messages?.length) return;
    const prefillKey = `${sessionKey}:${conversation.id}`;
    if (descriptionPrefillRef.current === prefillKey) return;
    descriptionPrefillRef.current = prefillKey;
    if (!dirtyFieldsRef.current.description) {
      setDescription(buildConversationTicketDescription(conversation, messages));
    }
  }, [initialConversation.data, initialMessages.data, initialTicket, open, sessionKey]);

  const submit = async () => {
    if (!title.trim()) return toast.error("Informe o título.");
    if (!description.trim()) return toast.error("Informe a descrição.");
    if (!departmentId) return toast.error("Selecione o departamento.");
    if (customerDepartments.data?.length && !customerDepartmentId)
      return toast.error("Selecione o departamento do cliente.");
    if (customerBranches.data?.length && !originBranchId)
      return toast.error("Selecione a filial de origem.");
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const descriptionHtml = /<[^>]+>/.test(description) ? description : textToHtml(description);
      let ticket: ApiTicket;
      if (initialTicket && !clone) {
        ticket = initialTicket;
        if (departmentId !== initialTicket.department?.id) {
          ticket = await ticketApi.updateDepartment(ticket.id, departmentId);
        }
        ticket = await ticketApi.update(initialTicket.id, {
          title: title.trim(),
          descriptionHtml,
          category,
          priority,
        });
        if (assignedMembershipId !== (initialTicket.assignedMembership?.id ?? "")) {
          ticket = await ticketApi.updateAssignee(ticket.id, assignedMembershipId || null);
        }
      } else {
        ticket = await ticketApi.create({
          title: title.trim(),
          descriptionHtml,
          category,
          priority,
          departmentId,
          requesterContactId: contactId || null,
          customerId: customerId || null,
          customerDepartmentId: customerDepartmentId || null,
          originBranchId: originBranchId || null,
          conversationId: conversationId || null,
          assignedMembershipId: assignedMembershipId || null,
        });
      }
      const failedAttachments: string[] = [];
      for (const file of attachments) {
        try {
          await ticketApi.uploadAttachment(ticket.id, file);
        } catch {
          failedAttachments.push(file.name);
        }
      }
      if (failedAttachments.length) {
        toast.error(
          `${ticket.protocol} foi ${initialTicket && !clone ? "atualizado" : "criado"}, mas ${failedAttachments.length} anexo(s) não foram enviados. Revise os tipos permitidos e tente anexá-los no chamado.`,
        );
        onSaved(ticket);
        return;
      }
      toast.success(initialTicket && !clone ? "Chamado atualizado." : `${ticket.protocol} criado`);
      onSaved(ticket);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const addAttachments = (selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter((file) => {
      if (!allowedAttachmentMimeTypes.has(file.type.toLowerCase())) {
        toast.error(`${file.name} não possui um formato permitido.`);
        return false;
      }
      if (file.size <= maxAttachmentSizeMb * 1024 * 1024) return true;
      toast.error(`${file.name} excede o limite permitido de ${maxAttachmentSizeMb} MB.`);
      return false;
    });
    setAttachments((current) => {
      const known = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      const unique = validFiles.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      const available = Math.max(0, maxAttachmentCount - current.length);
      if (unique.length > available) {
        toast.error(`É possível anexar até ${maxAttachmentCount} arquivos por chamado.`);
      }
      return [...current, ...unique.slice(0, available)];
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initialTicket && !clone ? "Editar Chamado" : clone ? "Duplicar Chamado" : "Novo Chamado"
      }
      size="xl"
      className="max-w-5xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
            {busy ? "Salvando..." : initialTicket && !clone ? "Salvar" : "Salvar Chamado"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <Field label="Cliente *">
            {customerPortal ? (
              <Input value="Definido pelo seu acesso" readOnly />
            ) : (
              <Select
                value={customerId}
                onChange={(event) => {
                  dirtyFieldsRef.current.customer = true;
                  setCustomerId(event.target.value);
                  setCustomerDepartmentId("");
                  setOriginBranchId("");
                }}
              >
                <option value="">Selecione...</option>
                {options.customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Departamento *">
            {customerPortal ? (
              <Input value="Definido pelo seu acesso" readOnly />
            ) : (
              <Select
                value={customerDepartmentId}
                onChange={(event) => setCustomerDepartmentId(event.target.value)}
                disabled={!customerId}
              >
                <option value="">Selecione...</option>
                {(customerDepartments.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Solicitante *">
            {customerPortal ? (
              <Input value="Você" readOnly />
            ) : (
              <div
                className="relative"
                onFocusCapture={() => setRequesterResultsOpen(true)}
                onBlurCapture={() => window.setTimeout(() => setRequesterResultsOpen(false), 120)}
              >
                <SearchInput
                  value={requesterSearch}
                  onChange={(value) => {
                    dirtyFieldsRef.current.requester = true;
                    setRequesterSearch(value);
                    setContactId("");
                    setRequesterResultsOpen(true);
                  }}
                  placeholder="Buscar contato..."
                />
                {requesterResultsOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-elevated">
                    {requesterContacts.isFetching ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        Buscando contatos...
                      </p>
                    ) : requesterContacts.data?.items.length ? (
                      requesterContacts.data.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-1"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            dirtyFieldsRef.current.requester = true;
                            setContactId(item.id);
                            setRequesterSearch(item.nome);
                            setRequesterResultsOpen(false);
                          }}
                        >
                          <span className="min-w-0 truncate font-medium">{item.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {item.telefone
                              ? formatPhoneForDisplay(item.telefone)
                              : item.email || "Sem telefone"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        Nenhum contato encontrado.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <Field label="Filial de origem *">
            {customerPortal ? (
              <Input value="Definida pelo seu acesso" readOnly />
            ) : (
              <Select
                value={originBranchId}
                onChange={(event) => setOriginBranchId(event.target.value)}
                disabled={!customerId}
                aria-label="Filial de origem"
              >
                <option value="">Selecione...</option>
                {(customerBranches.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Prioridade *" asLabel={false}>
            <TicketEditorSelect
              ariaLabel="Prioridade"
              value={priority}
              onChange={setPriority}
              options={priorities
                .filter((item) => item !== "BAIXA")
                .map((item) => ({
                  value: item,
                  label: priorityLabel(item),
                  color: priorityDot(item),
                }))}
            />
          </Field>
          <Field label="Tipo do Chamado *" asLabel={false}>
            <TicketEditorSelect
              ariaLabel="Tipo do Chamado"
              value={category}
              onChange={setCategory}
              options={categories
                .filter((item) => item === "SUPORTE" || item === "DEV")
                .map((item) => ({
                  value: item,
                  label: item === "DEV" ? "Desenvolvimento (DEV)" : categoryLabel(item),
                  icon: item === "SUPORTE" ? Headphones : Code2,
                  iconClassName: item === "SUPORTE" ? "text-primary" : "text-destructive",
                }))}
            />
          </Field>
        </div>
        <Field label="Título *">
          <Input
            value={title}
            onChange={(event) => {
              dirtyFieldsRef.current.title = true;
              setTitle(event.target.value);
            }}
            maxLength={180}
          />
        </Field>
        <Field label="Descrição *" asLabel={false}>
          <RichTextEditor
            value={description}
            onChange={(value) => {
              dirtyFieldsRef.current.description = true;
              setDescription(value);
            }}
          />
        </Field>
        <div className="rounded-lg border border-dashed border-border bg-surface-1 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              Anexos <span className="text-destructive">*</span>
            </p>
            <span aria-live="polite" className="text-xs text-muted-foreground">
              {attachments.length}/{maxAttachmentCount} arquivos
            </span>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Paperclip className="h-4 w-4" />
            {attachments.length ? "Adicionar mais arquivos" : "Escolher arquivos"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              multiple
              className="sr-only"
              onChange={(event) => {
                addAttachments(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </label>
          {attachments.length > 0 && (
            <div
              className="mt-2 grid max-h-28 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2"
              aria-label="Arquivos selecionados"
            >
              {attachments.map((file) => {
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                return (
                  <div
                    key={key}
                    className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs" title={file.name}>
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {Math.max(1, Math.ceil(file.size / 1024))} KB
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 min-h-0 w-7 shrink-0 p-0"
                      aria-label={`Remover arquivo ${file.name}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter(
                            (item) => `${item.name}:${item.size}:${item.lastModified}` !== key,
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            PDF, PNG, JPG, WEBP e TXT · máximo de {maxAttachmentSizeMb} MB por arquivo.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function TicketDetail({
  ticketId,
  onClose,
  onChanged,
  canUpdate,
  canUpdateStatus,
  canComment,
  canUploadAttachment,
  canDeleteAttachment,
  canDelete,
  onDelete,
  customerPortal,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canUpdate: boolean;
  canUpdateStatus: boolean;
  canComment: boolean;
  canUploadAttachment: boolean;
  canDeleteAttachment: boolean;
  canDelete: boolean;
  onDelete: (ticket: ApiTicket) => void;
  customerPortal: boolean;
}) {
  const ticket = useQuery({
    queryKey: ["tickets", "detail", ticketId],
    queryFn: () => ticketApi.get(ticketId!),
    enabled: !!ticketId,
  });
  const comments = useQuery({
    queryKey: ["tickets", "comments", ticketId],
    queryFn: () => ticketApi.comments(ticketId!),
    enabled: !!ticketId,
  });
  const attachments = useQuery({
    queryKey: ["tickets", "attachments", ticketId],
    queryFn: () => ticketApi.attachments(ticketId!),
    enabled: !!ticketId,
  });
  const approvals = useQuery({
    queryKey: ["tickets", "approvals", ticketId],
    queryFn: () => ticketApi.approvals(ticketId!),
    enabled: !!ticketId,
  });
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const currentUserId = useSession((state) => state.user?.id);
  const [action, setAction] = React.useState<
    "reply" | "transfer" | "approval" | "solve" | "cancel"
  >("reply");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const options = useTicketOptions(!!ticketId && !customerPortal);
  const item = ticket.data;

  React.useEffect(() => {
    setAction("reply");
    setComment("");
    setEditingCommentId(null);
  }, [ticketId]);

  const refresh = () => {
    ticket.refetch();
    comments.refetch();
    attachments.refetch();
    approvals.refetch();
    onChanged();
  };

  const decidePendingApproval = async (decision: "APPROVED" | "REJECTED") => {
    const pending = approvals.data?.find((entry) => entry.status === "PENDING");
    if (!ticketId || !pending) return;
    if (decision === "REJECTED" && !comment.trim())
      return toast.error("Informe o motivo da recusa.");
    setBusy(true);
    try {
      await ticketApi.decideApproval(ticketId, pending.id, {
        decision,
        bodyHtml: comment.trim() ? (/^</.test(comment) ? comment : textToHtml(comment)) : undefined,
      });
      setComment("");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const validateSolution = async (decision: "APPROVED" | "REJECTED") => {
    if (!ticketId) return;
    if (decision === "REJECTED" && !comment.trim())
      return toast.error("Informe o motivo da recusa.");
    setBusy(true);
    try {
      await ticketApi.validateSolution(ticketId, {
        decision,
        bodyHtml: comment.trim() ? (/^</.test(comment) ? comment : textToHtml(comment)) : undefined,
      });
      setComment("");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!ticketId || !comment.trim()) return;
    setBusy(true);
    try {
      const bodyHtml = /<[^>]+>/.test(comment) ? comment : textToHtml(comment);
      if (editingCommentId) {
        await ticketApi.updateComment(ticketId, editingCommentId, bodyHtml);
      } else if (action === "transfer") {
        if (!assignedMembershipId) throw new Error("Selecione uma fila ou responsável.");
        if (!item?.department?.id) throw new Error("O chamado precisa de um departamento.");
        await ticketApi.transfer(ticketId, {
          bodyHtml,
          departmentId: item.department.id,
          assignedMembershipId,
        });
      } else if (action === "approval") {
        await ticketApi.requestApproval(ticketId, { bodyHtml });
      } else if (action === "solve") {
        await ticketApi.solve(ticketId, bodyHtml);
      } else if (action === "cancel") {
        await ticketApi.cancel(ticketId, bodyHtml);
      } else {
        await ticketApi.respond(ticketId, bodyHtml);
      }
      setComment("");
      setEditingCommentId(null);
      setAction("reply");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!ticketId}
      onClose={onClose}
      title={item ? `#${item.protocol.replace(/^#/, "")}   ${item.title}` : "Chamado"}
      size="xl"
      className="max-w-[1380px]"
      footer={
        item ? (
          <>
            {canDelete && !customerPortal && (
              <Button
                variant="outline"
                size="sm"
                className="mr-auto border-destructive text-destructive"
                onClick={() => onDelete(item)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
            {customerPortal ? (
              <Button variant="primary" size="sm" onClick={onClose} disabled={busy}>
                Fechar
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={onClose} disabled={busy}>
                  Salvar
                </Button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {!item ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="order-2 flex min-h-0 flex-col lg:order-1">
            <div className="space-y-3">
              <DialogBubble
                side="left"
                initials={initials(item.createdByMembership.user.name)}
                author={item.requesterContact?.name ?? item.createdByMembership.user.name}
                date={formatDate(item.createdAt)}
                title="Descrição do chamado"
                body={item.descriptionText ?? ""}
                tone="blue"
              />
              {comments.data?.map((entry) => (
                <DialogBubble
                  key={entry.id}
                  side="right"
                  initials={initials(entry.authorMembership.user.name)}
                  author={entry.authorMembership.user.name}
                  date={formatDate(entry.createdAt)}
                  editedDate={entry.editedAt ? formatDate(entry.editedAt) : undefined}
                  body={entry.bodyText}
                  tone={dialogTone(entry.dialogType)}
                  onEdit={
                    entry.authorMembership.user.id === currentUserId
                      ? () => {
                          setEditingCommentId(entry.id);
                          setComment(entry.bodyHtmlSanitized ?? textToHtml(entry.bodyText));
                          setAction("reply");
                        }
                      : undefined
                  }
                />
              ))}
            </div>
            {approvals.data?.some((entry) => entry.status === "PENDING") && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <h3 className="font-semibold text-emerald-800">Aprovação pendente</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registre um comentário para recusar ou aprove a solicitação.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => decidePendingApproval("REJECTED")}
                    disabled={busy}
                  >
                    Recusar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => decidePendingApproval("APPROVED")}
                    disabled={busy}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            )}
            {item.status === "CONCLUIDA" && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                <h3 className="font-semibold text-blue-800">Aprovação da solução</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use o campo de resposta para informar o motivo em caso de recusa.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => validateSolution("REJECTED")}
                    disabled={busy}
                  >
                    Recusar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => validateSolution("APPROVED")}
                    disabled={busy}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            )}
            {canComment && (
              <div className={`mt-4 rounded-xl border p-3 ${actionPanelTone(action)}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-semibold">
                    {editingCommentId ? "Editar diálogo" : actionLabel(action)}
                  </h3>
                  {!editingCommentId && !customerPortal && (
                    <select
                      value={action}
                      onChange={(event) => setAction(event.target.value as typeof action)}
                      className="min-h-9 rounded-lg border border-border bg-card px-3 text-sm"
                    >
                      <option value="reply">Responder</option>
                      <option value="transfer">Transferir</option>
                      <option value="approval">Solicitar aprovação</option>
                      <option value="solve">Solucionar</option>
                      <option value="cancel">Cancelar chamado</option>
                    </select>
                  )}
                </div>
                {action === "transfer" && (
                  <Field label="Fila *">
                    <Select
                      value={assignedMembershipId}
                      onChange={(event) => setAssignedMembershipId(event.target.value)}
                    >
                      <option value="">Selecione uma fila</option>
                      {options.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.user.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {action === "approval" && (
                  <Field label="Aprovador *">
                    <Input
                      value={
                        item.category === "DEV" ? "Gestor do contrato" : "Gerente do departamento"
                      }
                      readOnly
                    />
                  </Field>
                )}
                <div className="mt-3">
                  <RichTextEditor value={comment} onChange={setComment} />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setComment("");
                      setEditingCommentId(null);
                      setAction("reply");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addComment}
                    disabled={busy || !comment.trim()}
                  >
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
              </div>
            )}
          </section>
          <aside className="order-1 border-b border-border pb-4 lg:order-2 lg:border-b-0 lg:border-l lg:pl-5">
            <div className="mb-4 flex gap-5 border-b border-border text-sm">
              <button className="border-b-2 border-primary px-1 pb-2 font-semibold">Resumo</button>
              <span className="pb-2 text-muted-foreground">
                Anexos ({attachments.data?.length ?? 0})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ReadonlyField label="Cliente" value={item.customer?.name ?? "Sem vínculo"} />
              <ReadonlyField
                label="Departamento"
                value={item.customerDepartment?.name ?? item.department?.name ?? "Sem departamento"}
              />
              <ReadonlyField
                label="Solicitante"
                value={item.requesterContact?.name ?? item.createdByMembership.user.name}
              />
              <ReadonlyField
                label="Filial de origem"
                value={item.originBranch?.name ?? "Sem filial"}
              />
              <Field label="Prioridade *">
                {canUpdate && !customerPortal ? (
                  <Select
                    value={item.priority}
                    onChange={async (event) => {
                      await ticketApi.update(item.id, {
                        priority: event.target.value as ApiTicketPriority,
                      });
                      refresh();
                    }}
                  >
                    {priorities.map((value) => (
                      <option key={value} value={value}>
                        {priorityLabel(value)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input value={priorityLabel(item.priority)} readOnly />
                )}
              </Field>
              <ReadonlyField label="Tipo do Chamado" value={categoryLabel(item.category)} />
            </div>
            <div className="my-4 border-t border-border pt-4">
              <h3 className="mb-3 font-semibold">Datas</h3>
              <DateRow label="Data de abertura" value={formatDate(item.createdAt)} />
              <DateRow
                label="Data de aprovação"
                value={item.approvedAt ? formatDate(item.approvedAt) : "-"}
              />
              <DateRow
                label="Data de início"
                value={item.startedAt ? formatDate(item.startedAt) : "-"}
              />
              <DateRow
                label="Data da solução"
                value={item.solvedAt ? formatDate(item.solvedAt) : "-"}
              />
              <DateRow
                label="Data de validação"
                value={item.validatedAt ? formatDate(item.validatedAt) : "-"}
              />
              <DateRow label="Última atualização" value={formatDate(item.updatedAt)} />
            </div>
            <div className="border-t border-border pt-4">
              <Field label="Status atual">
                {canUpdateStatus && !customerPortal ? (
                  <Select
                    value={item.status}
                    onChange={async (event) => {
                      await ticketApi.updateStatus(item.id, event.target.value as ApiTicketStatus);
                      refresh();
                    }}
                  >
                    {statuses.map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input value={statusLabel(item.status)} readOnly />
                )}
              </Field>
              <Field label="Sub-status">
                <Select
                  value={item.substatus ?? "OPENED_IN_SANKHYA"}
                  disabled={!canUpdate || customerPortal}
                  onChange={async (event) => {
                    await ticketApi.update(item.id, {
                      substatus: event.target.value as ApiTicketSubstatus,
                    });
                    refresh();
                  }}
                >
                  <option value="OPENED_IN_SANKHYA">Chamado aberto na Sankhya</option>
                  <option value="FORWARDED_TO_THIRD_PARTY">
                    Chamado encaminhado para terceiro
                  </option>
                  <option value="WAITING">Aguardando</option>
                  <option value="WAITING_INFRASTRUCTURE">Aguardando posição da infra</option>
                </Select>
              </Field>
              <p className="mt-3 text-xs text-muted-foreground">Responsável atual</p>
              <div className="mt-1 flex items-center gap-2 font-semibold">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-sm text-primary">
                  {initials(item.assignedMembership?.user.name ?? "Fila")}
                </span>
                {item.assignedMembership?.user.name ?? "Fila"}
              </div>
              {!customerPortal && (
                <>
                  <p className="mt-4 text-xs text-muted-foreground">Etiquetas</p>
                  <Button variant="ghost" size="sm" className="mt-1">
                    <Plus className="h-4 w-4" /> Adicionar etiqueta
                  </Button>
                </>
              )}
            </div>
            <div className="mt-5">
              <Attachments
                ticketId={item.id}
                items={attachments.data ?? []}
                onChanged={refresh}
                canUpload={canUploadAttachment}
                canDelete={canDeleteAttachment}
              />
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

function Attachments({
  ticketId,
  items,
  onChanged,
  canUpload,
  canDelete,
}: {
  ticketId: string;
  items: ApiTicketAttachment[];
  onChanged: () => void;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const upload = async (selectedFiles: File[]) => {
    const available = Math.max(0, maxAttachmentCount - items.length);
    if (selectedFiles.length > available) {
      toast.error(`É possível manter até ${maxAttachmentCount} arquivos por chamado.`);
    }
    const files = selectedFiles.slice(0, available).filter((file) => {
      if (!allowedAttachmentMimeTypes.has(file.type.toLowerCase())) {
        toast.error(`${file.name} não possui um formato permitido.`);
        return false;
      }
      if (file.size <= maxAttachmentSizeMb * 1024 * 1024) return true;
      toast.error(`${file.name} excede o limite permitido de ${maxAttachmentSizeMb} MB.`);
      return false;
    });
    if (!files.length) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        files.map((file) => ticketApi.uploadAttachment(ticketId, file)),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) toast.error(`${failed} anexo(s) não foram enviados.`);
      if (failed < results.length) toast.success(`${results.length - failed} anexo(s) enviados.`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const download = async (attachment: ApiTicketAttachment) => {
    const blob = await ticketApi.download(ticketId, attachment.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const preview = async (attachment: ApiTicketAttachment) => {
    const blob = await ticketApi.preview(ticketId, attachment.id);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Atrixus privados</h3>
        {canUpload && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-1">
            <Paperclip className="h-3.5 w-3.5" /> {busy ? "Enviando..." : "Anexar"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                void upload(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="flex items-center justify-between gap-3 p-3">
            <button
              type="button"
              className="min-w-0 truncate text-left text-sm underline-offset-2 hover:underline"
              title={item.originalName}
              onClick={() => preview(item)}
            >
              {item.originalName}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{Math.ceil(item.sizeBytes / 1024)} KB</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Visualizar atrixus"
                onClick={() => preview(item)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Baixar atrixus"
                onClick={() => download(item)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="trash-action"
                  aria-label="Remover atrixus"
                  onClick={async () => {
                    await ticketApi.deleteAttachment(ticketId, item.id);
                    onChanged();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum atrixus disponível.</p>
        )}
      </div>
    </section>
  );
}

function useTicketOptions(enabled: boolean) {
  const departments = useQuery({
    queryKey: ["tickets", "departments"],
    queryFn: organizationApi.listDepartments,
    enabled,
  });
  const users = useQuery({
    queryKey: ["tickets", "users"],
    queryFn: organizationApi.listUsers,
    enabled,
  });
  const customers = useQuery({
    queryKey: ["tickets", "customers"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
    enabled,
  });
  const conversations = useQuery({
    queryKey: ["tickets", "conversations"],
    queryFn: () => conversationApi.list({ pageSize: 100 }),
    enabled,
  });
  return {
    departments: sortByOptionLabel(
      departments.data ?? ([] as ApiDepartment[]),
      (item) => item.name,
    ),
    users: sortByOptionLabel(users.data ?? ([] as ApiUserMembership[]), (item) => item.user.name),
    customers: sortByOptionLabel(
      customers.data?.items ?? ([] as ApiCustomer[]),
      (item) => item.nome,
    ),
    conversations: sortByOptionLabel(
      conversations.data?.items ?? [],
      (item) => `${item.protocolo ?? ""} ${item.contact?.nome ?? "Contato"}`,
    ),
  };
}

function useSessionUserName() {
  return useSession((state) => state.user?.nome ?? "Usuário atual");
}

function buildConversationTicketDescription(conversation: ApiConversation, messages: ApiMessage[]) {
  const header = [
    `Histórico importado da conversa ${conversation.protocolo ?? conversation.id}`,
    `Contato: ${conversation.contact?.nome ?? "Sem contato"}`,
    conversation.contact?.telefone ? `Telefone: ${conversation.contact.telefone}` : null,
    conversation.department?.nome ? `Departamento: ${conversation.department.nome}` : null,
  ].filter(Boolean);
  const ordered = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const lines = ordered.map((message) => {
    const author =
      message.direction === "inbound"
        ? (message.participant?.name ?? conversation.contact?.nome ?? "Contato")
        : message.sender === "agent"
          ? "Atendente"
          : "Sistema";
    const type = messageTypeLabel(message.type);
    const content =
      message.content && !message.content.startsWith("[")
        ? message.content
        : message.media_data?.file_name
          ? `${type}: ${message.media_data.file_name}`
          : type;
    return `${author} [${formatDate(message.created_at)}]: ${content}`;
  });
  return [...header, "", ...lines].join("\n");
}

function messageTypeLabel(type: ApiMessage["type"]) {
  const labels: Record<ApiMessage["type"], string> = {
    text: "Texto",
    image: "Imagem",
    audio: "Áudio",
    voice: "Voz",
    video: "Vídeo",
    document: "Documento",
    system: "Sistema",
  };
  return labels[type] ?? "Mensagem";
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusLabel(status: ApiTicketStatus) {
  return (
    {
      ABERTO: "Aberto",
      EM_ANDAMENTO: "Em andamento",
      AGUARDANDO: "Aguardando",
      RESOLVIDO: "Resolvido",
      FECHADO: "Fechado",
      CANCELADO: "Cancelado",
      NOVO: "Novo",
      AGUARDANDO_APROVACAO: "Aguardando aprovação",
      NA_FILA: "Na fila",
      EM_EXECUCAO: "Em execução",
      CONCLUIDA: "Concluída",
      VALIDADO: "Validado",
      REPROVADO: "Reprovado",
    } satisfies Record<ApiTicketStatus, string>
  )[status];
}
function priorityLabel(priority: ApiTicketPriority) {
  return (
    {
      BAIXA: "Baixa",
      NORMAL: "Normal",
      ALTA: "Alta",
      URGENTE: "Urgente",
      ALTISSIMA: "Altíssima",
    } satisfies Record<ApiTicketPriority, string>
  )[priority];
}
function categoryLabel(category: ApiTicketCategory) {
  return (
    {
      SUPORTE: "Suporte",
      DEV: "DEV",
      FINANCEIRO: "Financeiro",
      OPERACIONAL: "Operacional",
    } satisfies Record<ApiTicketCategory, string>
  )[category];
}
function statusTone(status: ApiTicketStatus) {
  if (status === "FECHADO" || status === "RESOLVIDO") return "success";
  if (status === "AGUARDANDO") return "warning";
  if (status === "CANCELADO") return "destructive";
  return "info";
}
function priorityTone(priority: ApiTicketPriority) {
  if (priority === "URGENTE") return "destructive";
  if (priority === "ALTA") return "warning";
  if (priority === "BAIXA") return "default";
  return "info";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
