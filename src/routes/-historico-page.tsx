import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import { AppShellFull } from "@/components/app-shell";
import { Avatar, Button } from "@/components/ui-kit";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ActiveConversationOrchestrator,
  type ActiveConversationRequest,
} from "@/components/active-conversation-orchestrator";
import { canStartActiveConversation } from "@/lib/active-conversation-permissions";
import { conversationAuthorizationScope } from "@/lib/conversation-query-authorization";
import { DashboardFiltersBar } from "@/components/dashboard-filters";
import {
  datesForOperationalPeriod,
  type OperationalReportFilters,
} from "@/lib/operational-filters";
import { conversationTimestamp, num } from "@/lib/format";
import { maskBrazilPhone } from "@/lib/input-masks";
import { useSession } from "@/lib/session";
import { conversationApi, messageApi, operationsApi } from "@/lib/trixus-api";
import { onRealtimeEvent } from "@/lib/realtime/client";
import { ContactPanel, MessageBubble } from "./inbox.$conversationId";
import { orderHistoryMessages } from "@/lib/history-message-order";
import { DEFAULT_CHAT_BACKGROUND_COLOR, normalizeHexColor } from "@/lib/chat-appearance";

const PAGE_SIZE = 20;
const HISTORY_PERIODS = new Set([
  "today",
  "yesterday",
  "week",
  "previous_week",
  "month",
  "previous_month",
  "year",
  "previous_year",
  "7d",
  "30d",
  "custom",
]);

type HistoryFiltersMemory = {
  search: string;
  filters: OperationalReportFilters;
};

function defaultHistoryFilters(): OperationalReportFilters {
  return {
    period: "today",
    ...datesForOperationalPeriod("today"),
  };
}

function loadHistoryFilters(storageKey: string): HistoryFiltersMemory {
  const fallback = { search: "", filters: defaultHistoryFilters() };
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return fallback;
    const memory = parsed as Record<string, unknown>;
    if (!memory.filters || typeof memory.filters !== "object") return fallback;
    const filters = memory.filters as Record<string, unknown>;
    if (typeof filters.period !== "string" || !HISTORY_PERIODS.has(filters.period)) {
      return fallback;
    }
    return {
      search: typeof memory.search === "string" ? memory.search : "",
      filters: {
        period: filters.period as OperationalReportFilters["period"],
        ...(typeof filters.q === "string" ? { q: filters.q } : {}),
        ...(filters.conversationType === "contacts" || filters.conversationType === "groups"
          ? { conversationType: filters.conversationType }
          : {}),
        ...(typeof filters.departmentId === "string" ? { departmentId: filters.departmentId } : {}),
        ...(typeof filters.customerId === "string" ? { customerId: filters.customerId } : {}),
        ...(typeof filters.connectionId === "string" ? { connectionId: filters.connectionId } : {}),
        ...(typeof filters.start === "string" ? { start: filters.start } : {}),
        ...(typeof filters.end === "string" ? { end: filters.end } : {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function HistoricoPage({ initialConversationId }: { initialConversationId?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useSession((state) => state.user);
  const conversationScope = conversationAuthorizationScope(user);
  const canStartConversation = canStartActiveConversation(user?.permissions);
  const canViewPhone = user?.permissions?.includes("chat.phone.read") ?? false;
  const filtersStorageKey = `trixus.history.filters.${user?.id ?? "anonymous"}`;
  const [search, setSearch] = React.useState(() => loadHistoryFilters(filtersStorageKey).search);
  const [reportFilters, setReportFilters] = React.useState<OperationalReportFilters>(
    () => loadHistoryFilters(filtersStorageKey).filters,
  );
  const [loadedFiltersStorageKey, setLoadedFiltersStorageKey] = React.useState(filtersStorageKey);
  const [page, setPage] = React.useState(1);
  const [selectedId, setActiveId] = React.useState<string | null>(initialConversationId ?? null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const clearConversationDeepLink = React.useCallback(
    (options: { clearSelection?: boolean } = {}) => {
      if (options.clearSelection) setActiveId(null);
      if (!initialConversationId) return;
      void navigate({
        to: "/historico",
        search: { conversationId: undefined },
        replace: true,
      });
    },
    [initialConversationId, navigate],
  );

  React.useEffect(() => {
    const saved = loadHistoryFilters(filtersStorageKey);
    setSearch(saved.search);
    setReportFilters(saved.filters);
    setPage(1);
    setLoadedFiltersStorageKey(filtersStorageKey);
  }, [filtersStorageKey]);

  React.useEffect(() => {
    if (loadedFiltersStorageKey !== filtersStorageKey) return;
    try {
      window.localStorage.setItem(
        filtersStorageKey,
        JSON.stringify({ search, filters: reportFilters } satisfies HistoryFiltersMemory),
      );
    } catch {
      // A indisponibilidade do armazenamento não deve impedir o uso da tela.
    }
  }, [filtersStorageKey, loadedFiltersStorageKey, reportFilters, search]);

  const filters = React.useMemo(
    () => ({
      ...reportFilters,
      status: "fechada" as const,
      q: search.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
      ...(initialConversationId ? { conversationId: initialConversationId } : {}),
    }),
    [initialConversationId, page, reportFilters, search],
  );

  React.useEffect(() => {
    if (initialConversationId) setActiveId(initialConversationId);
  }, [initialConversationId]);

  const history = useQuery({
    queryKey: ["operations", "history", conversationScope, filters],
    queryFn: () => operationsApi.history(filters),
  });
  const conversations = React.useMemo(() => history.data?.items ?? [], [history.data?.items]);

  // Derive the fallback without an effect that can overwrite a user's click
  // when the list is refreshed or temporarily has no cached data.
  const activeId = conversations.some((conversation) => conversation.id === selectedId)
    ? selectedId
    : (conversations[0]?.id ?? null);

  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("message.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: ["operations", "history"] });
          if (activeId) {
            queryClient.invalidateQueries({ queryKey: ["history-messages", activeId] });
          }
        }
      }),
    [activeId, queryClient],
  );

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const [conversationRequest, setConversationRequest] =
    React.useState<ActiveConversationRequest | null>(null);
  const conversationRequestKey = React.useRef(0);
  const messages = useInfiniteQuery({
    queryKey: ["history-messages", activeId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      messageApi.list(activeId!, { limit: 100, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!activeId,
  });
  const orderedMessages = React.useMemo(
    () => orderHistoryMessages(messages.data?.pages.flatMap((page) => page.items) ?? []),
    [messages.data],
  );

  const handleNewConversation = () => {
    if (!active?.contact || active.is_group) return;
    conversationRequestKey.current += 1;
    setConversationRequest({ key: conversationRequestKey.current, contact: active.contact });
  };

  return (
    <AppShellFull>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8 xl:px-10 2xl:px-12">
        <header
          className={`${selectedId ? "hidden lg:flex" : "flex"} flex-wrap items-center justify-between gap-3`}
        >
          <div>
            <h1 className="text-lg font-semibold">Histórico de Conversas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {historyTotalLabel(history.data?.total ?? 0)}
            </p>
          </div>
        </header>

        <DashboardFiltersBar
          className={`${selectedId ? "hidden lg:flex" : ""} shrink-0`}
          value={reportFilters}
          onChange={(patch) => {
            clearConversationDeepLink({ clearSelection: true });
            setReportFilters((current) => ({ ...current, ...patch }));
            setPage(1);
          }}
          showDepartment={false}
          showConversationType
          onClear={() => {
            clearConversationDeepLink({ clearSelection: true });
            setSearch("");
            setReportFilters(defaultHistoryFilters());
            setPage(1);
          }}
          search={{
            value: search,
            onChange: (value) => {
              clearConversationDeepLink({ clearSelection: true });
              setSearch(value);
              setPage(1);
            },
            placeholder: "Buscar protocolo, contato, grupo...",
          }}
        />

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_1fr]">
          <aside
            aria-label="Lista de conversas do histórico"
            className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card`}
          >
            <ScrollArea className="min-h-0 flex-1">
              <ul>
                {history.isLoading && (
                  <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Carregando...
                  </li>
                )}
                {!history.isLoading && conversations.length === 0 && (
                  <li className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Nenhuma conversa encontrada.
                  </li>
                )}
                {conversations.map((conversation) => {
                  const selected = conversation.id === activeId;
                  const displayName = conversationDisplayName(conversation);
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(conversation.id);
                          if (conversation.id !== initialConversationId) {
                            clearConversationDeepLink();
                          }
                          setPanelOpen(false);
                        }}
                        aria-pressed={selected}
                        className={`flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition ${
                          selected ? "bg-surface-2" : "hover:bg-surface-1"
                        }`}
                      >
                        <Avatar name={displayName} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{displayName}</p>
                              {!conversation.is_group &&
                                canViewPhone &&
                                conversation.contact?.telefone && (
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {maskBrazilPhone(conversation.contact.telefone)}
                                  </p>
                                )}
                            </div>
                            <ConversationListClosureMeta
                              closedAt={conversation.closed_at ?? conversation.last_message_at}
                              protocol={conversation.protocolo}
                            />
                          </div>
                          <div
                            className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground"
                            aria-label="Instância, departamento e atendente do encerramento"
                          >
                            <span className="truncate">
                              {conversation.connection?.name ?? "Sem instância"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">
                              {conversation.department?.nome ?? "Sem departamento"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">
                              {conversation.closed_by?.nome ??
                                conversation.agent?.nome ??
                                "Sem atendente"}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>

            <footer className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                Pagina {num(history.data?.page ?? page)} de {num(history.data?.totalPages ?? 1)}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= (history.data?.totalPages ?? 1)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </footer>
          </aside>

          <section
            aria-label="Conversa do histórico"
            className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-card`}
          >
            {active ? (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      aria-label="Voltar para a lista do histórico"
                      onClick={() => {
                        setActiveId(null);
                        clearConversationDeepLink();
                        setPanelOpen(false);
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => active.contact && setPanelOpen((current) => !current)}
                      aria-expanded={panelOpen}
                      aria-label="Abrir informações do contato"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <Avatar name={conversationDisplayName(active)} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {conversationDisplayName(active)}
                          </p>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {canViewPhone && active.contact?.telefone
                            ? maskBrazilPhone(active.contact.telefone)
                            : ""}
                          {active.protocolo ? ` - #${active.protocolo}` : ""}
                          {active.department?.nome ? ` - ${active.department.nome}` : ""}
                          {active.agent?.nome ? ` - ${active.agent.nome}` : ""}
                        </p>
                      </div>
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="hover:!border-primary hover:!bg-primary hover:!text-primary-foreground focus-visible:!border-primary focus-visible:!bg-primary focus-visible:!text-primary-foreground"
                      onClick={handleNewConversation}
                      disabled={!canStartConversation || active.is_group}
                      aria-label="Nova conversa"
                      title="Nova conversa"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nova conversa</span>
                    </Button>
                  </header>

                  <div
                    className="inbox-message-background min-h-0 flex-1 overflow-y-auto px-2 py-6"
                    style={{
                      backgroundColor: normalizeHexColor(
                        user?.chatBackgroundColor,
                        DEFAULT_CHAT_BACKGROUND_COLOR,
                      ),
                    }}
                  >
                    <div className="w-full">
                      <div className="space-y-4">
                        {messages.hasNextPage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={messages.isFetchingNextPage}
                            onClick={() => messages.fetchNextPage()}
                          >
                            {messages.isFetchingNextPage
                              ? "Carregando…"
                              : "Carregar mensagens anteriores"}
                          </Button>
                        )}
                        {orderedMessages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            m={message}
                            agents={[]}
                            contactName={conversationDisplayName(active)}
                            contactAvatarUrl={active.contact?.avatar_url}
                            isGroup={active.is_group}
                            conversationOriginatedAsLead={
                              active.originated_as_lead ?? active.is_lead
                            }
                            galleryImages={orderedMessages.filter(
                              (item) => item.type === "image" && !item.deleted_for_everyone,
                            )}
                            readOnly
                          />
                        ))}
                        {!messages.isLoading && orderedMessages.length === 0 && (
                          <p className="pt-8 text-center text-xs text-muted-foreground">
                            Nenhuma mensagem registrada.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {active.contact && panelOpen && (
                  <ContactPanel contactId={active.contact.id} onClose={() => setPanelOpen(false)} />
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Selecione uma conversa para visualizar o histórico.
              </div>
            )}
          </section>
        </div>
        <ActiveConversationOrchestrator
          request={conversationRequest}
          onCancel={() => setConversationRequest(null)}
        />
      </div>
    </AppShellFull>
  );
}

export function historyTotalLabel(total: number) {
  return total === 1 ? "1 registro encontrado." : `${total} registros encontrados.`;
}

function conversationDisplayName(conversation: {
  is_group: boolean;
  group_name?: string | null;
  contact?: { nome?: string | null } | null;
}) {
  if (conversation.is_group && conversation.group_name?.trim())
    return conversation.group_name.trim();
  return conversation.contact?.nome?.trim() || (conversation.is_group ? "Grupo" : "Contato");
}

function ConversationListClosureMeta({
  closedAt,
  protocol,
}: {
  closedAt: string;
  protocol: string | null;
}) {
  const timestamp = conversationTimestamp(new Date(closedAt).getTime());
  const timestampLabel = timestamp.day ? `${timestamp.day} ${timestamp.time}` : timestamp.time;
  return (
    <span
      className="shrink-0 text-right text-[10px] leading-4 text-muted-foreground"
      aria-label={`Encerrada em ${timestampLabel}; protocolo ${protocol ?? "não informado"}`}
    >
      <span className="block font-mono">{timestampLabel}</span>
      <span className="block font-mono text-foreground/80">#{protocol ?? "-"}</span>
    </span>
  );
}
