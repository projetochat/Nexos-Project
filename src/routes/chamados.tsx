import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Paperclip, Plus, Ticket, Trash2 } from "lucide-react";
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
import { Modal, useDisclosure } from "@/components/modal";
import {
  conversationApi,
  crmApi,
  messageApi,
  organizationApi,
  ticketApi,
  type ApiContact,
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

export const Route = createFileRoute("/chamados")({
  validateSearch: (search) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Chamados · Nexo" },
      { name: "description", content: "Chamados tenant-scoped via Nexos API." },
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
const allowedAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

function ChamadosPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/chamados" });
  const novo = useDisclosure();
  const setNewTicketOpen = novo.set;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApiTicketStatus | "">("");
  const [priority, setPriority] = React.useState<ApiTicketPriority | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
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

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Chamados"
          subtitle={`${tickets.data?.total ?? 0} chamado(s) em PostgreSQL.`}
          actions={
            <Button variant="primary" size="sm" onClick={novo.show}>
              <Plus className="h-3.5 w-3.5" /> Novo chamado
            </Button>
          }
        />

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar protocolo, título, contact ou customer"
            />
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
                  </tr>
                </thead>
                <tbody>
                  {tickets.data.items.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-border/60 hover:bg-surface-1"
                      onClick={() => setSelectedId(ticket.id)}
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
      </PageContainer>
    </AppShell>
  );
}

function TicketEditor({
  open,
  onClose,
  onSaved,
  initialConversationId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (ticket: ApiTicket) => void;
  initialConversationId?: string;
}) {
  const options = useTicketOptions(open);
  const currentUser = useSessionUserName();
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
  const [customerId, setCustomerId] = React.useState("");
  const [conversationId, setConversationId] = React.useState("");
  const [assignedMembershipId, setAssignedMembershipId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setCategory("SUPORTE");
    setPriority("NORMAL");
    setDepartmentId(options.departments[0]?.id ?? "");
    setContactId("");
    setCustomerId("");
    setConversationId(initialConversationId ?? "");
    setAssignedMembershipId("");
  }, [open, initialConversationId, options.departments]);

  React.useEffect(() => {
    const conversation = initialConversation.data;
    if (!open || !conversation) return;
    setConversationId(conversation.id);
    setContactId(conversation.contact_id ?? "");
    setCustomerId(conversation.contact?.customer_id ?? conversation.contact?.customer?.id ?? "");
    setDepartmentId(conversation.department_id ?? options.departments[0]?.id ?? "");
    setAssignedMembershipId(conversation.assigned_membership_id ?? "");
    setTitle(`Chamado aberto pelo Chat - ${conversation.protocolo ?? conversation.id.slice(0, 8)}`);
  }, [initialConversation.data, open, options.departments]);

  React.useEffect(() => {
    const conversation = initialConversation.data;
    const messages = initialMessages.data;
    if (!open || !conversation || !messages?.length) return;
    setDescription(buildConversationTicketDescription(conversation, messages));
  }, [initialConversation.data, initialMessages.data, open]);

  const submit = async () => {
    if (!title.trim()) return toast.error("Informe o título.");
    if (!description.trim()) return toast.error("Informe a descrição.");
    if (!departmentId) return toast.error("Selecione o departamento.");
    setBusy(true);
    try {
      const ticket = await ticketApi.create({
        title: title.trim(),
        descriptionHtml: textToHtml(description),
        category,
        priority,
        departmentId,
        requesterContactId: contactId || null,
        customerId: customerId || null,
        conversationId: conversationId || null,
        assignedMembershipId: assignedMembershipId || null,
      });
      toast.success(`${ticket.protocol} criado`);
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
      title="Novo chamado"
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
            {busy ? "Criando..." : "Criar chamado"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ID chamado">
          <Input value="Será gerado ao abrir" readOnly />
        </Field>
        <Field label="Status *">
          <Input value="Novo" readOnly />
        </Field>
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
        <Field label="Cliente *">
          <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Selecione...</option>
            {options.customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Solicitante *">
          <Select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Selecione...</option>
            {options.contacts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Departamento *">
          <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Selecione...</option>
            {options.departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data/hora de abertura">
          <Input value={new Date().toLocaleString("pt-BR")} readOnly />
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
        <div className="md:col-span-2">
          <Field label="Usuário de abertura">
            <Input value={currentUser} readOnly />
          </Field>
        </div>
        <Field label="Título *">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} />
        </Field>
        <Field label="Conversation">
          <Select
            value={conversationId}
            onChange={(event) => setConversationId(event.target.value)}
          >
            <option value="">Sem conversation</option>
            {options.conversations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.protocolo ?? item.id.slice(0, 8)} · {item.contact?.nome ?? "Contato"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável">
          <Select
            value={assignedMembershipId}
            onChange={(event) => setAssignedMembershipId(event.target.value)}
          >
            <option value="">Fila</option>
            {options.users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.user.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Descrição *">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[180px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
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
  const item = ticket.data;

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
      title={item ? `${item.protocol} · ${item.title}` : "Chamado"}
      size="xl"
    >
      {!item ? (
        <div>Carregando...</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
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
            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
            <Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
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
          </section>
          <Attachments ticketId={item.id} items={attachments.data ?? []} onChanged={refresh} />
        </div>
      )}
    </Modal>
  );
}

function Attachments({
  ticketId,
  items,
  onChanged,
}: {
  ticketId: string;
  items: ApiTicketAttachment[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!allowedAttachmentMimeTypes.has(file.type || "application/octet-stream")) {
      toast.error("Tipo de arquivo não permitido.");
      return;
    }
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-1">
          <Paperclip className="h-3.5 w-3.5" /> {busy ? "Enviando..." : "Anexar"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </label>
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
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover anexo"
                onClick={async () => {
                  await ticketApi.deleteAttachment(ticketId, item.id);
                  onChanged();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
  const contacts = useQuery({
    queryKey: ["tickets", "contacts"],
    queryFn: () => crmApi.listContacts({ pageSize: 100 }),
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
    departments: departments.data ?? ([] as ApiDepartment[]),
    users: users.data ?? ([] as ApiUserMembership[]),
    contacts: contacts.data?.items ?? ([] as ApiContact[]),
    customers: customers.data?.items ?? ([] as ApiCustomer[]),
    conversations: conversations.data?.items ?? [],
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
