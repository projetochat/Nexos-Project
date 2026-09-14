import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Copy,
  Download,
  Eye,
  Expand,
  Italic,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Paperclip,
  Pencil,
  Plus,
  Redo2,
  Strikethrough,
  Ticket,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SearchInput,
  SectionHeader,
  Select,
} from "@/components/ui-kit";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
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
  type ApiUserMembership,
} from "@/lib/nexos-api";
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
      { title: "Chamados · Trixus" },
      { name: "description", content: "Chamados gerenciados pela API Trixus." },
    ],
  }),
  component: ChamadosPage,
});

const statuses: ApiTicketStatus[] = [
  "ABERTO",
  "EM_ANDAMENTO",
  "AGUARDANDO",
  "RESOLVIDO",
  "FECHADO",
  "CANCELADO",
];
const priorities: ApiTicketPriority[] = ["BAIXA", "NORMAL", "ALTA", "URGENTE"];
const categories: ApiTicketCategory[] = ["SUPORTE", "DEV", "FINANCEIRO", "OPERACIONAL"];
const listKey = ["tickets", "list"] as const;
const maxAttachmentSizeMb = 10;

function ChamadosPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/chamados" });
  const novo = useDisclosure();
  const setNewTicketOpen = novo.set;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApiTicketStatus | "">("");
  const [priority, setPriority] = React.useState<ApiTicketPriority | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editingTicket, setEditingTicket] = React.useState<ApiTicket | null>(null);
  const [duplicatingTicket, setDuplicatingTicket] = React.useState<ApiTicket | null>(null);
  const [deletingTicket, setDeletingTicket] = React.useState<ApiTicket | null>(null);
  const params = {
    search: query || undefined,
    status: status || undefined,
    priority: priority || undefined,
    conversationId: search.conversationId,
    pageSize: 25,
  };
  const tickets = useQuery({
    queryKey: [...listKey, params],
    queryFn: () => ticketApi.list(params),
  });

  const refreshTickets = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: listKey });
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
    if (search.conversationId) setNewTicketOpen(true);
  }, [search.conversationId, setNewTicketOpen]);

  React.useEffect(() => {
    if (search.ticketId) setSelectedId(search.ticketId);
  }, [search.ticketId]);

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Chamados"
          subtitle={`${num(tickets.data?.total ?? 0)} chamado(s) em PostgreSQL.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Novo chamado
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="col-span-2 md:col-span-1">
              <Field label="Busca">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar protocolo, título, contact ou customer"
                />
              </Field>
            </div>
            <Field label="Status">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as ApiTicketStatus | "")}
              >
                <option value="">Todos os status</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as ApiTicketPriority | "")}
              >
                <option value="">Todas prioridades</option>
                {priorities.map((item) => (
                  <option key={item} value={item}>
                    {priorityLabel(item)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {tickets.isLoading ? (
          <Card>Carregando chamados...</Card>
        ) : !tickets.data?.items.length ? (
          <EmptyState
            icon={<Ticket className="h-5 w-5" />}
            title="Nenhum chamado"
            description="Crie um chamado com workflow, comentários e anexos privados."
            action={
              <Button variant="primary" size="sm" onClick={novo.show}>
                <Plus className="h-3.5 w-3.5" /> Criar chamado
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3">Protocolo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Prioridade</th>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Contact/Customer</th>
                    <th className="px-4 py-3">Departamento</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="w-32 px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.data.items.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-border/60 hover:bg-surface-1"
                      onDoubleClick={() => setSelectedId(ticket.id)}
                      title="Clique duas vezes para visualizar o chamado"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{ticket.protocol}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={priorityTone(ticket.priority)}>
                          {priorityLabel(ticket.priority)}
                        </Badge>
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-3 font-medium">
                        {ticket.title}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ticket.requesterContact?.name ?? ticket.customer?.name ?? "Sem vínculo"}
                      </td>
                      <td className="px-4 py-3">{ticket.department.name}</td>
                      <td className="px-4 py-3 text-xs">
                        {ticket.assignedMembership?.user.name ?? "Fila"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Duplicar chamado"
                            aria-label={`Duplicar chamado ${ticket.protocol}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDuplicatingTicket(ticket);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Editar chamado"
                            aria-label={`Editar chamado ${ticket.protocol}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingTicket(ticket);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="trash-action"
                            title="Excluir chamado"
                            aria-label={`Excluir chamado ${ticket.protocol}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletingTicket(ticket);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <TicketEditor
          open={novo.open}
          initialConversationId={search.conversationId}
          onClose={novo.hide}
          onSaved={(ticket) => {
            novo.hide();
            setSelectedId(ticket.id);
            refreshTickets();
          }}
        />
        <TicketDetail
          ticketId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refreshTickets}
        />
        <TicketEditor
          open={!!duplicatingTicket}
          initialTicket={duplicatingTicket}
          clone
          onClose={() => setDuplicatingTicket(null)}
          onSaved={(ticket) => {
            setDuplicatingTicket(null);
            setSelectedId(ticket.id);
            refreshTickets();
          }}
        />
        <TicketEditor
          open={!!editingTicket}
          initialTicket={editingTicket}
          onClose={() => setEditingTicket(null)}
          onSaved={(ticket) => {
            setEditingTicket(null);
            setSelectedId(ticket.id);
            refreshTickets();
          }}
        />
        <ConfirmDialog
          open={!!deletingTicket}
          title="Excluir Chamado?"
          description={
            <p>
              Deseja realmente excluir o chamado "
              <strong className="font-semibold text-foreground">{deletingTicket?.protocol ?? ""}</strong>"?
            </p>
          }
          confirmLabel="Excluir"
          destructive
          onClose={() => setDeletingTicket(null)}
          onConfirm={() => {
            if (!deletingTicket) return;
            void ticketApi
              .archive(deletingTicket.id)
              .then(() => {
                toast.success("Chamado excluído.");
                refreshTickets();
              })
              .catch((error) => toast.error((error as Error).message));
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

function TicketEditor({
  open,
  onClose,
  onSaved,
  initialConversationId,
  initialTicket,
  clone = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (ticket: ApiTicket) => void;
  initialConversationId?: string;
  initialTicket?: ApiTicket | null;
  clone?: boolean;
}) {
  const options = useTicketOptions(open);
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
  const [conversationId, setConversationId] = React.useState("");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
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
    setDepartmentId(initialTicket?.department.id ?? "");
    setContactId(initialTicket?.requesterContact?.id ?? "");
    setRequesterSearch(initialTicket?.requesterContact?.name ?? "");
    setRequesterResultsOpen(false);
    setCustomerId(initialTicket?.customer?.id ?? "");
    setConversationId(initialTicket?.conversation?.id ?? initialConversationId ?? "");
    setAssignedMembershipId(initialTicket?.assignedMembership?.id ?? "");
    setAttachment(null);
  }, [clone, initialConversationId, initialTicket, open, sessionKey]);

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
      setTitle(`Chamado aberto pelo Chat - ${conversation.protocolo ?? conversation.id.slice(0, 8)}`);
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
    setBusy(true);
    try {
      const descriptionHtml = /<[^>]+>/.test(description) ? description : textToHtml(description);
      let ticket: ApiTicket;
      if (initialTicket && !clone) {
        ticket = await ticketApi.update(initialTicket.id, {
          title: title.trim(),
          descriptionHtml,
          category,
          priority,
          requesterContactId: contactId || null,
          customerId: customerId || null,
          conversationId: conversationId || null,
        });
        if (departmentId !== initialTicket.department.id) {
          ticket = await ticketApi.updateDepartment(ticket.id, departmentId);
        }
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
          conversationId: conversationId || null,
          assignedMembershipId: assignedMembershipId || null,
        });
      }
      if (attachment) await ticketApi.uploadAttachment(ticket.id, attachment);
      toast.success(initialTicket && !clone ? "Chamado atualizado." : `${ticket.protocol} criado`);
      onSaved(ticket);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initialTicket && !clone ? "Editar Chamado" : clone ? "Duplicar Chamado" : "Novo Chamado"
      }
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
            {busy ? "Salvando..." : initialTicket && !clone ? "Salvar" : "Criar Chamado"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Cliente *">
            <Select
              value={customerId}
              onChange={(event) => {
                dirtyFieldsRef.current.customer = true;
                setCustomerId(event.target.value);
              }}
            >
              <option value="">Selecione...</option>
              {options.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Departamento *">
            <Select
              value={departmentId}
              onChange={(event) => {
                dirtyFieldsRef.current.department = true;
                setDepartmentId(event.target.value);
              }}
            >
              <option value="">Selecione...</option>
              {options.departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Solicitante *">
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
                    <p className="px-3 py-3 text-sm text-muted-foreground">Buscando contatos...</p>
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
                          {item.telefone ? formatPhoneForDisplay(item.telefone) : item.email || "Sem telefone"}
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
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo *">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as ApiTicketCategory)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select
              value={priority}
              onChange={(event) => setPriority(event.target.value as ApiTicketPriority)}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {priorityLabel(item)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data/hora de abertura">
            <Input value={new Date().toLocaleString("pt-BR")} readOnly />
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
        <div className="rounded-lg border border-dashed border-border bg-surface-1 p-4">
          <p className="mb-2 text-sm font-medium">
            Anexo <span className="font-normal text-muted-foreground">(opcional)</span>
          </p>
          <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground hover:border-primary hover:text-primary">
            <Paperclip className="h-4 w-4" />
            {attachment ? attachment.name : "Escolher arquivos"}
            <input
              type="file"
              accept="*/*"
              className="hidden"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Aceita documentos, imagens, planilhas e demais tipos de arquivo (máx.{" "}
            {maxAttachmentSizeMb} MB).
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
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
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
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [viewMode, setViewMode] = React.useState(true);
  const item = ticket.data;

  React.useEffect(() => {
    setViewMode(true);
  }, [ticketId]);

  const refresh = () => {
    ticket.refetch();
    comments.refetch();
    attachments.refetch();
    onChanged();
  };

  const addComment = async () => {
    if (!ticketId || !comment.trim()) return;
    setBusy(true);
    try {
      await ticketApi.createComment(ticketId, textToHtml(comment));
      setComment("");
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
      title={item ? `${viewMode ? "Visualizar" : "Editar"} Chamado · ${item.protocol}` : "Chamado"}
      size="xl"
      footer={
        item && viewMode ? (
          <Button variant="secondary" size="sm" onClick={() => setViewMode(false)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : undefined
      }
    >
      {!item ? (
        <div>Carregando...</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            {viewMode ? (
              <>
                <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
              </>
            ) : (
              <>
                <Select
                  value={item.status}
                  onChange={async (event) => {
                    await ticketApi.updateStatus(item.id, event.target.value as ApiTicketStatus);
                    refresh();
                  }}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={item.priority}
                  onChange={async (event) => {
                    await ticketApi.update(item.id, {
                      priority: event.target.value as ApiTicketPriority,
                    });
                    refresh();
                  }}
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabel(priority)}
                    </option>
                  ))}
                </Select>
              </>
            )}
            {!viewMode && (
              <>
                <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
              </>
            )}
          </div>
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm">{item.descriptionText}</p>
            <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
              <span>Departamento: {item.department.name}</span>
              <span>Responsável: {item.assignedMembership?.user.name ?? "Fila"}</span>
              <span>Contact: {item.requesterContact?.name ?? "Sem vínculo"}</span>
              <span>Customer: {item.customer?.name ?? "Sem vínculo"}</span>
            </div>
            {item.conversation && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() =>
                  navigate({
                    to: "/inbox/$conversationId",
                    params: { conversationId: item.conversation!.id },
                  })
                }
              >
                Abrir conversation relacionada
              </Button>
            )}
          </Card>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Comentários</h3>
            <div className="space-y-2">
              {comments.data?.map((entry) => (
                <Card key={entry.id} className="p-3">
                  <p className="text-xs text-muted-foreground">
                    {entry.authorMembership.user.name} · {formatDate(entry.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.bodyText}</p>
                </Card>
              ))}
            </div>
            {!viewMode && (
              <div className="mt-3 flex gap-2">
                <Input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Adicionar comentário interno"
                />
                <Button size="sm" onClick={addComment} disabled={busy}>
                  Comentar
                </Button>
              </div>
            )}
          </section>
          <Attachments
            ticketId={item.id}
            items={attachments.data ?? []}
            onChanged={refresh}
            readOnly={viewMode}
          />
        </div>
      )}
    </Modal>
  );
}

function RichTextEditor({
  value,
  onChange,
  expanded = false,
}: {
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const selectionRef = React.useRef<Range | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [fontName, setFontName] = React.useState("Arial");
  const [fontSize, setFontSize] = React.useState("3");
  const [fontColor, setFontColor] = React.useState("#111827");
  const [alignment, setAlignment] = React.useState("justifyLeft");

  React.useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== value)
      editor.innerHTML = value;
  }, [value]);

  const sync = () => onChange(editorRef.current?.innerHTML ?? "");
  const saveSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange();
  };
  const run = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && selectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    if (command === "insertUnorderedList" && !editor.textContent?.trim()) {
      editor.innerHTML = "<ul><li><br></li></ul>";
    } else {
      document.execCommand(command, false, commandValue);
    }
    saveSelection();
    sync();
  };
  const alignmentIcon =
    alignment === "justifyCenter" ? (
      <AlignCenter className="h-4 w-4" />
    ) : alignment === "justifyRight" ? (
      <AlignRight className="h-4 w-4" />
    ) : alignment === "justifyFull" ? (
      <AlignJustify className="h-4 w-4" />
    ) : (
      <AlignLeft className="h-4 w-4" />
    );
  const tool = (title: string, command: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
    >
      {icon}
    </button>
  );
  const editor = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-1 focus-within:border-primary">
      <div className="border-b border-border bg-card px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 px-2 py-1 shadow-sm">
          {tool("Desfazer", "undo", <Undo2 className="h-4 w-4" />)}
          {tool("Refazer", "redo", <Redo2 className="h-4 w-4" />)}
          <EditorDivider />
          <select
            title="Tipo da fonte"
            value={fontName}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setFontName(event.target.value);
              run("fontName", event.target.value);
            }}
            className="h-8 max-w-28 rounded-md bg-transparent px-2 text-xs outline-none hover:bg-card"
          >
            <option value="Arial">Sans Serif</option>
            <option value="Times New Roman">Serif</option>
            <option value="Courier New">Largura fixa</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select
            title="Tamanho da fonte"
            value={fontSize}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setFontSize(event.target.value);
              run("fontSize", event.target.value);
            }}
            className="h-8 w-11 rounded-md bg-transparent px-1 text-xs outline-none hover:bg-card"
          >
            <option value="2">P</option>
            <option value="3">M</option>
            <option value="5">G</option>
            <option value="7">EG</option>
          </select>
          <span className="inline-flex h-8 w-6 items-center justify-center text-muted-foreground">
            <Type className="h-4 w-4" />
          </span>
          <EditorDivider />
          {tool("Negrito", "bold", <Bold className="h-4 w-4" />)}
          {tool("Itálico", "italic", <Italic className="h-4 w-4" />)}
          {tool("Sublinhado", "underline", <Underline className="h-4 w-4" />)}
          {tool("Riscado", "strikeThrough", <Strikethrough className="h-4 w-4" />)}
          <label
            className="relative inline-flex h-8 w-9 items-center justify-center"
            title="Cor do texto"
          >
            <span className="border-b-2 font-semibold" style={{ borderColor: fontColor }}>
              A
            </span>
            <input
              type="color"
              value={fontColor}
              onMouseDown={saveSelection}
              onChange={(event) => {
                setFontColor(event.target.value);
                run("foreColor", event.target.value);
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <EditorDivider />
          <select
            title="Alinhamento"
            value={alignment}
            onMouseDown={saveSelection}
            onChange={(event) => {
              setAlignment(event.target.value);
              run(event.target.value);
            }}
            className="h-8 w-9 rounded-md bg-transparent text-xs outline-none hover:bg-card"
          >
            <option value="justifyLeft">E</option>
            <option value="justifyCenter">C</option>
            <option value="justifyRight">D</option>
            <option value="justifyFull">J</option>
          </select>
          <span className="-ml-9 pointer-events-none inline-flex h-8 w-8 items-center justify-center text-muted-foreground">
            {alignmentIcon}
            <ChevronDown className="h-3 w-3" />
          </span>
          {tool("Lista numerada", "insertOrderedList", <ListOrdered className="h-4 w-4" />)}
          {tool("Marcadores", "insertUnorderedList", <List className="h-4 w-4" />)}
          {tool("Diminuir recuo", "outdent", <ListIndentDecrease className="h-4 w-4" />)}
          {tool("Aumentar recuo", "indent", <ListIndentIncrease className="h-4 w-4" />)}
          {!expanded && (
            <button
              type="button"
              title="Maximizar"
              onClick={() => setFullscreen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
            >
              <Expand className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={saveSelection}
        onInput={() => {
          saveSelection();
          sync();
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        data-placeholder="Descreva os detalhes do chamado..."
        className={`w-full overflow-y-auto px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${expanded ? "h-[62vh]" : "h-44"}`}
      />
    </div>
  );
  return (
    <>
      {editor}
      {!expanded && (
        <Modal
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          title="Editar Texto HTML"
          size="xl"
          footer={
            <Button variant="primary" size="sm" onClick={() => setFullscreen(false)}>
              Concluir
            </Button>
          }
        >
          <RichTextEditor value={value} onChange={onChange} expanded />
        </Modal>
      )}
    </>
  );
}

function EditorDivider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function Attachments({
  ticketId,
  items,
  onChanged,
  readOnly,
}: {
  ticketId: string;
  items: ApiTicketAttachment[];
  onChanged: () => void;
  readOnly: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxAttachmentSizeMb * 1024 * 1024) {
      toast.error(`O arquivo excede o limite permitido de ${maxAttachmentSizeMb} MB.`);
      return;
    }
    setBusy(true);
    try {
      await ticketApi.uploadAttachment(ticketId, file);
      toast.success("Anexo enviado");
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
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
        <h3 className="text-sm font-semibold">Anexos privados</h3>
        {!readOnly && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-1">
            <Paperclip className="h-3.5 w-3.5" /> {busy ? "Enviando..." : "Anexar"}
            <input
              type="file"
              accept="*/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => upload(event.target.files?.[0])}
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
                aria-label="Visualizar anexo"
                onClick={() => preview(item)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Baixar anexo"
                onClick={() => download(item)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="trash-action"
                  aria-label="Remover anexo"
                  onClick={async () => {
                    await ticketApi.deleteAttachment(ticketId, item.id);
                    onChanged();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum anexo disponível.</p>
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
    } satisfies Record<ApiTicketStatus, string>
  )[status];
}
function priorityLabel(priority: ApiTicketPriority) {
  return (
    { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" } satisfies Record<
      ApiTicketPriority,
      string
    >
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
