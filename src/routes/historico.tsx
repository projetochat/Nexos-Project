import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShellFull } from "@/components/app-shell";
import { Avatar, Badge, Button } from "@/components/ui-kit";
import { CATALOG, CONV, type Message, type ConvStatus } from "@/lib/mvp";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtDate, fmtHM } from "@/lib/format";
import { ContactPanel } from "./inbox.$conversationId";

export const Route = createFileRoute("/historico")({ component: HistoricoPage });


function HistoricoPage() {
  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ["mvp", "conversations"],
    queryFn: CONV.list,
  });
  const { data: agents = [] } = useQuery({ queryKey: ["mvp", "agents"], queryFn: CATALOG.agents });

  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const navigate = useNavigate();
  const user = useSession((s) => s.user);

  const handleNewConversation = async () => {
    if (!user || !activo?.contact_id) return;
    try {
      const { data, error } = await supabase.from("conversations").insert({
        contact_id: activo.contact_id,
        department_id: activo.department_id,
        agent_id: user.id,
        status: "em_andamento" as ConvStatus,
      } as never).select("id").single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      await supabase.rpc("assign_conversation_protocolo" as never, { _conversation_id: newId } as never);
      toast.success("Nova conversa iniciada — protocolo gerado");
      navigate({ to: "/inbox/$conversationId", params: { conversationId: newId } });
    } catch (e) { toast.error((e as Error).message); }
  };


  const closed = React.useMemo(
    () =>
      conversas
        .filter((c) => c.status === "fechada")
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
    [conversas],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return closed;
    return closed.filter((c) => {
      const hay =
        (c.contact?.nome ?? "") + " " +
        (c.contact?.telefone ?? "") + " " +
        (c.protocolo ?? "") + " " +
        (c.agent?.nome ?? "") + " " +
        (c.department?.nome ?? "");
      return hay.toLowerCase().includes(q);
    });
  }, [closed, query]);

  React.useEffect(() => {
    if (!activeId && filtered[0]) setActiveId(filtered[0].id);
    if (activeId && !filtered.some((c) => c.id === activeId)) {
      setActiveId(filtered[0]?.id ?? null);
    }
  }, [filtered, activeId]);

  const activo = filtered.find((c) => c.id === activeId) ?? null;

  const { data: mensagens = [] } = useQuery({
    queryKey: ["mvp", "messages", activeId],
    queryFn: () => (activeId ? CONV.messages(activeId) : Promise.resolve([] as Message[])),
    enabled: !!activeId,
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensagens.length, activeId]);

  return (
    <AppShellFull>
      <div className="flex h-full min-h-0 w-full flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Histórico de Conversas</h1>
            <p className="text-xs text-muted-foreground">
              Conversas encerradas — consulta por protocolo, contato, atendente ou departamento.
            </p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* Lista */}
          <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar protocolo, contato…"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {isLoading && (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">Carregando…</li>
              )}
              {!isLoading && filtered.length === 0 && (
                <li className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Nenhuma conversa encerrada encontrada.
                </li>
              )}
              {filtered.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={`flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition ${
                        active ? "bg-surface-2" : "hover:bg-surface-1"
                      }`}
                    >
                      <Avatar name={c.contact?.nome ?? "?"} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{c.contact?.nome ?? "Contato"}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {fmtDate(new Date(c.last_message_at).getTime())}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">{c.contact?.telefone}</p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{c.protocolo ?? "—"}</span>
                          <span>·</span>
                          <span className="truncate">{c.department?.nome ?? "—"}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Conversa */}
          <div className="flex min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {activo ? (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => activo.contact && setPanelOpen((v) => !v)}
                      aria-expanded={panelOpen}
                      aria-label="Abrir informações do contato"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <Avatar name={activo.contact?.nome ?? "?"} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{activo.contact?.nome ?? "Contato"}</p>
                          <Badge tone="success">fechada</Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {activo.contact?.telefone}
                          {activo.protocolo ? ` · #${activo.protocolo}` : ""}
                          {activo.department?.nome ? ` · ${activo.department.nome}` : ""}
                          {activo.agent?.nome ? ` · ${activo.agent.nome}` : ""}
                        </p>
                      </div>
                    </button>
                    <Button variant="secondary" size="sm" onClick={handleNewConversation}>
                      <Plus className="h-3.5 w-3.5" /> Nova conversa
                    </Button>
                  </header>

                  <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-surface-1/40 px-4 py-6">
                    <div className="mx-auto w-full max-w-5xl space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="h-0.5 flex-1 bg-success/40" />
                        <span className="rounded-full border border-success/40 bg-success/10 px-3 py-1 text-[10px] uppercase tracking-widest text-success">
                          Iniciada {fmtDate(new Date(activo.created_at).getTime())}
                          {activo.protocolo ? ` — Protocolo: ${activo.protocolo}` : ""}
                        </span>
                        <span className="h-0.5 flex-1 bg-success/40" />
                      </div>
                      {mensagens.map((m) => (
                        <HistoryBubble key={m.id} m={m} agents={agents} />
                      ))}
                      {mensagens.length === 0 && (
                        <p className="pt-8 text-center text-xs text-muted-foreground">
                          Nenhuma mensagem registrada.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {activo.contact && panelOpen && (
                  <ContactPanel contactId={activo.contact.id} onClose={() => setPanelOpen(false)} />
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                Selecione uma conversa à esquerda para visualizar o histórico.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShellFull>
  );
}

function HistoryBubble({ m, agents }: { m: Message; agents: { id: string; nome: string }[] }) {
  if (m.type === "system") {
    const ts = new Date(m.created_at).getTime();
    const isClosing = /encerra/i.test(m.content);
    const tone = isClosing
      ? { line: "bg-destructive/40", pill: "border-destructive/40 bg-destructive/10 text-destructive" }
      : { line: "bg-warning/40", pill: "border-warning/40 bg-warning/10 text-warning" };
    return (
      <div className="flex items-center gap-3">
        <span className={`h-0.5 flex-1 ${isClosing ? tone.line : "opacity-0"}`} />
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${tone.pill}`}>
          {m.content.toUpperCase()}
          <span className="ml-2 opacity-80">
            — {`${fmtDate(ts)} ${fmtHM(ts)}`.toUpperCase()}
          </span>
        </span>
        <span className={`h-0.5 flex-1 ${isClosing ? tone.line : "opacity-0"}`} />
      </div>
    );
  }
  const mine = m.sender === "agent";
  const authorName = mine && m.author_id ? agents.find((a) => a.id === m.author_id)?.nome ?? null : null;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-card ${
          mine ? "rounded-br-sm bg-gradient-brand text-white" : "rounded-bl-sm border border-border bg-surface-1"
        }`}
      >
        {authorName && (
          <p className={`mb-1 text-[11px] font-semibold ${mine ? "text-white/90" : "text-foreground"}`}>
            {authorName}
          </p>
        )}
        {m.type === "image" && m.media_data && (
          <img src={m.media_data} alt="imagem" className="mb-1 max-h-72 rounded-lg object-cover" />
        )}
        {m.content && m.content !== "[áudio]" && m.content !== "[imagem]" && (
          <span className="break-words">{m.content.replace(/\s+/g, " ").trim()}</span>
        )}
        <p className={`mt-1 text-right font-mono text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
          {fmtHM(new Date(m.created_at).getTime())}
        </p>
      </div>
    </div>
  );
}
