import { RichTextEditor } from "@/components/ticket-rich-text-editor";
import { TicketRichTextContent } from "@/components/ticket-rich-text-content";
import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  LayoutGrid,
  List,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ClearFiltersButton } from "@/components/clear-filters-button";
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
import { GridPaginationFooter } from "@/components/grid-pagination-footer";
import {
  Select as RichSelect,
  SelectContent as RichSelectContent,
  SelectItem as RichSelectItem,
  SelectTrigger as RichSelectTrigger,
} from "@/components/ui/select";
import { useDisclosure } from "@/hooks/use-disclosure";
import { useIsMobile } from "@/hooks/use-mobile";
import { num } from "@/lib/format";
import { formatPhoneForDisplay, formatPhoneVariable } from "@/lib/input-masks";
import { showRequiredFieldsToast } from "@/lib/required-fields";
import {
  conversationApi,
  aiApi,
  crmApi,
  messageApi,
  organizationApi,
  ticketApi,
  type ApiConversation,
  type ApiAiTicketDraft,
  type ApiMessage,
  type ApiCustomer,
  type ApiDepartment,
  type ApiTicket,
  type ApiTicketAttachment,
  type ApiTicketComment,
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
  validateSearch: validateTicketSearch,
  head: () => ({
    meta: [
      { title: "Trixus" },
      { name: "description", content: "Chamados gerenciados pela API Trixus." },
    ],
  }),
  component: InternalChamadosRoute,
});

export function validateTicketSearch(search: Record<string, unknown>) {
  return {
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    ticketId: typeof search.ticketId === "string" ? search.ticketId : undefined,
    aiExecutionId: typeof search.aiExecutionId === "string" ? search.aiExecutionId : undefined,
  };
}

export type TicketSearch = ReturnType<typeof validateTicketSearch>;

function InternalChamadosRoute() {
  return <ChamadosPage mode="internal" search={Route.useSearch()} />;
}

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
const priorities: ApiTicketPriority[] = ["BAIXA", "NORMAL", "ALTA", "ALTISSIMA"];
const categories: ApiTicketCategory[] = ["SUPORTE", "DEV", "FINANCEIRO", "OPERACIONAL"];
const listKey = ["tickets", "list"] as const;
const summaryKey = ["tickets", "summary"] as const;
const maxAttachmentSizeMb = 10;
const maxAttachmentCount = 20;
const allowedAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

export function ChamadosPage({
  mode,
  search,
}: {
  mode: "internal" | "customer_portal";
  search: TicketSearch;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const permissions = useSession((state) => state.user?.permissions ?? []);
  const isCustomerPortal = mode === "customer_portal";
  const portalAccessId = useSession((state) => state.user?.portalAccessId);
  const canView = permissions.includes("tickets.read");
  const canCreate = permissions.includes("tickets.create");
  const canUpdate = permissions.includes("tickets.update");
  const canUpdateStatus = canUpdate;
  const canComment = canUpdate;
  const canUploadAttachment = canUpdate;
  const canDelete = permissions.includes("tickets.delete");
  const novo = useDisclosure();
  const setNewTicketOpen = novo.set;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApiTicketStatus | "">("");
  const [customerId, setCustomerId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailMode, setDetailMode] = React.useState<"view" | "manage">("view");
  const [editingTicket, setEditingTicket] = React.useState<ApiTicket | null>(null);
  const [duplicatingTicket, setDuplicatingTicket] = React.useState<ApiTicket | null>(null);
  const [deletingTicket, setDeletingTicket] = React.useState<ApiTicket | null>(null);
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = React.useState<"cards" | "list">("list");
  const viewModeTouched = React.useRef(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const hasFilters = Boolean(query || status || customerId || departmentId);

  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setCustomerId("");
    setDepartmentId("");
    setPage(1);
  };

  React.useEffect(() => {
    if (isMobile) {
      setViewMode("cards");
      return;
    }
    if (!viewModeTouched.current) setViewMode("list");
  }, [isMobile]);
  const params = {
    search: query || undefined,
    status: status || undefined,
    customerId: customerId || undefined,
    departmentId: departmentId || undefined,
    conversationId: search.conversationId,
    page,
    pageSize,
  };
  const tickets = useQuery({
    queryKey: [...listKey, mode, portalAccessId ?? "internal", params],
    queryFn: () => ticketApi.list(params),
  });
  const ticketSummary = useQuery({
    queryKey: [...summaryKey, mode, portalAccessId ?? "internal", params],
    queryFn: () =>
      ticketApi.summary({
        search: params.search,
        status: params.status,
        customerId: params.customerId,
        departmentId: params.departmentId,
        conversationId: params.conversationId,
      }),
  });
  const options = useTicketOptions(!isCustomerPortal);
  const totalPages = Math.max(1, tickets.data?.totalPages ?? page);
  const summary = {
    new: ticketSummary.data?.counts.NOVO ?? 0,
    approval: ticketSummary.data?.counts.AGUARDANDO_APROVACAO ?? 0,
    queue: ticketSummary.data?.counts.NA_FILA ?? 0,
    running: ticketSummary.data?.counts.EM_EXECUCAO ?? 0,
    done: ticketSummary.data?.counts.CONCLUIDA ?? 0,
    validated: ticketSummary.data?.counts.VALIDADO ?? 0,
    rejected: ticketSummary.data?.counts.REPROVADO ?? 0,
  };

  React.useEffect(() => {
    setPage(1);
  }, [customerId, departmentId, pageSize, query, search.conversationId, status]);

  React.useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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
    if ((search.conversationId || search.aiExecutionId) && canCreate) setNewTicketOpen(true);
  }, [canCreate, search.aiExecutionId, search.conversationId, setNewTicketOpen]);

  const closeNewTicketEditor = React.useCallback(() => {
    setNewTicketOpen(false);
    if (!search.conversationId) return;
    void navigate({
      to: "/inbox/$conversationId",
      params: { conversationId: search.conversationId },
      replace: true,
      resetScroll: false,
    });
  }, [navigate, search.conversationId, setNewTicketOpen]);

  React.useEffect(() => {
    if (search.ticketId) {
      setSelectedId(search.ticketId);
      setDetailMode("view");
    }
  }, [search.ticketId]);

  const paginationFooter = tickets.data ? (
    <GridPaginationFooter
      visible={tickets.data.items.length}
      total={tickets.data.total}
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      onPage={(nextPage) => setPage(nextPage)}
      onPageSize={(nextPageSize) => setPageSize(nextPageSize)}
      suffix="registros"
      ariaLabelPrefix="chamados"
    />
  ) : null;

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
            className={`grid grid-cols-2 gap-3 ${
              isCustomerPortal
                ? hasFilters
                  ? "lg:grid-cols-[1fr_220px_auto]"
                  : "lg:grid-cols-[1fr_220px]"
                : hasFilters
                  ? "lg:grid-cols-[minmax(280px,1.6fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_auto]"
                  : "lg:grid-cols-[minmax(280px,1.6fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)]"
            }`}
          >
            <div className="order-1 min-w-0 lg:order-none">
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar por ID, título ou solicitante"
                />
              </Field>
            </div>
            {!isCustomerPortal && (
              <div className="order-3 lg:order-none">
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
              </div>
            )}
            {!isCustomerPortal && (
              <div className="order-4 lg:order-none">
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
              </div>
            )}
            <div className="order-2 min-w-0 lg:order-none">
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
            {hasFilters && (
              <div className="flex items-end">
                <ClearFiltersButton onClick={clearFilters} />
              </div>
            )}
          </div>
        </Card>

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
          <SummaryCard label="Concluída" value={summary.done} tone="blue" icon={<CheckCircle2 />} />
          <SummaryCard
            label="Validados"
            value={summary.validated}
            tone="validated"
            icon={<CheckCircle2 />}
          />
          <SummaryCard label="Reprovados" value={summary.rejected} tone="red" icon={<Ban />} />
        </div>

        <div
          className="mb-3 hidden justify-end gap-1 md:flex"
          aria-label="Visualização dos chamados"
        >
          <Button
            type="button"
            variant={viewMode === "cards" ? "primary" : "secondary"}
            size="icon"
            aria-label="Visualizar chamados em cards"
            aria-pressed={viewMode === "cards"}
            onClick={() => {
              viewModeTouched.current = true;
              setViewMode("cards");
            }}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "primary" : "secondary"}
            size="icon"
            aria-label="Visualizar chamados em lista"
            aria-pressed={viewMode === "list"}
            onClick={() => {
              viewModeTouched.current = true;
              setViewMode("list");
            }}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

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
            <div className={viewMode === "cards" ? "block" : "hidden"}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tickets.data.items.map((ticket) => (
                  <div
                    key={ticket.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(ticket.id);
                      setDetailMode("manage");
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      setSelectedId(ticket.id);
                      setDetailMode("manage");
                    }}
                    className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-card"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <TicketDatum
                        label="Nº do chamado"
                        value={`#${ticket.protocol.replace(/^#/, "")}`}
                        strong
                      />
                      <TicketDatum
                        label="Status"
                        value={statusLabel(ticket.status)}
                        dot={statusDot(ticket.status)}
                      />
                      <TicketDatum label="Título" value={ticket.title} featured fullWidth />
                      <TicketDatum label="Cliente" value={ticket.customer?.name ?? "Sem vínculo"} />
                      <TicketDatum
                        label="Departamento"
                        value={ticket.department?.name ?? "Sem departamento"}
                      />
                      <TicketDatum
                        label="Solicitante"
                        value={
                          ticket.requesterContact?.name ?? ticket.createdByMembership.user.name
                        }
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
                      <TicketDatum label="Dt. abertura" value={formatDate(ticket.createdAt)} icon />
                      <TicketDatum label="Dt. aprovação" value="-" icon />
                      <TicketDatum
                        label="Dt. conclusão"
                        value={ticket.closedAt ? formatDate(ticket.closedAt) : "-"}
                        icon
                      />
                    </div>
                    {canView && (
                      <div className="mt-3 flex justify-end border-t border-border pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Visualizar chamado"
                          aria-label={`Visualizar chamado ${ticket.protocol}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(ticket.id);
                            setDetailMode("view");
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                {paginationFooter}
              </div>
            </div>
            <Card
              className={viewMode === "list" ? "overflow-hidden p-0" : "hidden"}
              padding={false}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] table-fixed text-sm">
                  <thead className="bg-surface-2">
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="w-32 px-3 py-3">ID</th>
                      <th className="w-[260px] px-3 py-3">Título</th>
                      <th className="px-3 py-3">Prioridade</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Cliente</th>
                      <th className="px-3 py-3">Solicitante</th>
                      <th className="px-3 py-3">Dt. abertura</th>
                      <th className="px-3 py-3">Dt. conclusão</th>
                      <th className="w-16 px-3 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.data.items.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="cursor-pointer border-b border-border/60 hover:bg-surface-1"
                        onClick={() => {
                          setSelectedId(ticket.id);
                          setDetailMode("manage");
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                          {ticket.protocol.replace(/^#/, "")}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-3 font-sans font-semibold text-foreground underline-offset-2 hover:underline">
                          {ticket.title}
                        </td>
                        <td className="px-3 py-3">
                          <StatusDot color={priorityDot(ticket.priority)} />
                          {priorityLabel(ticket.priority)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusDot color={statusDot(ticket.status)} />
                          {statusLabel(ticket.status)}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary">
                            {categoryLabel(ticket.category)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {ticket.customer?.name ?? "Sem vínculo"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {ticket.requesterContact?.name ?? ticket.createdByMembership.user.name}
                        </td>
                        <td className="px-3 py-3 text-xs">{formatDate(ticket.createdAt)}</td>
                        <td className="px-3 py-3 text-xs">
                          {ticket.closedAt ? formatDate(ticket.closedAt) : "-"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {canView && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Visualizar chamado"
                              aria-label={`Visualizar chamado ${ticket.protocol}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedId(ticket.id);
                                setDetailMode("view");
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="hidden md:block">{paginationFooter}</div>
            </Card>
          </>
        )}

        {canCreate && (
          <TicketEditor
            open={novo.open}
            customerPortal={isCustomerPortal}
            initialConversationId={search.conversationId}
            initialAiExecutionId={search.aiExecutionId}
            onClose={closeNewTicketEditor}
            onSaved={(ticket) => {
              novo.hide();
              setSelectedId(ticket.id);
              setDetailMode("manage");
              refreshTickets();
            }}
          />
        )}
        <TicketDetail
          ticketId={selectedId}
          onClose={() => {
            setSelectedId(null);
            setDetailMode("view");
          }}
          onChanged={refreshTickets}
          readOnly={detailMode === "view"}
          canUpdate={detailMode === "manage" && canUpdate}
          canUpdateStatus={detailMode === "manage" && canUpdateStatus}
          canComment={detailMode === "manage" && canComment}
          canUploadAttachment={detailMode === "manage" && canUploadAttachment}
          canDelete={detailMode === "manage" && canDelete}
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
              setDetailMode("manage");
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
              setDetailMode("manage");
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
  tone: "green" | "purple" | "amber" | "blue" | "validated" | "red";
  icon: React.ReactElement;
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50/80 text-emerald-600",
    purple: "border-violet-200 bg-violet-50/80 text-violet-600",
    amber: "border-amber-200 bg-amber-50/80 text-amber-600",
    blue: "border-blue-200 bg-blue-50/80 text-blue-600",
    validated: "border-blue-400 bg-blue-100/90 text-blue-700",
    red: "border-red-200 bg-red-50/80 text-red-600",
  } as const;
  return (
    <div className={`flex min-h-24 flex-col rounded-xl border p-4 ${styles[tone]}`}>
      <p className="w-full text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-current/10 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </div>
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
  dot,
  icon,
  fullWidth,
  featured,
}: {
  label: string;
  value: string;
  strong?: boolean;
  dot?: string;
  icon?: boolean;
  fullWidth?: boolean;
  featured?: boolean;
}) {
  return (
    <div className={`min-w-0 ${fullWidth ? "col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`truncate font-semibold ${featured ? "font-sans text-lg text-foreground" : "text-sm"} ${strong ? "font-semibold" : ""}`}
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
  ticketId,
  attachments,
  initials: avatar,
  author,
  date,
  editedDate,
  title,
  body,
  bodyHtml,
  tone,
  onEdit,
}: {
  side: "left" | "right";
  ticketId: string;
  attachments: ApiTicketAttachment[];
  initials: string;
  author: string;
  date: string;
  editedDate?: string;
  title?: string;
  body: string;
  bodyHtml?: string | null;
  tone: "gray" | "blue" | "green" | "orange" | "red";
  onEdit?: () => void;
}) {
  const previewRef = React.useRef<HTMLDivElement>(null);
  const previewContentRef = React.useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const [showFullDialog, setShowFullDialog] = React.useState(false);
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

  React.useEffect(() => {
    const preview = previewRef.current;
    const previewContent = previewContentRef.current;
    if (!preview || !previewContent) return;
    const updateOverflow = () => setHasOverflow(preview.scrollHeight > preview.clientHeight + 1);
    const frame = window.requestAnimationFrame(updateOverflow);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflow);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", updateOverflow);
      };
    }
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(preview);
    observer.observe(previewContent);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [attachments, body, bodyHtml, date, editedDate, title]);

  const renderDialogContent = () => (
    <>
      <div className="flex flex-wrap gap-x-4 text-xs">
        <strong>{author}</strong>
        <span className="text-muted-foreground">{date}</span>
        {editedDate && <span className="text-muted-foreground">Editado em {editedDate}</span>}
      </div>
      {title && <h3 className="mt-2 border-b border-border pb-2 font-semibold">{title}</h3>}
      {bodyHtml ? (
        <TicketRichTextContent
          html={bodyHtml}
          className="mt-2 break-words text-sm [&_a]:text-primary [&_a]:underline [&_img]:my-2 [&_img]:max-h-[32rem] [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm">{body}</p>
      )}
      <DialogAttachments ticketId={ticketId} items={attachments} />
    </>
  );

  return (
    <>
      <div
        className={`flex items-start gap-3 ${side === "right" ? "justify-end" : "justify-start"}`}
      >
        {side === "left" && avatarNode}
        <div
          className={`group relative w-full max-w-[50%] overflow-hidden rounded-xl ${toneClass}`}
        >
          {onEdit && (
            <button
              type="button"
              aria-label="Editar diálogo"
              onClick={onEdit}
              className="absolute right-2 top-2 z-10 rounded-md p-1 opacity-0 transition hover:bg-black/5 group-hover:opacity-100 focus:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          <div ref={previewRef} className="max-h-[280px] overflow-hidden px-4 py-3">
            <div ref={previewContentRef}>{renderDialogContent()}</div>
          </div>
          {hasOverflow && (
            <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-surface-2 via-surface-2/95 to-transparent px-3 pb-2 pt-8">
              <button
                type="button"
                aria-label="Abrir diálogo completo"
                title="Abrir diálogo completo"
                onClick={() => setShowFullDialog(true)}
                className="grid h-8 min-w-10 place-items-center rounded-lg border border-border bg-card px-2 shadow-sm transition hover:bg-surface-1"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
        {side === "right" && avatarNode}
      </div>
      <Modal
        open={showFullDialog}
        onClose={() => setShowFullDialog(false)}
        title="Diálogo completo"
        description={`${author} · ${date}`}
        size="lg"
        className="max-w-3xl"
        layerClassName="z-[260]"
        footer={
          <Button variant="primary" size="sm" onClick={() => setShowFullDialog(false)}>
            Fechar
          </Button>
        }
      >
        <div className={`rounded-xl px-4 py-3 ${toneClass}`}>{renderDialogContent()}</div>
      </Modal>
    </>
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
    BAIXA: "#86efac",
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

export function TicketEditor({
  open,
  onClose,
  onSaved,
  initialConversationId,
  initialAiExecutionId,
  initialTicket,
  clone = false,
  customerPortal = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (ticket: ApiTicket) => void;
  initialConversationId?: string;
  initialAiExecutionId?: string;
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
    queryFn: async () => {
      const items: ApiMessage[] = [];
      let cursor: string | undefined;
      do {
        const page = await messageApi.list(initialConversationId!, { limit: 100, cursor });
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return items;
    },
    enabled: open && !!initialConversationId,
  });
  const initialAiDraft = useQuery<ApiAiTicketDraft>({
    queryKey: ["tickets", "ai-prefill", initialAiExecutionId],
    queryFn: () => aiApi.getExecution(initialAiExecutionId!),
    enabled: open && !!initialAiExecutionId,
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
  const [requiredErrors, setRequiredErrors] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [summaryBusy, setSummaryBusy] = React.useState<"conversation" | "ai" | null>(null);
  const [generatedAiExecutionId, setGeneratedAiExecutionId] = React.useState<string | null>(null);
  const submittingRef = React.useRef(false);
  const initializedSessionRef = React.useRef<string | null>(null);
  const conversationPrefillRef = React.useRef<string | null>(null);
  const descriptionPrefillRef = React.useRef<string | null>(null);
  const aiPrefillRef = React.useRef<string | null>(null);
  const dirtyFieldsRef = React.useRef({
    title: false,
    description: false,
    department: false,
    requester: false,
    customer: false,
    assignee: false,
  });
  const defaultDepartmentId = options.departments[0]?.id ?? "";
  const sessionKey = `${initialTicket?.id ?? "new"}:${clone}:${initialConversationId ?? ""}:${initialAiExecutionId ?? ""}`;
  const requesterContacts = useQuery({
    queryKey: ["tickets", "requester-contacts", requesterSearch],
    queryFn: () => crmApi.listContacts({ q: requesterSearch.trim() || undefined, pageSize: 20 }),
    enabled: open && !customerPortal,
  });
  const portalCreateContext = useQuery({
    queryKey: ["tickets", "portal-create-context"],
    queryFn: ticketApi.portalCreateContext,
    enabled: open && customerPortal && !initialTicket,
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
      aiPrefillRef.current = null;
      return;
    }
    if (initializedSessionRef.current === sessionKey) return;
    initializedSessionRef.current = sessionKey;
    conversationPrefillRef.current = null;
    descriptionPrefillRef.current = null;
    aiPrefillRef.current = null;
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
    setDepartmentId(initialTicket?.department?.id ?? "");
    setContactId(initialTicket?.requesterContact?.id ?? "");
    setRequesterSearch(initialTicket?.requesterContact?.name ?? "");
    setRequesterResultsOpen(false);
    setCustomerId(initialTicket?.customer?.id ?? "");
    setCustomerDepartmentId(initialTicket?.customerDepartment?.id ?? "");
    setOriginBranchId(initialTicket?.originBranch?.id ?? "");
    setConversationId(initialTicket?.conversation?.id ?? initialConversationId ?? "");
    setAssignedMembershipId(initialTicket?.assignedMembership?.id ?? "");
    setAttachments([]);
    setRequiredErrors({});
    setSummaryBusy(null);
    setGeneratedAiExecutionId(null);
  }, [clone, customerPortal, initialConversationId, initialTicket, open, sessionKey]);

  React.useEffect(() => {
    const context = portalCreateContext.data;
    if (!open || !customerPortal || initialTicket || !context) return;
    setDepartmentId(context.serviceDepartment.id);
    setContactId(context.contact.id);
    setRequesterSearch(context.contact.name);
    setCustomerId(context.customer.id);
    setCustomerDepartmentId(context.department.id);
    setOriginBranchId(context.branch.id);
  }, [customerPortal, initialTicket, open, portalCreateContext.data]);

  React.useEffect(() => {
    const draft = initialAiDraft.data;
    if (!open || initialTicket || !initialAiExecutionId || !draft) return;
    if (aiPrefillRef.current === initialAiExecutionId) return;
    aiPrefillRef.current = initialAiExecutionId;
    const suggested = draft.suggested;
    setTitle(draft.title);
    setDescription(draft.descriptionHtml);
    setCategory(suggested.category);
    setPriority(suggested.priority);
    if (suggested.departmentId) setDepartmentId(suggested.departmentId);
    if (!initialConversationId) {
      if (suggested.requesterContactId) {
        setContactId(suggested.requesterContactId);
        setRequesterSearch(suggested.requesterContactName ?? "");
      }
      if (suggested.customerId) setCustomerId(suggested.customerId);
      if (suggested.originBranchId) setOriginBranchId(suggested.originBranchId);
    }
    if (initialConversationId) setConversationId(initialConversationId);
  }, [initialAiDraft.data, initialAiExecutionId, initialConversationId, initialTicket, open]);

  React.useEffect(() => {
    setRequiredErrors((current) => {
      const next = { ...current };
      if (title.trim()) delete next.title;
      if (description.trim()) delete next.description;
      if (departmentId) delete next.departmentId;
      if (customerDepartmentId) delete next.customerDepartmentId;
      if (originBranchId) delete next.originBranchId;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [customerDepartmentId, departmentId, description, originBranchId, title]);

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
      setCustomerDepartmentId(conversation.contact?.customerDepartmentId ?? "");
      setOriginBranchId(conversation.contact?.customerBranchId ?? "");
    }
    if (
      !dirtyFieldsRef.current.department &&
      (!initialAiExecutionId || !initialAiDraft.data?.suggested.departmentId)
    ) {
      setDepartmentId(conversation.department_id ?? defaultDepartmentId);
    }
    if (!dirtyFieldsRef.current.assignee) {
      setAssignedMembershipId(conversation.assigned_membership_id ?? "");
    }
  }, [
    defaultDepartmentId,
    initialAiDraft.data?.suggested.departmentId,
    initialAiExecutionId,
    initialConversation.data,
    initialTicket,
    open,
    sessionKey,
  ]);

  const generateConversationSummary = async () => {
    const conversation = initialConversation.data;
    const messages = initialMessages.data;
    if (!conversation || !messages) {
      toast.error("A conversa ainda está sendo carregada. Tente novamente em instantes.");
      return;
    }
    setSummaryBusy("conversation");
    try {
      const html = await buildConversationTicketDescription(conversation, messages);
      dirtyFieldsRef.current.description = true;
      descriptionPrefillRef.current = `${sessionKey}:${conversation.id}`;
      setGeneratedAiExecutionId(null);
      setDescription(html);
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível importar a conversa.");
    } finally {
      setSummaryBusy(null);
    }
  };

  const generateAiSummary = async () => {
    if (!initialConversationId) return;
    setSummaryBusy("ai");
    try {
      const draft = await aiApi.createTicketDraft(initialConversationId);
      dirtyFieldsRef.current.title = true;
      dirtyFieldsRef.current.description = true;
      setGeneratedAiExecutionId(draft.executionId);
      setTitle(draft.title);
      setDescription(draft.descriptionHtml);
      toast.success("Resumo por IA adicionado ao descritivo.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível gerar o resumo por IA.");
    } finally {
      setSummaryBusy(null);
    }
  };

  const submit = async () => {
    if (customerPortal && !initialTicket && !portalCreateContext.data) {
      toast.error(
        portalCreateContext.error instanceof Error
          ? portalCreateContext.error.message
          : "Aguarde o carregamento dos dados do seu acesso.",
      );
      return;
    }
    const nextRequiredErrors: Record<string, boolean> = {};
    const pendingFields: string[] = [];
    if (!title.trim()) {
      nextRequiredErrors.title = true;
      pendingFields.push("Título");
    }
    if (!description.trim()) {
      nextRequiredErrors.description = true;
      pendingFields.push("Descrição");
    }
    if (!departmentId) {
      nextRequiredErrors.departmentId = true;
      pendingFields.push("Departamento responsável");
    }
    if (customerDepartments.data?.length && !customerDepartmentId) {
      nextRequiredErrors.customerDepartmentId = true;
      pendingFields.push("Departamento do cliente");
    }
    if (customerBranches.data?.length && !originBranchId) {
      nextRequiredErrors.originBranchId = true;
      pendingFields.push("Filial de origem");
    }
    if (pendingFields.length) {
      setRequiredErrors(nextRequiredErrors);
      showRequiredFieldsToast(pendingFields);
      return;
    }
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
          aiExecutionId: generatedAiExecutionId || initialAiExecutionId || null,
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
      const availableSlots = Math.max(0, maxAttachmentCount - current.length);
      if (unique.length > availableSlots) {
        toast.error(`É possível adicionar no máximo ${maxAttachmentCount} arquivos por chamado.`);
      }
      return [...current, ...unique.slice(0, availableSlots)];
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
          <Button
            variant="primary"
            size="sm"
            className="save-action-button"
            disabled={busy || (customerPortal && !initialTicket && !portalCreateContext.data)}
            onClick={submit}
          >
            {busy ? "Salvando..." : initialTicket && !clone ? "Salvar" : "Salvar Chamado"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <Field label="Cliente *">
            {customerPortal ? (
              <Input
                value={
                  portalCreateContext.data?.customer.name ??
                  (portalCreateContext.isError ? "Não foi possível carregar" : "Carregando...")
                }
                readOnly
                aria-readonly="true"
              />
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
              <Input
                value={
                  portalCreateContext.data?.department.name ??
                  (portalCreateContext.isError ? "Não foi possível carregar" : "Carregando...")
                }
                readOnly
                aria-readonly="true"
              />
            ) : (
              <Select
                value={customerDepartmentId}
                onChange={(event) => setCustomerDepartmentId(event.target.value)}
                disabled={!customerId}
                aria-invalid={Boolean(requiredErrors.customerDepartmentId)}
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
              <Input
                value={
                  portalCreateContext.data?.contact.name ??
                  (portalCreateContext.isError ? "Não foi possível carregar" : "Carregando...")
                }
                readOnly
                aria-readonly="true"
              />
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
              <Input
                value={
                  portalCreateContext.data?.branch.name ??
                  (portalCreateContext.isError ? "Não foi possível carregar" : "Carregando...")
                }
                readOnly
                aria-readonly="true"
              />
            ) : (
              <Select
                value={originBranchId}
                onChange={(event) => setOriginBranchId(event.target.value)}
                disabled={!customerId}
                aria-label="Filial de origem"
                aria-invalid={Boolean(requiredErrors.originBranchId)}
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
              options={priorities.map((item) => ({
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
            aria-invalid={Boolean(requiredErrors.title)}
          />
        </Field>
        {initialConversationId && !initialTicket && !clone && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={
                summaryBusy !== null || initialConversation.isLoading || initialMessages.isLoading
              }
              onClick={() => void generateConversationSummary()}
            >
              {summaryBusy === "conversation" ? "Gerando…" : "Gerar resumo"}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={summaryBusy !== null}
              onClick={() => void generateAiSummary()}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {summaryBusy === "ai" ? "Gerando com IA…" : "Gerar resumo IA"}
            </Button>
          </div>
        )}
        <Field label="Descrição *" asLabel={false}>
          <RichTextEditor
            value={description}
            onChange={(value) => {
              dirtyFieldsRef.current.description = true;
              setDescription(value);
            }}
            invalid={Boolean(requiredErrors.description)}
            resizable
            imageActions
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
              className="mt-2 grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
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
  readOnly,
  canUpdate,
  canUpdateStatus,
  canComment,
  canUploadAttachment,
  canDelete,
  onDelete,
  customerPortal,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged: () => void;
  readOnly: boolean;
  canUpdate: boolean;
  canUpdateStatus: boolean;
  canComment: boolean;
  canUploadAttachment: boolean;
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
  const [dialogAttachments, setDialogAttachments] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState<"summary" | "attachments">("summary");
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const currentUserId = useSession((state) => state.user?.id);
  const [action, setAction] = React.useState<
    "reply" | "transfer" | "approval" | "solve" | "cancel"
  >("reply");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const options = useTicketOptions(!!ticketId && !customerPortal && !readOnly);
  const item = ticket.data;

  React.useEffect(() => {
    setAction("reply");
    setComment("");
    setDialogAttachments([]);
    setDetailTab("summary");
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
      let savedComment: ApiTicketComment;
      if (editingCommentId) {
        savedComment = await ticketApi.updateComment(ticketId, editingCommentId, bodyHtml);
      } else if (action === "transfer") {
        if (!assignedMembershipId) throw new Error("Selecione uma fila ou responsável.");
        if (!item?.department?.id) throw new Error("O chamado precisa de um departamento.");
        savedComment = await ticketApi.transfer(ticketId, {
          bodyHtml,
          departmentId: item.department.id,
          assignedMembershipId,
        });
      } else if (action === "approval") {
        const result = await ticketApi.requestApproval(ticketId, { bodyHtml });
        savedComment = result.comment;
      } else if (action === "solve") {
        savedComment = await ticketApi.solve(ticketId, bodyHtml);
      } else if (action === "cancel") {
        savedComment = await ticketApi.cancel(ticketId, bodyHtml);
      } else {
        savedComment = await ticketApi.respond(ticketId, bodyHtml);
      }
      if (dialogAttachments.length) {
        const results = await Promise.allSettled(
          dialogAttachments.map((file) =>
            ticketApi.uploadAttachment(ticketId, file, savedComment.id),
          ),
        );
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed) {
          toast.error(`O diálogo foi registrado, mas ${failed} anexo(s) não foram enviados.`);
        }
      }
      setComment("");
      setDialogAttachments([]);
      setEditingCommentId(null);
      setAction("reply");
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addDialogAttachments = (selectedFiles: File[]) => {
    const accepted = selectedFiles.filter((file) => {
      if (!allowedAttachmentMimeTypes.has(file.type.toLowerCase())) {
        toast.error(`${file.name} não possui um formato permitido.`);
        return false;
      }
      if (file.size <= maxAttachmentSizeMb * 1024 * 1024) return true;
      toast.error(`${file.name} excede o limite permitido de ${maxAttachmentSizeMb} MB.`);
      return false;
    });
    setDialogAttachments((current) => {
      const known = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      const unique = accepted.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      const existingCount = attachments.data?.length ?? 0;
      const availableSlots = Math.max(0, maxAttachmentCount - existingCount - current.length);
      if (unique.length > availableSlots) {
        toast.error(`É possível manter no máximo ${maxAttachmentCount} arquivos por chamado.`);
      }
      return [...current, ...unique.slice(0, availableSlots)];
    });
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
            {canDelete && !customerPortal && !readOnly && (
              <Button
                variant="outline"
                size="sm"
                className="mr-auto h-8 rounded-lg border-destructive text-destructive sm:min-w-20"
                onClick={() => onDelete(item)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
            {customerPortal || readOnly ? (
              <Button variant="primary" size="sm" onClick={onClose} disabled={busy}>
                Fechar
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="save-action-button"
                  onClick={onClose}
                  disabled={busy}
                >
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
                ticketId={item.id}
                attachments={(attachments.data ?? []).filter((attachment) => !attachment.commentId)}
                initials={initials(item.createdByMembership.user.name)}
                author={item.requesterContact?.name ?? item.createdByMembership.user.name}
                date={formatDate(item.createdAt)}
                title="Descrição do chamado"
                body={item.descriptionText ?? ""}
                bodyHtml={item.descriptionHtmlSanitized}
                tone="blue"
              />
              {comments.data?.map((entry) => (
                <DialogBubble
                  key={entry.id}
                  side={entry.authorMembership.user.id === currentUserId ? "right" : "left"}
                  ticketId={item.id}
                  attachments={(attachments.data ?? []).filter(
                    (attachment) => attachment.commentId === entry.id,
                  )}
                  initials={initials(entry.authorMembership.user.name)}
                  author={entry.authorMembership.user.name}
                  date={formatDate(entry.createdAt)}
                  editedDate={entry.editedAt ? formatDate(entry.editedAt) : undefined}
                  body={entry.bodyText}
                  bodyHtml={entry.bodyHtmlSanitized}
                  tone={dialogTone(entry.dialogType)}
                  onEdit={
                    entry.authorMembership.user.id === currentUserId
                      ? () => {
                          setEditingCommentId(entry.id);
                          setComment(entry.bodyHtmlSanitized ?? textToHtml(entry.bodyText));
                          setDialogAttachments([]);
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
                {canUploadAttachment && (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-card/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Anexos deste diálogo</p>
                        <p className="text-xs text-muted-foreground">
                          Os arquivos aparecerão acima deste diálogo depois de adicioná-lo.
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-1">
                        <Paperclip className="h-3.5 w-3.5" /> Selecionar arquivos
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                          multiple
                          className="hidden"
                          disabled={busy}
                          onChange={(event) => {
                            addDialogAttachments(Array.from(event.target.files ?? []));
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {dialogAttachments.length > 0 && (
                      <div
                        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
                        aria-label="Anexos selecionados para o diálogo"
                      >
                        {dialogAttachments.map((file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 truncate" title={file.name}>
                              {file.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remover arquivo ${file.name}`}
                              onClick={() =>
                                setDialogAttachments((current) =>
                                  current.filter((_, fileIndex) => fileIndex !== index),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setComment("");
                      setDialogAttachments([]);
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
            <div
              className="mb-4 flex gap-5 border-b border-border text-sm"
              role="tablist"
              aria-label="Detalhes do chamado"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === "summary"}
                className={`px-1 pb-2 ${
                  detailTab === "summary"
                    ? "border-b-2 border-primary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setDetailTab("summary")}
              >
                Resumo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === "attachments"}
                className={`px-1 pb-2 ${
                  detailTab === "attachments"
                    ? "border-b-2 border-primary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setDetailTab("attachments")}
              >
                Anexos ({attachments.data?.length ?? 0})
              </button>
            </div>
            {detailTab === "summary" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ReadonlyField label="Cliente" value={item.customer?.name ?? "Sem vínculo"} />
                  <ReadonlyField
                    label="Departamento"
                    value={
                      item.customerDepartment?.name ?? item.department?.name ?? "Sem departamento"
                    }
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
                        value={item.priority === "URGENTE" ? "ALTA" : item.priority}
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
                          await ticketApi.updateStatus(
                            item.id,
                            event.target.value as ApiTicketStatus,
                          );
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
              </>
            ) : (
              <Attachments
                ticketId={item.id}
                items={attachments.data ?? []}
                loading={attachments.isLoading}
                error={attachments.error instanceof Error ? attachments.error.message : null}
              />
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

function Attachments({
  ticketId,
  items,
  loading,
  error,
}: {
  ticketId: string;
  items: ApiTicketAttachment[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section role="tabpanel" aria-label="Anexos do chamado">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Anexos do chamado</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Índice de todos os arquivos vinculados aos diálogos deste chamado.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || items.length === 0}
          onClick={() => void downloadAllTicketAttachments(ticketId, items)}
        >
          <Download className="mr-2 h-4 w-4" />
          Baixar todos
        </Button>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando anexos...</p>}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível carregar os anexos. {error}
        </div>
      )}
      {!loading && !error && (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-sm font-medium underline-offset-2 hover:underline"
                  title={item.originalName}
                  onClick={() => void previewTicketAttachment(ticketId, item)}
                >
                  {item.originalName}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatAttachmentSize(item.sizeBytes)} · {formatDate(item.createdAt)} · Anexado
                  por {item.uploadedBy.name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Visualizar anexo ${item.originalName}`}
                  onClick={() => void previewTicketAttachment(ticketId, item)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Baixar anexo ${item.originalName}`}
                  onClick={() => void downloadTicketAttachment(ticketId, item)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <Paperclip className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Nenhum anexo neste chamado</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Os arquivos enviados junto aos diálogos aparecerão nesta aba.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DialogAttachments({
  ticketId,
  items,
}: {
  ticketId: string;
  items: ApiTicketAttachment[];
}) {
  if (!items.length) return null;
  return (
    <section className="mt-3 border-t border-border/70 pt-3" aria-label="Anexos do diálogo">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <Paperclip className="h-3.5 w-3.5" />
        Anexos
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((attachment) => (
          <a
            key={attachment.id}
            href="#"
            className="min-w-0 truncate text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            title={attachment.originalName}
            onClick={(event) => {
              event.preventDefault();
              void previewTicketAttachment(ticketId, attachment);
            }}
          >
            {attachment.originalName}
          </a>
        ))}
      </div>
    </section>
  );
}

async function downloadTicketAttachment(ticketId: string, attachment: ApiTicketAttachment) {
  try {
    const blob = await ticketApi.download(ticketId, attachment.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error((error as Error).message);
  }
}

async function downloadAllTicketAttachments(ticketId: string, attachments: ApiTicketAttachment[]) {
  try {
    const entries = await Promise.all(
      attachments.map(async (attachment) => ({
        name: attachment.originalName,
        data: new Uint8Array(
          await (await ticketApi.download(ticketId, attachment.id)).arrayBuffer(),
        ),
        date: new Date(attachment.createdAt),
      })),
    );
    const zip = createStoredZip(entries);
    const url = URL.createObjectURL(zip);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `anexos-${ticketId}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(`Não foi possível baixar todos os anexos. ${(error as Error).message}`);
  }
}

function createStoredZip(
  entries: Array<{ name: string; data: Uint8Array<ArrayBuffer>; date: Date }>,
) {
  const encoder = new TextEncoder();
  const names = new Map<string, number>();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const count = names.get(entry.name) ?? 0;
    names.set(entry.name, count + 1);
    const name = count === 0 ? entry.name : duplicateZipName(entry.name, count + 1);
    const nameBytes = encoder.encode(name);
    const checksum = crc32(entry.data);
    const { dosDate, dosTime } = toDosDateTime(entry.date);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localParts.push(local, entry.data);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + (part as Uint8Array).length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function duplicateZipName(name: string, occurrence: number) {
  const extensionIndex = name.lastIndexOf(".");
  if (extensionIndex <= 0) return `${name} (${occurrence})`;
  return `${name.slice(0, extensionIndex)} (${occurrence})${name.slice(extensionIndex)}`;
}

function toDosDateTime(value: Date) {
  const date = Number.isNaN(value.getTime()) ? new Date() : value;
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function previewTicketAttachment(ticketId: string, attachment: ApiTicketAttachment) {
  try {
    const blob = await ticketApi.preview(ticketId, attachment.id);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    toast.error((error as Error).message);
  }
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
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

async function buildConversationTicketDescription(
  conversation: ApiConversation,
  messages: ApiMessage[],
) {
  const conversationReference = String(conversation.protocolo ?? conversation.id).replace(/^#/, "");
  const header = [
    `Histórico importado da conversa: #${conversationReference}`,
    `Contato: ${conversation.contact?.nome ?? "Sem contato"}`,
    conversation.contact?.telefone
      ? `Telefone: ${formatPhoneVariable(conversation.contact.telefone)}`
      : null,
    conversation.department?.nome ? `Departamento: ${conversation.department.nome}` : null,
  ].filter(Boolean);
  const ordered = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const summarySeparator = "=============================";
  const blocks: string[] = [
    `<p><span style="font-size: 1.5em; font-weight: bold">${escapeHtml(String(header[0]))}</span><br>${summarySeparator}<br>${header
      .slice(1)
      .map((item, index) => {
        const text = String(item);
        const separator = text.indexOf(":");
        const prefix = index === 0 ? "" : "<br>";
        return separator > 0
          ? `${prefix}<strong>${escapeHtml(text.slice(0, separator + 1))}</strong>${escapeHtml(text.slice(separator + 1))}`
          : `${prefix}${escapeHtml(text)}`;
      })
      .join(
        "",
      )}<br>${summarySeparator}<br><strong>Segue abaixo o histórico da conversa:</strong><br>${summarySeparator}</p>`,
    "<p><br></p>",
  ];
  for (const message of ordered) {
    const author =
      message.direction === "inbound"
        ? (message.participant?.name ?? conversation.contact?.nome ?? "Contato")
        : message.sender === "agent"
          ? "Atendente"
          : "Sistema";
    const parts = [
      `<p><strong>${escapeHtml(author)}:</strong> ${escapeHtml(`[${formatDate(message.created_at)}]`)}</p>`,
    ];
    if (
      message.type === "image" &&
      message.media_data &&
      (!message.media_data.state || message.media_data.state === "ready")
    ) {
      try {
        const blob = await messageApi.downloadMedia(conversation.id, message.id, true);
        const source = await blobToDataUrl(blob);
        const alt = escapeHtml(message.media_data.file_name ?? "Imagem da conversa");
        parts.push(`<img src="${source}" alt="${alt}">`);
      } catch {
        parts.push("<p><em>Imagem da conversa indisponível para importação.</em></p>");
      }
    } else if (message.media_data?.file_name && message.type !== "text") {
      parts.push(
        `<p><em>${escapeHtml(`${messageTypeLabel(message.type)}: ${message.media_data.file_name} — disponível na seção Anexos.`)}</em></p>`,
      );
    }
    const content = message.media_data?.caption || message.content;
    if (content && !/^\[(?:imagem|documento|áudio|audio|vídeo|video)\]$/i.test(content.trim())) {
      parts.push(`<p>${whatsAppTextToHtml(content)}</p>`);
    }
    blocks.push(`<div>${parts.join("")}</div>`);
  }
  return blocks.join("");
}

function whatsAppTextToHtml(value: string) {
  const parts = value.split(
    /(\*\*[^*\n][\s\S]*?[^*\n]\*\*|\*[^*\n][^*\n]*?[^*\n]\*|_[^_\n][^_\n]*?[^_\n]_|~[^~\n][^~\n]*?[^~\n]~|```[\s\S]*?```|`[^`\n]+`)/g,
  );
  return parts
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("**") && part.endsWith("**"))
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      if (part.startsWith("*") && part.endsWith("*"))
        return `<strong>${escapeHtml(part.slice(1, -1))}</strong>`;
      if (part.startsWith("_") && part.endsWith("_"))
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      if (part.startsWith("~") && part.endsWith("~"))
        return `<s>${escapeHtml(part.slice(1, -1))}</s>`;
      if (part.startsWith("```") && part.endsWith("```"))
        return `<span>${escapeHtml(part.slice(3, -3))}</span>`;
      if (part.startsWith("`") && part.endsWith("`"))
        return `<span>${escapeHtml(part.slice(1, -1))}</span>`;
      return escapeHtml(part);
    })
    .join("")
    .replace(/\r?\n/g, "<br>");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem da conversa."));
    reader.readAsDataURL(blob);
  });
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
      NORMAL: "Média",
      ALTA: "Alta",
      URGENTE: "Alta",
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
  if (priority === "URGENTE" || priority === "ALTA") return "destructive";
  if (priority === "BAIXA") return "default";
  return "info";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(value))
    .replace(",", "");
}
