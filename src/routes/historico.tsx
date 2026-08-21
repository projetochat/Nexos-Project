import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShellFull } from "@/components/app-shell";
import { Avatar, Badge, Button, Select } from "@/components/ui-kit";
import { fmtDate, fmtHM } from "@/lib/format";
import { maskBrazilPhone } from "@/lib/input-masks";
import {
  conversationApi,
  messageApi,
  operationsApi,
  type ApiMessage,
  type OperationalPeriod,
} from "@/lib/nexos-api";
import { onRealtimeEvent } from "@/lib/realtime/client";
import { ContactPanel } from "./inbox.$conversationId";

export const Route = createFileRoute("/historico")({ component: HistoricoPage });

const PAGE_SIZE = 20;

function HistoricoPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [period, setPeriod] = React.useState<OperationalPeriod>("30d");
  const [page, setPage] = React.useState(1);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const filters = React.useMemo(
    () => ({
      period,
      status: "fechada" as const,
      q: search.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [page, period, search],
  );

  const history = useQuery({
    queryKey: ["operations", "history", filters],
    queryFn: () => operationsApi.history(filters),
  });
  const conversations = React.useMemo(() => history.data?.items ?? [], [history.data?.items]);

  React.useEffect(() => {
    const first = conversations[0]?.id ?? null;
    if (!activeId && first) setActiveId(first);
    if (activeId && !conversations.some((conversation) => conversation.id === activeId)) {
      setActiveId(first);
    }
  }, [activeId, conversations]);

  React.useEffect(
    () =>
      onRealtimeEvent((event) => {
        if (event.event.startsWith("message.") || event.event.startsWith("conversation.")) {
          queryClient.invalidateQueries({ queryKey: ["operations", "history"] });
          if (activeId) {
            queryClient.invalidateQueries({ queryKey: ["operations", "timeline", activeId] });
            queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
          }
        }
      }),
    [activeId, queryClient],
  );

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const timeline = useQuery({
    queryKey: ["operations", "timeline", activeId],
    queryFn: () => operationsApi.timeline(activeId ?? ""),
    enabled: !!activeId,
  });
  const messages = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => (activeId ? messageApi.list(activeId, { limit: 100 }) : null),
    enabled: !!activeId,
  });

  const handleNewConversation = async () => {
    if (!active?.contact_id) return;
    try {
      const created = await conversationApi.create({
        contactId: active.contact_id,
        departmentId: active.department_id,
        assignToSelf: true,
        firstMessagePreview: active.lastMessagePreview,
      });
      toast.success("Nova conversa iniciada com protocolo oficial");
      navigate({ to: "/inbox/$conversationId", params: { conversationId: created.id } });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <AppShellFull>
      <div className="flex h-full min-h-0 w-full flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Historico de conversas</h1>
            <p className="text-xs text-muted-foreground">
              Consulta operacional de conversas encerradas por periodo, protocolo, contato,
              atendente e departamento.
            </p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-card">
            <div className="grid gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar protocolo, contato..."
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                />
              </div>
              <div className="grid gap-2">
                <Select
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as OperationalPeriod)}
                >
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                </Select>
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
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
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      className={`flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition ${
                        selected ? "bg-surface-2" : "hover:bg-surface-1"
                      }`}
                    >
                      <Avatar name={conversation.contact?.nome ?? "?"} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {conversation.contact?.nome ?? "Contato"}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {fmtDate(new Date(conversation.last_message_at).getTime())}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {conversation.contact?.telefone
                            ? maskBrazilPhone(conversation.contact.telefone)
                            : ""}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{conversation.protocolo ?? "-"}</span>
                          <span>{conversation.department?.nome ?? "Sem departamento"}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <footer className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                Pagina {history.data?.page ?? page} de {history.data?.totalPages ?? 1}
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

          <section className="flex min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {active ? (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => active.contact && setPanelOpen((current) => !current)}
                      aria-expanded={panelOpen}
                      aria-label="Abrir informacoes do contato"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <Avatar name={active.contact?.nome ?? "?"} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {active.contact?.nome ?? "Contato"}
                          </p>
                          <Badge tone={active.status === "fechada" ? "success" : "warning"}>
                            {active.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {active.contact?.telefone ? maskBrazilPhone(active.contact.telefone) : ""}
                          {active.protocolo ? ` - #${active.protocolo}` : ""}
                          {active.department?.nome ? ` - ${active.department.nome}` : ""}
                          {active.agent?.nome ? ` - ${active.agent.nome}` : ""}
                        </p>
                      </div>
                    </button>
                    <Button variant="secondary" size="sm" onClick={handleNewConversation}>
                      <Plus className="h-3.5 w-3.5" /> Nova conversa
                    </Button>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1/40 px-4 py-6">
                    <div className="mx-auto grid w-full max-w-5xl gap-6 xl:grid-cols-[1fr_280px]">
                      <div className="space-y-3">
                        {(messages.data?.items ?? []).map((message) => (
                          <HistoryBubble key={message.id} message={message} />
                        ))}
                        {!messages.isLoading && (messages.data?.items ?? []).length === 0 && (
                          <p className="pt-8 text-center text-xs text-muted-foreground">
                            Nenhuma mensagem registrada.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          Timeline
                        </p>
                        {(timeline.data?.items ?? []).map((item) => (
                          <div
                            key={`${item.event}-${item.at}`}
                            className="rounded-md border border-border bg-card p-3"
                          >
                            <p className="text-xs font-medium">{item.description}</p>
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {fmtDate(new Date(item.at).getTime())}{" "}
                              {fmtHM(new Date(item.at).getTime())}
                            </p>
                            {item.user && (
                              <p className="mt-1 text-[11px] text-muted-foreground">{item.user}</p>
                            )}
                          </div>
                        ))}
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
                Selecione uma conversa para visualizar o historico.
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShellFull>
  );
}

function HistoryBubble({ message }: { message: ApiMessage }) {
  if (message.type === "system" || message.direction === "system") {
    const timestamp = new Date(message.created_at).getTime();
    return (
      <div className="flex items-center gap-3">
        <span className="h-0.5 flex-1 bg-warning/40" />
        <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[10px] uppercase tracking-widest text-warning">
          {(message.content ?? "Evento do sistema").toUpperCase()}
          <span className="ml-2 opacity-80">
            - {fmtDate(timestamp)} {fmtHM(timestamp)}
          </span>
        </span>
        <span className="h-0.5 flex-1 bg-warning/40" />
      </div>
    );
  }
  const mine = message.sender === "agent";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-card ${
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border border-border bg-surface-1"
        }`}
      >
        <span className="break-words">{(message.content ?? "").replace(/\s+/g, " ").trim()}</span>
        <p
          className={`mt-1 text-right font-mono text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
        >
          {fmtHM(new Date(message.created_at).getTime())}
        </p>
      </div>
    </div>
  );
}
