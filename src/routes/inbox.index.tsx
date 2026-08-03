import * as React from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  MessageSquare,
  Plus,
  Inbox as InboxIcon,
  Clock,
  Sparkles,
  Play,
  UserPlus,
  Check,
  ChevronDown,
  X,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShellFull } from "@/components/app-shell";
import { Avatar, Badge, Button, Field, Input } from "@/components/ui-kit";
import { Modal, useDisclosure } from "@/components/modal";
import { connectionDisplayLabel, connectionInstanceValue } from "@/lib/connection-options";
import { type Contact } from "@/lib/mvp";
import {
  conversationApi,
  crmApi,
  messageApi,
  type ApiConversationStatus as ConvStatus,
} from "@/lib/nexos-api";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";
import { useSession } from "@/lib/session";
import { relativeTime } from "@/lib/format";
import { useQueuePrefs } from "@/lib/queue-prefs";
import { useChatPerms } from "@/lib/perms";

type TabId = "ativas" | "standby" | "fila" | "leads";
type SourceId = "todos" | "humano" | "bots";

const TAB_ICONS: Record<TabId, React.ComponentType<{ className?: string }>> = {
  ativas: Play,
  standby: PauseCircle,
  fila: Clock,
  leads: UserPlus,
};

const SOURCES: { id: SourceId; label: string; hint: string }[] = [
  { id: "todos", label: "Todos", hint: "Todos os chats" },
  { id: "humano", label: "Humano", hint: "Atendimento feito por atendentes" },
  { id: "bots", label: "Agente IA", hint: "Atendimento feito por Agente IA" },
];

const STATUS_TONE: Record<ConvStatus, "warning" | "info" | "success" | "default"> = {
  aberta: "warning",
  em_andamento: "info",
  aguardando: "warning",
  fechada: "success",
};

const STATUS_LABEL: Record<ConvStatus, string> = {
  aberta: "aberta",
  em_andamento: "em andamento",
  aguardando: "aguardando",
  fechada: "fechada",
};

export function InboxLayout({ children }: { children: React.ReactNode }) {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const activeId = params.conversationId;
  const qc = useQueryClient();
  const newConv = useDisclosure();
  const queuePrefs = useQueuePrefs();
  const perms = useChatPerms();
  const activeTabs = React.useMemo(
    () => queuePrefs.filter((p) => p.enabled && (perms.visualiza_leads || p.id !== "leads")),
    [queuePrefs, perms.visualiza_leads],
  );
  const [tab, setTab] = React.useState<TabId>("ativas");
  React.useEffect(() => {
    if (activeTabs.length && !activeTabs.find((t) => t.id === tab)) {
      setTab(activeTabs[0].id);
    }
  }, [activeTabs, tab]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [source, setSource] = React.useState<SourceId>("todos");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedInstancias, setSelectedInstancias] = React.useState<Set<string>>(new Set());
  const [selectedClientes, setSelectedClientes] = React.useState<Set<string>>(new Set());
  const selectedCliente = selectedClientes.size === 1 ? [...selectedClientes][0] : undefined;
  const selectedInstancia = selectedInstancias.size === 1 ? [...selectedInstancias][0] : undefined;

  const { data: conversationsPage, isLoading } = useQuery({
    queryKey: [
      "nexos",
      "conversations",
      { tab, source, onlyUnread, query, selectedCliente, selectedInstancia },
    ],
    queryFn: () =>
      conversationApi.list({
        tab,
        source,
        onlyUnread,
        q: query,
        customerId: selectedCliente,
        instance: selectedInstancia,
        pageSize: 100,
      }),
    refetchInterval: 30_000,
  });
  const conversas = React.useMemo(() => conversationsPage?.items ?? [], [conversationsPage?.items]);
  const unread = React.useMemo(
    () => Object.fromEntries(conversas.map((c) => [c.id, c.unreadCount])) as Record<string, number>,
    [conversas],
  );

  const { data: customersPage } = useQuery({
    queryKey: ["nexos", "customers", "all"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
  });
  const customers = React.useMemo(() => customersPage?.items ?? [], [customersPage?.items]);

  const { connectedConnections: filterConnections } = useConnectedMessagingConnections();
  const instanciasList = React.useMemo(
    () =>
      filterConnections
        .map((connection) => connectionInstanceValue(connection))
        .filter(Boolean)
        .sort(),
    [filterConnections],
  );

  // Clientes distintos para o filtro "Cliente" (nome do cliente cadastrado).
  const clientesList = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; nome: string }[] = [];
    for (const c of customers) {
      const nome = (c.nome ?? "").trim();
      if (nome && !seen.has(c.id)) {
        seen.add(c.id);
        out.push({ id: c.id, nome });
      }
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [customers]);

  const list = React.useMemo(() => {
    return conversas.filter((c) => {
      if (selectedClientes.size > 0) {
        const cid = c.contact?.customer_id ?? null;
        if (!cid || !selectedClientes.has(cid)) return false;
      }

      if (selectedInstancias.size > 0) {
        const inst = c.contact?.instancia ?? null;
        if (!inst || !selectedInstancias.has(inst)) return false;
      }
      return true;
    });
  }, [conversas, selectedClientes, selectedInstancias]);

  const counts = conversationsPage?.counts ?? { ativas: 0, standby: 0, fila: 0, leads: 0 };

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  return (
    <AppShellFull>
      <div className="flex h-full min-h-0">
        <aside
          className={`${activeId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border md:w-[380px] xl:w-[440px]`}
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface-1 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-transparent py-2 text-sm outline-none"
                  placeholder="Buscar cliente..."
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Atualizar"
                title="Atualizar"
                onClick={async () => {
                  setRefreshing(true);
                  await qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
                  await qc.invalidateQueries({ queryKey: ["nexos", "customers", "all"] });
                  setRefreshing(false);
                }}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="primary"
                size="icon"
                aria-label="Nova conversa"
                onClick={newConv.show}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Instância + Cliente (multi-select, mesma linha) */}
            <div className="grid grid-cols-2 gap-2">
              <MultiSelect
                label="Instância"
                placeholder="Todas"
                options={instanciasList.map((nome) => ({ id: nome, label: nome }))}
                selected={selectedInstancias}
                onChange={setSelectedInstancias}
              />
              <MultiSelect
                label="Cliente"
                placeholder="Todos"
                options={clientesList.map((c) => ({ id: c.id, label: c.nome }))}
                selected={selectedClientes}
                onChange={setSelectedClientes}
                emptyHint="Nenhum cliente cadastrado."
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1">
              {activeTabs.map((t) => {
                const Icon = TAB_ICONS[t.id];
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{t.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {counts[t.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Origem do atendimento + Não lidas (compact) */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {SOURCES.map((s) => {
                const active = source === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSource(s.id)}
                    title={s.hint}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-1 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
              <label
                title="Mostrar somente conversas com mensagens não respondidas"
                className={`ml-1 inline-flex cursor-pointer select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  onlyUnread
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-1 text-muted-foreground hover:text-foreground"
                }`}
              >
                <input
                  type="checkbox"
                  checked={onlyUnread}
                  onChange={(e) => setOnlyUnread(e.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                Não lidas
              </label>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {isLoading && (
              <li className="p-6 text-center text-xs text-muted-foreground">
                Carregando conversas…
              </li>
            )}
            {!isLoading &&
              list.map((c) => {
                const active = activeId === c.id;
                const u = unread[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <Link
                      to="/inbox/$conversationId"
                      params={{ conversationId: c.id }}
                      className={`flex gap-3 border-b border-border/60 px-4 py-3 transition ${active ? "bg-surface-2" : "hover:bg-surface-1"}`}
                    >
                      <div className="relative">
                        <Avatar name={c.contact?.nome ?? "?"} size={38} />
                        {u > 0 && (
                          <span
                            aria-label={`${u} mensagens não lidas`}
                            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface-1 bg-success px-1 font-mono text-[10px] font-bold leading-none text-white shadow-card"
                          >
                            {u > 99 ? "99+" : u}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-sm ${u > 0 ? "font-semibold" : "font-medium"}`}
                          >
                            {c.contact?.nome ?? "Contato"}
                            {c.is_group && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                · grupo
                              </span>
                            )}
                          </p>
                          <span
                            className={`shrink-0 font-mono text-[10px] ${u > 0 ? "text-success" : "text-muted-foreground"}`}
                          >
                            {relativeTime(new Date(c.last_message_at).getTime())}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            c.contact?.instancia,
                            (c.contact as unknown as { customer?: { nome?: string } })?.customer
                              ?.nome,
                            c.department?.nome,
                          ]
                            .filter(Boolean)
                            .join(" - ") || "—"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.agent?.nome ?? "sem atendente"}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            {!isLoading && list.length === 0 && (
              <li className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma conversa neste filtro.
              </li>
            )}
          </ul>
        </aside>

        <section className="min-w-0 flex-1">{children}</section>
      </div>

      <NewConversationModal open={newConv.open} onClose={newConv.hide} />
    </AppShellFull>
  );
}

export const Route = createFileRoute("/inbox/")({ component: InboxIndex });

function InboxIndex() {
  return (
    <InboxLayout>
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-1 text-muted-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Selecione uma conversa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma conversa da lista ou inicie uma nova.
          </p>
        </div>
      </div>
    </InboxLayout>
  );
}

function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"existing" | "new">("existing");
  const [q, setQ] = React.useState("");
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [selectedConnectionId, setSelectedConnectionId] = React.useState("");
  const [firstMsg, setFirstMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const { data: contactsPage } = useQuery({
    queryKey: ["nexos", "contacts", "conversation-modal"],
    queryFn: () => crmApi.listContacts({ pageSize: 100 }),
    enabled: open,
  });
  const { connectedConnections: availableConnections, error: connectionsError } =
    useConnectedMessagingConnections({ enabled: open });
  const contacts = React.useMemo(() => contactsPage?.items ?? [], [contactsPage?.items]);

  React.useEffect(() => {
    if (!open || selectedConnectionId || availableConnections.length === 0) return;
    setSelectedConnectionId(availableConnections[0].id);
  }, [availableConnections, open, selectedConnectionId]);

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setSelectedContact(null);
      setNewName("");
      setNewPhone("");
      setSelectedConnectionId("");
      setFirstMsg("");
      setTab("existing");
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return contacts.slice(0, 20);
    return contacts
      .filter((c) => (c.nome + " " + c.telefone).toLowerCase().includes(s))
      .slice(0, 20);
  }, [contacts, q]);

  const submit = async () => {
    if (!user) return toast.error("Sessão inválida.");
    if (!firstMsg.trim()) return toast.error("Escreva a primeira mensagem.");
    if (!selectedConnectionId) return toast.error("Selecione uma conexao WhatsApp conectada.");
    setBusy(true);
    try {
      let contactId = selectedContact?.id;
      if (tab === "new") {
        if (!newName.trim() || !newPhone.trim()) {
          toast.error("Informe nome e telefone.");
          setBusy(false);
          return;
        }
        const c = await crmApi.createContact({ name: newName.trim(), phone: newPhone.trim() });
        contactId = c.id;
      }
      if (!contactId) {
        toast.error("Selecione um contato.");
        setBusy(false);
        return;
      }
      const conversation = await conversationApi.create({
        contactId,
        connectionId: selectedConnectionId,
        assignToSelf: true,
      });
      const sent = await messageApi.sendText(conversation.id, firstMsg.trim());
      if (sent.status === "failed") toast.warning("Conversa criada, mas o envio falhou.");
      else toast.success("Conversa iniciada");
      qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
      qc.invalidateQueries({ queryKey: ["nexos", "messages", conversation.id] });
      onClose();
      navigate({ to: "/inbox/$conversationId", params: { conversationId: conversation.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conversa"
      description="Selecione um contato existente ou cadastre um novo."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? "Enviando…" : "Iniciar conversa"}
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface-1 p-1 text-xs">
        <button
          onClick={() => setTab("existing")}
          className={`rounded-md px-3 py-1.5 ${tab === "existing" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}
        >
          Contato existente
        </button>
        <button
          onClick={() => setTab("new")}
          className={`rounded-md px-3 py-1.5 ${tab === "new" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}
        >
          Novo contato
        </button>
      </div>

      {tab === "existing" ? (
        <div className="space-y-2">
          <Field label="Buscar contato">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome ou telefone…"
            />
          </Field>
          <ul className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {filtered.map((c) => {
              const active = selectedContact?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedContact(c)}
                    className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left text-sm ${active ? "bg-surface-2" : "hover:bg-surface-1"}`}
                  >
                    <Avatar name={c.nome} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{c.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.telefone}</p>
                    </div>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="p-4 text-center text-xs text-muted-foreground">Nenhum contato.</li>
            )}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Nome">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+55…"
            />
          </Field>
        </div>
      )}

      <div className="mt-3">
        <Field label="Conexao WhatsApp">
          <select
            value={selectedConnectionId}
            onChange={(e) => setSelectedConnectionId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            {availableConnections.length === 0 ? (
              <option value="">Nenhuma instancia conectada disponivel.</option>
            ) : (
              availableConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connectionDisplayLabel(connection)}
                </option>
              ))
            )}
          </select>
          {connectionsError ? (
            <p className="mt-1 text-xs text-destructive">{(connectionsError as Error).message}</p>
          ) : availableConnections.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Conecte uma instancia antes de iniciar uma conversa.
            </p>
          ) : null}
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Primeira mensagem">
          <textarea
            rows={3}
            value={firstMsg}
            onChange={(e) => setFirstMsg(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            placeholder="Olá! Como posso ajudar?"
          />
        </Field>
      </div>
    </Modal>
  );
}

type MultiSelectOption = { id: string; label: string };

function MultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
  emptyHint,
}: {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  emptyHint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const count = selected.size;
  const summary =
    count === 0
      ? placeholder
      : count === 1
        ? (options.find((o) => selected.has(o.id))?.label ?? `${count} selecionado`)
        : `${count} selecionados`;

  return (
    <div ref={ref} className="relative">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-left text-xs transition hover:border-primary/50 ${
          count > 0 ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="truncate">{summary}</span>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(new Set());
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              aria-label="Limpar seleção"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-card">
          {options.length === 0 && (
            <div className="p-3 text-[11px] text-muted-foreground">
              {emptyHint ?? "Nenhuma opção."}
            </div>
          )}
          {options.map((o) => {
            const active = selected.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition hover:bg-surface-1 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-1"
                  }`}
                >
                  {active && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
