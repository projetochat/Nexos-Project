import * as React from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquarePlus,
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
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Image as ImageIcon,
  Mic,
  CalendarClock,
  UserRound,
  UsersRound,
  ArrowLeftRight,
  CircleCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShellFull } from "@/components/app-shell";
import { Avatar, Badge, Button, Field, Input, SearchInput, Select } from "@/components/ui-kit";
import { ContactFormModal, contactPayload } from "./contatos";
import { CreateGroupModal } from "./grupos";
import { Modal } from "@/components/modal";
import { useDisclosure } from "@/hooks/use-disclosure";
import {
  BulkConversationActionModal,
  type BulkConversationAction,
} from "@/components/bulk-conversation-action-modal";
import {
  ActiveConversationOrchestrator,
  type ActiveConversationRequest,
} from "@/components/active-conversation-orchestrator";
import { canStartActiveConversation } from "@/lib/active-conversation-permissions";
import { conversationAuthorizationScope } from "@/lib/conversation-query-authorization";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { connectionDisplayLabel, connectionInstanceValue } from "@/lib/connection-options";
import { maskBrazilPhone } from "@/lib/input-masks";
import {
  conversationApi,
  crmApi,
  groupsApi,
  type ApiConversation,
  type ApiContact,
  type ApiMessageContactPickerItem,
  type ApiConversationStatus as ConvStatus,
  type ApiWhatsappGroupSummary,
} from "@/lib/trixus-api";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";
import { useSession } from "@/lib/session";
import { conversationTimestamp } from "@/lib/format";
import { useQueuePrefs } from "@/lib/queue-prefs";
import { useChatPerms } from "@/lib/perms";
import { useRealtimeInbox } from "@/lib/realtime/hooks";
import { compareOptionLabels, sortByOptionLabel } from "@/lib/sort-options";
import { refreshInboxData } from "@/lib/refresh-inbox";
import { DisconnectedInstanceAlerts } from "@/components/disconnected-instance-alerts";
import { conversationListMetadataLabel } from "@/lib/conversation-list-metadata";
import { conversationPreview } from "@/lib/conversation-preview";
import {
  getInboxTab,
  setInboxTab,
  subscribeInboxTab,
  type InboxTabId,
} from "@/lib/inbox-tab-state";

type TabId = InboxTabId;
type SourceId = "todos" | "privado" | "grupos" | "humano" | "bots";

const TAB_ICONS: Record<TabId, React.ComponentType<{ className?: string }>> = {
  ativas: Play,
  standby: PauseCircle,
  fila: Clock,
  leads: UserPlus,
};

const SOURCES: { id: SourceId; label: string; hint: string }[] = [
  { id: "todos", label: "Todos", hint: "Todos os chats" },
  { id: "privado", label: "Privado", hint: "Conversas individuais" },
  { id: "grupos", label: "Grupos", hint: "Conversas em grupo" },
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

const inboxListMemory: {
  source: SourceId;
  onlyUnread: boolean;
  query: string;
  selectedInstancias: string[];
  selectedClientes: string[];
} = {
  source: "todos",
  onlyUnread: false,
  query: "",
  selectedInstancias: [],
  selectedClientes: [],
};

export function InboxLayout({ children }: { children: React.ReactNode }) {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const activeId = params.conversationId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const newConv = useDisclosure();
  const [bulkAction, setBulkAction] = React.useState<BulkConversationAction | null>(null);
  const queuePrefs = useQueuePrefs();
  const perms = useChatPerms();
  const user = useSession((state) => state.user);
  const permissions = user?.permissions ?? [];
  const conversationScope = conversationAuthorizationScope(user);
  const canStartConversation = canStartActiveConversation(permissions);
  const canBulkActions = permissions.includes("chat.bulk_actions.execute");
  const activeTabs = React.useMemo(
    () => queuePrefs.filter((p) => p.enabled && (perms.visualiza_leads || p.id !== "leads")),
    [queuePrefs, perms.visualiza_leads],
  );
  const tab = React.useSyncExternalStore(subscribeInboxTab, getInboxTab, getInboxTab);
  const setTab = setInboxTab;
  React.useEffect(() => {
    if (!activeTabs.some((item) => item.id === tab) && activeTabs[0]) {
      setTab(activeTabs[0].id);
    }
  }, [activeTabs, setTab, tab]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [source, setSourceState] = React.useState<SourceId>(inboxListMemory.source);
  const setSource = React.useCallback((next: SourceId) => {
    inboxListMemory.source = next;
    setSourceState(next);
  }, []);
  const [onlyUnread, setOnlyUnread] = React.useState(inboxListMemory.onlyUnread);
  const [query, setQuery] = React.useState(inboxListMemory.query);
  const [selectedInstancias, setSelectedInstancias] = React.useState<Set<string>>(
    () => new Set(inboxListMemory.selectedInstancias),
  );
  const [selectedClientes, setSelectedClientes] = React.useState<Set<string>>(
    () => new Set(inboxListMemory.selectedClientes),
  );
  React.useEffect(() => {
    inboxListMemory.onlyUnread = onlyUnread;
    inboxListMemory.query = query;
    inboxListMemory.selectedInstancias = [...selectedInstancias];
    inboxListMemory.selectedClientes = [...selectedClientes];
  }, [onlyUnread, query, selectedClientes, selectedInstancias]);
  const bulkSelection = React.useMemo(
    () => ({
      q: query || undefined,
      source,
      onlyUnread,
      customerIds: selectedClientes.size ? [...selectedClientes] : undefined,
      instances: selectedInstancias.size ? [...selectedInstancias] : undefined,
    }),
    [onlyUnread, query, selectedClientes, selectedInstancias, source],
  );
  const selectedCliente = selectedClientes.size === 1 ? [...selectedClientes][0] : undefined;
  const selectedInstancia = selectedInstancias.size === 1 ? [...selectedInstancias][0] : undefined;
  const realtime = useRealtimeInbox(activeId);

  const conversationListQueryKey = React.useMemo(
    () =>
      [
        "trixus",
        "conversations",
        conversationScope,
        { tab, source, onlyUnread, query, selectedCliente, selectedInstancia },
      ] as const,
    [conversationScope, onlyUnread, query, selectedCliente, selectedInstancia, source, tab],
  );
  const { data: conversationsPage, isLoading } = useQuery({
    queryKey: conversationListQueryKey,
    queryFn: () =>
      conversationApi.list({
        tab,
        source,
        onlyUnread,
        q: query,
        customerId: selectedCliente,
        instance: selectedInstancia,
        sort: "lastMessageAt",
        direction: "desc",
        pageSize: 100,
      }),
    refetchInterval: realtime.status === "connected" ? false : 30_000,
  });
  const conversas = React.useMemo(() => conversationsPage?.items ?? [], [conversationsPage?.items]);
  const unread = React.useMemo(
    () => Object.fromEntries(conversas.map((c) => [c.id, c.unreadCount])) as Record<string, number>,
    [conversas],
  );

  const { data: customersPage } = useQuery({
    queryKey: ["trixus", "customers", "all"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }),
  });
  const customers = React.useMemo(() => customersPage?.items ?? [], [customersPage?.items]);

  const { allConnections: filterConnections } = useConnectedMessagingConnections();
  const instanciaOptions = React.useMemo(
    () =>
      filterConnections
        .map((connection) => ({
          id: connectionInstanceValue(connection),
          label: connection.name || connectionDisplayLabel(connection),
          color: connection.color,
        }))
        .filter((option) => option.id)
        .sort((a, b) => compareOptionLabels(a.label, b.label)),
    [filterConnections],
  );
  const instanciaLabelByValue = React.useMemo(
    () => Object.fromEntries(instanciaOptions.map((option) => [option.id, option.label])),
    [instanciaOptions],
  );

  // Clientes distintos para o filtro "Cliente" (nome do cliente cadastrado).
  const clientesList = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; nome: string; cor: string }[] = [];
    for (const c of customers) {
      const nome = (c.nome ?? "").trim();
      if (nome && !seen.has(c.id)) {
        seen.add(c.id);
        out.push({ id: c.id, nome, cor: c.cor });
      }
    }
    return sortByOptionLabel(out, (item) => item.nome);
  }, [customers]);

  const list = React.useMemo(() => {
    return conversas.filter((c) => {
      if (selectedClientes.size > 0) {
        const cid = c.contact?.customer_id ?? null;
        if (!cid || !selectedClientes.has(cid)) return false;
      }

      if (selectedInstancias.size > 0) {
        const inst = c.connection?.externalReference ?? c.connection?.name ?? null;
        if (!inst || !selectedInstancias.has(inst)) return false;
      }
      return true;
    });
  }, [conversas, selectedClientes, selectedInstancias]);

  const counts = conversationsPage?.counts ?? { ativas: 0, standby: 0, fila: 0, leads: 0 };

  return (
    <AppShellFull>
      <div className="flex h-full min-h-0 w-full">
        <aside
          className={`${activeId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border md:w-[440px] xl:w-[480px]`}
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Buscar cliente..."
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="group"
                aria-label="Atualizar"
                title="Atualizar"
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await refreshInboxData(qc, conversationListQueryKey, activeId);
                  } catch (error) {
                    toast.error(
                      (error as Error).message || "Não foi possível atualizar as conversas.",
                    );
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 transition-transform duration-500 group-hover:rotate-[720deg] ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
              {canStartConversation && (
                <Button
                  variant="primary"
                  size="icon"
                  aria-label="Nova Conversa"
                  title="Nova Conversa"
                  onClick={newConv.show}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              )}
              {canBulkActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Ações das conversas"
                      title="Ações das conversas"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setBulkAction("start")}
                      className="cursor-pointer focus:bg-surface-2 focus:text-foreground data-[highlighted]:bg-surface-2 data-[highlighted]:text-foreground"
                    >
                      <Play className="h-4 w-4" /> Iniciar em Massa
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setBulkAction("transfer")}
                      className="cursor-pointer focus:bg-surface-2 focus:text-foreground data-[highlighted]:bg-surface-2 data-[highlighted]:text-foreground"
                    >
                      <ArrowLeftRight className="h-4 w-4" /> Transferência em Massa
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setBulkAction("close")}
                      className="cursor-pointer focus:bg-surface-2 focus:text-foreground data-[highlighted]:bg-surface-2 data-[highlighted]:text-foreground"
                    >
                      <CircleCheck className="h-4 w-4" />
                      Fechar Conversas em Massa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <DisconnectedInstanceAlerts connections={filterConnections} />

            <div className="grid grid-cols-2 gap-2">
              <MultiSelect
                label="Instância"
                placeholder="Todas"
                options={instanciaOptions}
                selected={selectedInstancias}
                onChange={setSelectedInstancias}
              />
              <MultiSelect
                label="Cliente"
                placeholder="Todos"
                options={clientesList.map((c) => ({ id: c.id, label: c.nome, color: c.cor }))}
                selected={selectedClientes}
                onChange={setSelectedClientes}
                emptyHint="Nenhum cliente cadastrado."
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5 sm:gap-1 sm:p-1">
              {activeTabs.map((t) => {
                const Icon = TAB_ICONS[t.id];
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-1 py-1.5 text-[11px] font-medium leading-none transition sm:gap-1.5 sm:px-2 sm:text-xs ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="hidden h-3.5 w-3.5 shrink-0 min-[360px]:block" />
                    <span className="min-w-0 truncate">{t.label}</span>
                    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-sans text-[9px] font-semibold leading-none tabular-nums text-primary-foreground">
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
                const instanceLabel =
                  c.connection?.name ||
                  (c.contact?.instancia ? instanciaLabelByValue[c.contact.instancia] : null) ||
                  c.contact?.instancia;
                const customerName = (c.contact as unknown as { customer?: { nome?: string } })
                  ?.customer?.nome;
                const metadataLabel = conversationListMetadataLabel({
                  company: customerName,
                  department: c.contact?.contactDepartment?.nome,
                  legacyDepartment: c.contact?.departamento,
                  profile: c.contact?.contactProfile?.nome,
                  legacyProfile: c.contact?.nivel_gerencia,
                });
                return (
                  <li key={c.id} className="flex border-b border-border/60">
                    <Link
                      to="/inbox/$conversationId"
                      params={{ conversationId: c.id }}
                      className={`flex min-w-0 flex-1 gap-3 px-4 py-3 transition ${active ? "bg-surface-2" : "hover:bg-surface-1"}`}
                    >
                      <div className="relative">
                        <Avatar
                          name={c.contact?.nome ?? "?"}
                          size={38}
                          src={c.contact?.avatar_url}
                        />
                        {u > 0 && (
                          <span
                            aria-label={`${u} mensagens não lidas`}
                            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface-1 bg-success px-1 font-mono text-[10px] font-bold leading-none text-white shadow-card"
                          >
                            {u > 99 ? "99+" : u}
                          </span>
                        )}
                      </div>
                      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
                        <div className="min-w-0">
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
                          {metadataLabel && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {metadataLabel}
                            </p>
                          )}
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: c.connection?.color ?? "var(--muted-foreground)",
                              }}
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {[
                                instanceLabel || "Sem instância",
                                c.department?.nome,
                                c.agent?.nome || "sem atendente",
                              ]
                                .filter(Boolean)
                                .join(" - ")}
                            </span>
                          </div>
                          <div
                            className={`mt-0.5 truncate text-xs ${u > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}
                          >
                            <ConversationMessagePreview
                              value={c.lastMessagePreview}
                              type={c.lastMessageType}
                              durationMs={c.lastMessageDurationMs}
                            />
                          </div>
                        </div>
                        <ConversationListTimestamp
                          value={c.last_message_at}
                          unread={u > 0}
                          hasPendingScheduledMessage={Boolean(c.hasPendingScheduledMessage)}
                        />
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

        <section className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
          {children}
        </section>
      </div>

      {canStartConversation && <NewConversationModal open={newConv.open} onClose={newConv.hide} />}
      {canBulkActions && bulkAction && (
        <BulkConversationActionModal
          action={bulkAction}
          selection={bulkSelection}
          queues={activeTabs.map(({ id, label }) => ({ id, label }))}
          onClose={() => setBulkAction(null)}
          onSuccess={() => {
            if (bulkAction === "close") void navigate({ to: "/inbox" });
            setBulkAction(null);
          }}
        />
      )}
    </AppShellFull>
  );
}

export const Route = createFileRoute("/inbox/")({ component: InboxIndex });

function ConversationMessagePreview({
  value,
  type,
  durationMs,
}: {
  value: string | null | undefined;
  type?: ApiConversation["lastMessageType"];
  durationMs?: number | null;
}) {
  const preview = conversationPreview(value, type, durationMs);
  const Icon =
    preview.kind === "image"
      ? ImageIcon
      : preview.kind === "audio"
        ? Mic
        : preview.kind === "contact"
          ? UserRound
          : null;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 align-middle">
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">
        {preview.segments.map((segment, index) =>
          segment.bold ? (
            <strong key={index}>{segment.text}</strong>
          ) : (
            <React.Fragment key={index}>{segment.text}</React.Fragment>
          ),
        )}
        {preview.duration ? ` ${preview.duration}` : ""}
      </span>
    </span>
  );
}

function ConversationListTimestamp({
  value,
  unread,
  hasPendingScheduledMessage,
}: {
  value: string;
  unread: boolean;
  hasPendingScheduledMessage: boolean;
}) {
  const timestamp = conversationTimestamp(new Date(value).getTime());
  return (
    <span
      className={`shrink-0 text-right font-mono text-[10px] leading-4 ${unread ? "text-success" : "text-muted-foreground"}`}
    >
      {timestamp.day && <span className="block">{timestamp.day}</span>}
      <span className="block">{timestamp.time}</span>
      {hasPendingScheduledMessage && (
        <CalendarClock
          className="mx-auto mt-0.5 h-3.5 w-3.5 text-primary"
          aria-label="Mensagem agendada pendente"
        />
      )}
    </span>
  );
}

function InboxIndex() {
  return (
    <InboxLayout>
      <div className="flex h-full w-full min-w-0 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl p-2 dark:bg-white">
            <img
              src="/trixus-logo-wordmark.png"
              alt="Trixus"
              width={1166}
              height={702}
              className="h-auto w-48 object-contain"
            />
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

export function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const permissions = user?.permissions ?? [];
  const canStartConversation = canStartActiveConversation(permissions);
  const canCreateContact = permissions.includes("contacts.create");
  const canEditContact = permissions.includes("contacts.update");
  const canViewGroups = canStartConversation;
  const canCreateGroup = permissions.includes("groups.read") && permissions.includes("groups.create");
  const canOpenGroup = canStartConversation;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"contacts" | "groups">("contacts");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [groupQuery, setGroupQuery] = React.useState("");
  const [groupPage, setGroupPage] = React.useState(1);
  const [createGroupOpen, setCreateGroupOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<ApiMessageContactPickerItem | null>(
    null,
  );
  const [conversationRequest, setConversationRequest] =
    React.useState<ActiveConversationRequest | null>(null);
  const conversationRequestKey = React.useRef(0);
  const [contactForm, setContactForm] = React.useState<{ initial?: ApiContact } | null>(null);
  const savingContact = React.useRef(false);
  const { allConnections: availableConnections, error: connectionsError } =
    useConnectedMessagingConnections({ enabled: open && canStartConversation });
  const {
    data: contactsPage,
    isFetching: loadingContacts,
    error: contactsError,
  } = useQuery({
    queryKey: ["trixus", "contacts", "conversation-modal", q.trim(), page],
    queryFn: () =>
      crmApi.listContactsForMessagePicker({
        q: q.trim() || undefined,
        page,
        pageSize: 10,
      }),
    enabled: open && canStartConversation,
  });
  const {
    data: groupsPage,
    isFetching: loadingGroups,
    error: groupsError,
  } = useQuery({
    queryKey: ["trixus", "groups", "conversation-modal", groupQuery.trim(), groupPage],
    queryFn: () =>
      groupsApi.list({
        q: groupQuery.trim() || undefined,
        page: groupPage,
        pageSize: 10,
      }),
    enabled: open && tab === "groups" && canViewGroups,
  });
  const { data: groupInstances = [], error: groupInstancesError } = useQuery({
    queryKey: ["trixus", "groups", "conversation-modal", "instances"],
    queryFn: groupsApi.instanceOptions,
    enabled: open && tab === "groups" && canViewGroups,
  });
  const { data: contactOptions, error: optionsError } = useQuery({
    queryKey: ["trixus", "contacts", "conversation-options"],
    queryFn: crmApi.contactOptions,
    enabled: open && canCreateContact,
  });
  const { data: customersPage, error: customersError } = useQuery({
    queryKey: ["trixus", "customers", "conversation-options"],
    queryFn: () => crmApi.listCustomers({ pageSize: 10000 }),
    enabled: open && canCreateContact,
  });
  const instances = React.useMemo(
    () =>
      availableConnections.map((connection) => ({
        id: connection.id,
        value: connectionInstanceValue(connection),
        name: connection.name,
        color: connection.color ?? null,
        logoUrl: connection.logoUrl ?? null,
        externalReference: connection.externalReference,
        ownerPhone: connection.ownerPhone ?? null,
        instanceName: connection.name,
        status: connection.status.toUpperCase(),
      })),
    [availableConnections],
  );
  const contacts = contactsPage?.items ?? [];
  const groups = groupsPage?.items ?? [];
  const formReady = !!contactOptions && !!customersPage;

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setPage(1);
      setGroupQuery("");
      setGroupPage(1);
      setTab("contacts");
      setCreateGroupOpen(false);
      setSelectedContact(null);
      setConversationRequest(null);
      setContactForm(null);
    }
  }, [open]);

  const selectContact = (contact: ApiMessageContactPickerItem) => {
    setSelectedContact(contact);
    conversationRequestKey.current += 1;
    setConversationRequest({ key: conversationRequestKey.current, contact });
  };

  const openGroup = async (group: ApiWhatsappGroupSummary) => {
    if (!canOpenGroup) return;
    conversationRequestKey.current += 1;
    setConversationRequest({
      key: conversationRequestKey.current,
      group,
      contact: {
        id: group.contactId,
        nome: group.name,
        telefone: group.externalChatId ?? "",
        normalizedPhone: group.externalChatId ? `group:${group.externalChatId}` : "group:",
        avatar_url: group.imageUrl,
        active: true,
        instancia: group.connection?.id ?? null,
        instanceIds: group.connection?.id ? [group.connection.id] : [],
      },
    });
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Nova Conversa"
        className="h-[calc(100dvh-1rem)] sm:h-[min(55rem,calc(100dvh-2rem))]"
        footer={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid grid-cols-2 border-b border-border" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "contacts"}
              onClick={() => setTab("contacts")}
              className={`flex items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === "contacts"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserRound className="h-4 w-4" /> Contatos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "groups"}
              disabled={!canViewGroups}
              onClick={() => setTab("groups")}
              className={`flex items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                tab === "groups"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <UsersRound className="h-4 w-4" /> Grupos
            </button>
          </div>
          {tab === "contacts" && canCreateContact && (
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={!formReady}
                onClick={() => setContactForm({})}
              >
                <Plus className="h-3.5 w-3.5" /> Novo Contato
              </Button>
            </div>
          )}
          {tab === "groups" && canCreateGroup && (
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setCreateGroupOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Novo Grupo
              </Button>
            </div>
          )}
          {tab === "contacts" && canCreateContact && (optionsError || customersError) && (
            <p className="text-xs text-destructive">
              Não foi possível carregar o cadastro de contatos. Tente abrir novamente.
            </p>
          )}
          {tab === "groups" && groupInstancesError && (
            <p className="text-xs text-destructive">
              Não foi possível carregar as instâncias dos grupos. Tente abrir novamente.
            </p>
          )}
          {tab === "contacts" && connectionsError ? (
            <p className="text-xs text-destructive">{(connectionsError as Error).message}</p>
          ) : tab === "contacts" && availableConnections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Conecte uma instância antes de iniciar uma conversa.
            </p>
          ) : null}
          {tab === "contacts" ? (
            <>
              <Field label="Buscar contato">
                <SearchInput
                  value={q}
                  onChange={(value) => {
                    setQ(value);
                    setPage(1);
                  }}
                  placeholder="Nome ou telefone..."
                />
              </Field>
              <ul
                aria-label="Contatos"
                aria-busy={loadingContacts}
                className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border"
              >
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex h-14 items-center gap-3 border-b border-border/60 px-3 last:border-b-0 hover:bg-surface-1"
                  >
                    <Avatar name={contact.nome} src={contact.avatar_url} size={34} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{contact.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {maskBrazilPhone(contact.telefone)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Nova conversa"
                      aria-label={`Nova conversa com ${contact.nome}`}
                      aria-pressed={selectedContact?.id === contact.id}
                      onClick={() => selectContact(contact)}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
                {contacts.length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    {loadingContacts
                      ? "Buscando contatos…"
                      : contactsError
                        ? "Não foi possível carregar os contatos."
                        : "Nenhum contato encontrado."}
                  </li>
                )}
              </ul>
              {(contactsPage?.totalPages ?? 0) > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Página {page} de {contactsPage?.totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Página anterior de contatos"
                      disabled={loadingContacts || page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Próxima página de contatos"
                      disabled={loadingContacts || page >= (contactsPage?.totalPages ?? 1)}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="Buscar grupo">
                <SearchInput
                  value={groupQuery}
                  onChange={(value) => {
                    setGroupQuery(value);
                    setGroupPage(1);
                  }}
                  placeholder="Nome do grupo..."
                />
              </Field>
              <ul
                aria-label="Grupos"
                aria-busy={loadingGroups}
                className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border"
              >
                {groups.map((group) => (
                  <li
                    key={group.id}
                    className="flex min-h-16 items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface-1"
                  >
                    <Avatar name={group.name} src={group.imageUrl ?? undefined} size={38} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{group.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {group.participantsCount.toLocaleString("pt-BR")} participante(s)
                        {group.connection?.name ? ` · ${group.connection.name}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Nova conversa"
                      aria-label={`Nova conversa com o grupo ${group.name}`}
                      disabled={!canOpenGroup}
                       onClick={() => void openGroup(group)}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
                {groups.length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    {loadingGroups
                      ? "Buscando grupos…"
                      : groupsError
                        ? "Não foi possível carregar os grupos."
                        : "Nenhum grupo encontrado."}
                  </li>
                )}
              </ul>
              {(groupsPage?.totalPages ?? 0) > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Página {groupPage} de {groupsPage?.totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Página anterior de grupos"
                      disabled={loadingGroups || groupPage <= 1}
                      onClick={() => setGroupPage(groupPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Próxima página de grupos"
                      disabled={loadingGroups || groupPage >= (groupsPage?.totalPages ?? 1)}
                      onClick={() => setGroupPage(groupPage + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
      <ActiveConversationOrchestrator
        request={conversationRequest}
        onCancel={() => {
          setConversationRequest(null);
          setSelectedContact(null);
        }}
        onOpened={onClose}
      />
      {contactForm &&
        formReady &&
        ((contactForm.initial && canEditContact) || (!contactForm.initial && canCreateContact)) && (
          <ContactFormModal
            open={open}
            initial={contactForm.initial}
            onClose={() => setContactForm(null)}
            customers={customersPage.items}
            tags={contactOptions.tags}
            departments={contactOptions.departments}
            profiles={contactOptions.profiles}
            instances={instances}
            onCustomerCreated={(customer) =>
              qc.setQueryData<typeof customersPage>(
                ["trixus", "customers", "conversation-options"],
                (current) =>
                  current
                    ? {
                        ...current,
                        items: [
                          ...current.items.filter((item) => item.id !== customer.id),
                          customer,
                        ],
                      }
                    : current,
              )
            }
            onDepartmentSaved={(department) =>
              qc.setQueryData<typeof contactOptions>(
                ["trixus", "contacts", "conversation-options"],
                (current) =>
                  current
                    ? {
                        ...current,
                        departments: [
                          ...current.departments.filter((item) => item.id !== department.id),
                          department,
                        ],
                      }
                    : current,
              )
            }
            onProfileSaved={(profile) =>
              qc.setQueryData<typeof contactOptions>(
                ["trixus", "contacts", "conversation-options"],
                (current) =>
                  current
                    ? {
                        ...current,
                        profiles: [
                          ...current.profiles.filter((item) => item.id !== profile.id),
                          profile,
                        ],
                      }
                    : current,
              )
            }
            onSubmit={async (data) => {
              if (savingContact.current) return;
              savingContact.current = true;
              try {
                const payload = contactPayload(data);
                const contact = contactForm.initial
                  ? await crmApi.updateContact(contactForm.initial.id, payload)
                  : await crmApi.createContact(payload);
                setQ(contact.nome);
                setPage(1);
                setContactForm(null);
                selectContact(contact);
                void qc.invalidateQueries({ queryKey: ["trixus", "contacts"] });
                void qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
                toast.success(contactForm.initial ? "Contato atualizado" : "Contato criado");
              } catch (e) {
                toast.error("Falha ao salvar contato", { description: (e as Error).message });
              } finally {
                savingContact.current = false;
              }
            }}
          />
        )}
      {canCreateGroup && (
        <CreateGroupModal
          open={open && createGroupOpen}
          onClose={() => setCreateGroupOpen(false)}
          instances={groupInstances}
          onSubmit={async (data) => {
            const group = await groupsApi.create(data);
            setCreateGroupOpen(false);
            await qc.invalidateQueries({ queryKey: ["trixus", "groups"] });
            toast.success("Grupo criado");
            if (group.conversationId && canOpenGroup) openGroup(group);
          }}
        />
      )}
    </>
  );
}

type MultiSelectOption = { id: string; label: string; color?: string | null };

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
        <span className="flex min-w-0 items-center gap-2">
          {count === 1 && options.find((option) => selected.has(option.id))?.color && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  options.find((option) => selected.has(option.id))?.color ?? "#22c55e",
              }}
            />
          )}
          <span className="truncate">{summary}</span>
        </span>
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
                {o.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: o.color }}
                  />
                )}
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
