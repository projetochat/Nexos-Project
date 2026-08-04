import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  ArrowRightLeft,
  CheckCircle2,
  Mic,
  Square,
  Trash2,
  Play,
  Pause,
  Zap,
  Paperclip,
  X,
  Link as LinkIcon,
  Tag as TagIcon,
  Plus,
  Pencil,
  Ticket,
} from "lucide-react";
// Notificações desativadas nesta tela — nenhum toast deve aparecer no chat.
const toast = {
  success: (_?: unknown) => {},
  error: (_?: unknown) => {},
  message: (_?: unknown) => {},
  info: (_?: unknown) => {},
};
import { InboxLayout } from "./inbox.index";
import { Avatar, Badge, Button, Field, Input, Select } from "@/components/ui-kit";
import { Modal, ConfirmDialog, useDisclosure } from "@/components/modal";
import {
  conversationApi,
  crmApi,
  messageApi,
  organizationApi,
  quickReplyApi,
  type ApiConversationStatus as ConvStatus,
  type ApiMessage,
  type ApiQuickReply as QuickReply,
  type ApiTag as Tag,
} from "@/lib/nexos-api";
import { useSession } from "@/lib/session";
import { fmtHM, fmtDate, fmtLogStamp } from "@/lib/format";
import { useQueuePrefs } from "@/lib/queue-prefs";
import { useChatPerms } from "@/lib/perms";
import { startTyping, stopTyping } from "@/lib/realtime/client";

export const Route = createFileRoute("/inbox/$conversationId")({ component: ConversationPage });

type Message = ApiMessage;

const STATUS_TONE: Record<ConvStatus, "warning" | "info" | "success" | "default"> = {
  aberta: "warning",
  em_andamento: "info",
  aguardando: "warning",
  fechada: "success",
};

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: conv } = useQuery({
    queryKey: ["nexos", "conversations", conversationId],
    queryFn: () => conversationApi.get(conversationId),
  });

  const { data: mensagens = [] } = useQuery({
    queryKey: ["nexos", "messages", conversationId],
    queryFn: () => messageApi.list(conversationId, { limit: 50 }).then((page) => page.items),
    refetchInterval: 30_000,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["nexos", "users", "conversation-transfer"],
    queryFn: organizationApi.listUsers,
  });
  const agents = React.useMemo(
    () =>
      memberships
        .filter(
          (membership) => membership.status === "ACTIVE" && membership.user.status === "ACTIVE",
        )
        .map((membership) => ({
          id: membership.id,
          userId: membership.user.id,
          nome: membership.user.name,
          email: membership.user.email,
        })),
    [memberships],
  );
  const messageAgents = React.useMemo(
    () => agents.map((agent) => ({ id: agent.userId, nome: agent.nome })),
    [agents],
  );
  const { data: apiDepartments = [] } = useQuery({
    queryKey: ["nexos", "departments", "conversation-transfer"],
    queryFn: organizationApi.listDepartments,
  });
  const departments = React.useMemo(
    () =>
      apiDepartments.map((department) => ({
        id: department.id,
        nome: department.name,
        cor: department.color,
        descricao: department.description,
      })),
    [apiDepartments],
  );

  const perms = useChatPerms();
  const showAgentName = perms.mostrar_nome_atendente;

  React.useEffect(() => {
    if (!conv?.id || conv.unreadCount <= 0) return;
    void messageApi.markRead(conv.id).then(() => {
      qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
      qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
      qc.invalidateQueries({ queryKey: ["nexos", "messages", conv.id] });
    });
  }, [conv?.id, conv?.unreadCount, qc]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensagens.length]);

  const transferModal = useDisclosure();
  const [panelOpen, setPanelOpen] = React.useState(false);
  const queuePrefs = useQueuePrefs();
  const filaLabel = queuePrefs.find((p) => p.id === "fila")?.label ?? "Fila";
  const standbyLabel = queuePrefs.find((p) => p.id === "standby")?.label ?? "Stand By";

  const [closing, setClosing] = React.useState(false);
  const [gerando, setGerando] = React.useState(false);

  if (!conv) {
    return (
      <InboxLayout>
        <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
          Conversa não encontrada.
        </div>
      </InboxLayout>
    );
  }

  const isStarted = !!conv.protocolo && !!conv.agent_id;
  const isStandby = conv.status === "aguardando";
  const isMine = !!user && conv.agent_id === user.id;
  const canSend = isStarted && isMine && conv.status !== "fechada" && !isStandby;
  const showStart = conv.status !== "fechada" && (!conv.agent_id || isStandby);
  const wasStarted = !!conv.protocolo;
  const startLabel = isStandby || (!conv.agent_id && wasStarted) ? "Retomar" : "Iniciar";

  const handleAssume = async () => {
    if (!user) return;
    try {
      const hadProtocolo = !!conv.protocolo;
      await conversationApi.assign(conv.id, { self: true });
      if (isStandby) await conversationApi.updateStatus(conv.id, "em_andamento");
      qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
      qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
      toast.success(
        hadProtocolo || isStandby ? "Conversa retomada" : "Conversa iniciada — protocolo gerado",
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleNewConversation = async () => {
    if (!user || !conv.contact_id) return;
    try {
      const conversation = await conversationApi.create({
        contactId: conv.contact_id,
        departmentId: conv.department_id,
        assignToSelf: true,
        firstMessagePreview: "Nova conversa iniciada pelo atendimento.",
      });
      qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
      toast.success("Nova conversa iniciada — protocolo gerado");
      navigate({ to: "/inbox/$conversationId", params: { conversationId: conversation.id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleGerarChamado = async () => {
    if (!user || !conv.contact) return;
    if (!conv.protocolo) {
      window.alert(
        "Esta conversa ainda não possui protocolo. Inicie a conversa antes de gerar o chamado.",
      );
      return;
    }
    setGerando(true);
    try {
      const esc = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const fmt = (iso: string) => {
        const d = new Date(iso);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
      };
      const contactName = conv.contact.nome ?? "Contato";
      const parts = mensagens.map((m) => {
        const ts = fmt(m.created_at);
        if (m.type === "system") {
          return `<p style="color:#64748b;font-size:12px"><em>[${ts}] ${esc(m.content)}</em></p>`;
        }
        const who =
          m.sender === "contact"
            ? contactName
            : (messageAgents.find((a) => a.id === m.author_id)?.nome ?? "Atendente");
        if (m.type === "image" && m.media_data) {
          const caption = m.content ? `<br/>${esc(m.content)}` : "";
          return `<p><strong>${esc(who)}</strong> <span style="color:#64748b">[${ts}]</span>:<br/><img src="${m.media_data}" alt="anexo" style="max-width:100%;border-radius:8px;margin:4px 0"/>${caption}</p>`;
        }
        if (m.type === "audio") {
          return `<p><strong>${esc(who)}</strong> <span style="color:#64748b">[${ts}]</span>: <em>[áudio]</em></p>`;
        }
        return `<p><strong>${esc(who)}</strong> <span style="color:#64748b">[${ts}]</span>: ${esc(m.content).replace(/\n/g, "<br/>")}</p>`;
      });
      const descricao_html =
        parts.length > 0 ? parts.join("") : "<p><em>Sem mensagens registradas.</em></p>";

      void descricao_html;
      throw new Error("Geracao de chamados pela Inbox exige API oficial de Chamados.");
    } catch (e) {
      window.alert((e as Error).message || "Não foi possível gerar o chamado.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <InboxLayout>
      <div className="flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface-1 px-5 py-3">
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
              aria-label="Abrir informações do contato"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <Avatar name={conv.contact?.nome ?? "?"} size={38} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">
                    {conv.contact?.nome ?? "Contato"}
                    {conv.is_group && (
                      <span className="ml-1 text-[10px] text-muted-foreground">· grupo</span>
                    )}
                  </p>
                  <Badge tone={STATUS_TONE[conv.status]}>{conv.status.replace("_", " ")}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {perms.visualiza_numero && <span>{conv.contact?.telefone}</span>}
                </div>
              </div>
            </button>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {conv.status === "fechada" ? (
                <Button variant="secondary" size="sm" onClick={handleNewConversation}>
                  <Plus className="h-3.5 w-3.5" /> Nova conversa
                </Button>
              ) : (
                <>
                  {showStart && (
                    <Button variant="secondary" size="sm" onClick={handleAssume}>
                      <Play className="h-3.5 w-3.5" /> {startLabel}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={transferModal.show}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />{" "}
                    <span className="hidden lg:inline">Transferir</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setClosing(true)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                    <span className="hidden lg:inline">Encerrar</span>
                  </Button>
                </>
              )}
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto max-w-4xl space-y-4">
              {(() => {
                const isLead = !conv.agent_id && conv.status !== "fechada" && !conv.protocolo;
                const line = isLead ? "bg-info/40" : "bg-success/40";
                const pill = isLead
                  ? "border-info/40 bg-info/10 text-info"
                  : "border-success/40 bg-success/10 text-success";
                const label = isLead
                  ? `Novo Lead ${fmtLogStamp(new Date(conv.created_at).getTime())}`
                  : `Iniciada ${fmtLogStamp(new Date(conv.created_at).getTime())}${conv.protocolo ? ` — Protocolo: ${conv.protocolo}` : ""}`;
                return (
                  <div className="flex items-center gap-3">
                    <span className={`h-0.5 flex-1 ${line}`} />
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${pill}`}
                    >
                      {label}
                    </span>
                    <span className={`h-0.5 flex-1 ${line}`} />
                  </div>
                );
              })()}
              {mensagens
                .filter(
                  (m) => !(conv.protocolo && m.type === "system" && /novo lead/i.test(m.content)),
                )
                .map((m) => (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    agents={messageAgents}
                    showAgentName={showAgentName}
                  />
                ))}
              {mensagens.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
              )}
            </div>
          </div>

          <div className="relative">
            <Composer
              conversationId={conv.id}
              authorId={user?.id ?? null}
              disabled={!canSend}
              disabledReason={
                conv.status === "fechada"
                  ? "closed"
                  : isStandby
                    ? "standby"
                    : !conv.agent_id
                      ? "lead"
                      : !isMine
                        ? "not-mine"
                        : null
              }
              onStart={showStart ? handleAssume : undefined}
              allowQuickReplies={perms.acessa_mensagens_rapidas}
              allowAudio={perms.enviar_audio}
              onSent={() => {
                qc.invalidateQueries({ queryKey: ["nexos", "messages", conv.id] });
                qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
                qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
              }}
            />
            <div className="pointer-events-none absolute inset-y-0 right-4 hidden items-center xl:flex">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGerarChamado}
                disabled={gerando || !conv.protocolo}
                title={
                  conv.protocolo
                    ? "Gerar chamado a partir desta conversa"
                    : "Inicie a conversa para gerar o chamado"
                }
                className="pointer-events-auto"
              >
                <Ticket className="h-3.5 w-3.5" /> {gerando ? "Gerando…" : "Gerar Chamado"}
              </Button>
            </div>
          </div>
          <div className="border-t border-border bg-surface-1 px-3 pb-3 xl:hidden">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGerarChamado}
              disabled={gerando || !conv.protocolo}
              className="w-full"
            >
              <Ticket className="h-3.5 w-3.5" /> {gerando ? "Gerando…" : "Gerar Chamado"}
            </Button>
          </div>
        </div>

        {conv.contact && panelOpen && (
          <ContactPanel contactId={conv.contact.id} onClose={() => setPanelOpen(false)} />
        )}
      </div>

      <TransferModal
        open={transferModal.open}
        onClose={transferModal.hide}
        agents={agents.filter((a) => a.userId !== conv.agent_id)}
        departments={departments.filter((d) => d.id !== conv.department_id)}
        onSubmitAgent={async (id) => {
          await conversationApi.assign(conv.id, { membershipId: id });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
          toast.success("Conversa transferida");
          transferModal.hide();
        }}
        onSubmitDepartment={async (id) => {
          await conversationApi.transferDepartment(conv.id, id);
          qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
          toast.success("Conversa movida");
          transferModal.hide();
        }}
        onSubmitStatus={async (status) => {
          const label = status === "fila" ? filaLabel : standbyLabel;
          await conversationApi.updateStatus(conv.id, status === "fila" ? "aberta" : "aguardando");
          qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
          toast.success(`Conversa movida para ${label}`);
          transferModal.hide();
        }}
      />
      <ConfirmDialog
        open={closing}
        title="Encerrar conversa?"
        description="A conversa será marcada como encerrada. Se o cliente enviar uma nova mensagem, ela reabre automaticamente."
        confirmLabel="Encerrar"
        onClose={() => setClosing(false)}
        onConfirm={async () => {
          await conversationApi.updateStatus(conv.id, "fechada");
          qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations", conv.id] });
          toast.success("Conversa encerrada");
        }}
      />
    </InboxLayout>
  );
}

/* -------- Message bubble -------- */
function MessageBubble({
  m,
  agents,
  showAgentName = true,
}: {
  m: Message;
  agents: { id: string; nome: string }[];
  showAgentName?: boolean;
}) {
  if (m.type === "system") {
    const ts = new Date(m.created_at).getTime();
    const isClosing = /encerra/i.test(m.content);
    const isLead = /novo lead/i.test(m.content);
    const tone = isClosing
      ? {
          line: "bg-destructive/40",
          pill: "border-destructive/40 bg-destructive/10 text-destructive",
        }
      : isLead
        ? { line: "bg-primary/40", pill: "border-primary/40 bg-primary/10 text-primary" }
        : { line: "bg-warning/40", pill: "border-warning/40 bg-warning/10 text-warning" };
    const withLines = isClosing || isLead;
    const label = isLead ? "NOVO LEAD" : m.content.toUpperCase();
    return (
      <div className="flex items-center gap-3">
        <span className={`h-0.5 flex-1 ${withLines ? tone.line : "opacity-0"}`} />
        <span
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${tone.pill}`}
        >
          {label}
          <span className="ml-2 opacity-80">— {fmtLogStamp(ts)}</span>
        </span>
        <span className={`h-0.5 flex-1 ${withLines ? tone.line : "opacity-0"}`} />
      </div>
    );
  }
  const mine = m.sender === "agent";
  const authorName =
    showAgentName && mine && m.author_id
      ? (agents.find((a) => a.id === m.author_id)?.nome ?? null)
      : null;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-card ${
          mine
            ? "rounded-br-sm bg-gradient-brand text-white"
            : "rounded-bl-sm border border-border bg-surface-1"
        }`}
      >
        {authorName && (
          <p
            className={`mb-1 text-[11px] font-semibold ${mine ? "text-white/90" : "text-foreground"}`}
          >
            {authorName}
          </p>
        )}
        {m.type === "image" && m.media_data && (
          <img src={m.media_data} alt="imagem" className="mb-1 max-h-72 rounded-lg object-cover" />
        )}
        {m.type === "audio" && m.media_data && (
          <AudioPlayer src={m.media_data} durationMs={m.duration_ms} mine={mine} />
        )}
        {m.content && m.content !== "[áudio]" && m.content !== "[imagem]" && (
          <span className="break-words">{m.content.replace(/\s+/g, " ").trim()}</span>
        )}
        <p
          className={`mt-1 text-right font-mono text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}
        >
          {fmtHM(new Date(m.created_at).getTime())}
          {mine && <span className="ml-2">{messageStatusLabel(m.status)}</span>}
        </p>
      </div>
    </div>
  );
}

function messageStatusLabel(status: Message["status"]) {
  const labels: Record<Message["status"], string> = {
    created: "criada",
    queued: "fila",
    sending: "enviando",
    sent: "enviada",
    failed: "falhou",
    delivered: "entregue",
    read: "lida",
  };
  return labels[status];
}

function AudioPlayer({
  src,
  durationMs,
  mine,
}: {
  src: string;
  durationMs: number | null;
  mine: boolean;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  const secs = durationMs ? Math.round(durationMs / 1000) : null;
  return (
    <div
      className={`flex min-w-[180px] items-center gap-2 rounded-lg px-2 py-1 ${mine ? "bg-white/15" : "bg-surface-2"}`}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="flex-1 text-[11px] opacity-80">Áudio {secs !== null ? `· ${secs}s` : ""}</div>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} preload="metadata" />
    </div>
  );
}

/* -------- Composer with quick replies, audio, paste-image -------- */
type DisabledReason = "closed" | "standby" | "lead" | "not-mine" | null;
function Composer({
  conversationId,
  authorId,
  disabled,
  disabledReason,
  onStart,
  onSent,
  allowQuickReplies = true,
  allowAudio = true,
}: {
  conversationId: string;
  authorId: string | null;
  disabled: boolean;
  disabledReason?: DisabledReason;
  onStart?: () => void;
  onSent: () => void;
  allowQuickReplies?: boolean;
  allowAudio?: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");

  const [pendingImage, setPendingImage] = React.useState<string | null>(null);
  const [showQR, setShowQR] = React.useState(false);
  const [qrFilter, setQrFilter] = React.useState("");
  const [pendingCloseAfter, setPendingCloseAfter] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const typingActiveRef = React.useRef(false);
  const typingStopTimerRef = React.useRef<number | null>(null);

  const { data: quickReplies = [] } = useQuery({
    queryKey: ["nexos", "quick-replies", "composer"],
    queryFn: () => quickReplyApi.list(),
  });

  // Show quick reply list when text starts with '/'
  React.useEffect(() => {
    if (allowQuickReplies && text.startsWith("/")) {
      setQrFilter(text.slice(1).toLowerCase());
      setShowQR(true);
    } else if (!text) {
      // keep panel state on manual toggle
    } else {
      setShowQR(false);
    }
  }, [text, allowQuickReplies]);

  // Auto-resize textarea up to 5 lines
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 5 * 20 + 12; // 5 linhas + padding
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [text]);

  const filteredQR = React.useMemo(() => {
    if (!qrFilter) return quickReplies;
    return quickReplies.filter(
      (q) => q.atalho.toLowerCase().includes(qrFilter) || q.texto.toLowerCase().includes(qrFilter),
    );
  }, [quickReplies, qrFilter]);

  const applyQR = (qr: QuickReply) => {
    setText(qr.texto);
    setPendingCloseAfter(!!qr.close_on_send);
    setShowQR(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    if (disabled || !authorId) return;
    emitTypingStop();
    let t = text.replace(/\s+/g, " ").trim();
    let closeAfter = pendingCloseAfter;
    // Expand quick reply shortcut like "/bd" → full text
    if (allowQuickReplies && t.startsWith("/")) {
      const atalho = t.slice(1).toLowerCase();
      const match =
        quickReplies.find((q) => q.atalho.toLowerCase() === atalho) ??
        (filteredQR.length === 1 ? filteredQR[0] : undefined);
      if (match) {
        t = match.texto;
        closeAfter = closeAfter || !!match.close_on_send;
      }
    }
    if (pendingImage) {
      toast.error("Envio de mídia ainda não está disponível no core Nexos.");
      return;
    }
    if (!t) {
      toast.error("Escreva uma mensagem.");
      return;
    }
    try {
      await messageApi.sendText(conversationId, t);
      setText("");
      setShowQR(false);
      setQrFilter("");
      setPendingCloseAfter(false);
      void messageApi
        .markRead(conversationId)
        .then(() => qc.invalidateQueries({ queryKey: ["nexos", "conversations"] }));
      if (closeAfter) {
        try {
          await conversationApi.updateStatus(conversationId, "fechada");
          toast.success("Conversa encerrada");
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const emitTypingStart = () => {
    if (disabled || typingActiveRef.current) return;
    typingActiveRef.current = true;
    startTyping(conversationId);
  };

  const emitTypingStop = React.useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    stopTyping(conversationId);
  }, [conversationId]);

  React.useEffect(() => emitTypingStop, [emitTypingStop]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      toast.error("Envio de mídia ainda não está disponível no core Nexos.");
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.error("Envio de mídia ainda não está disponível no core Nexos.");
    e.target.value = "";
  };

  /* --- audio recording --- */
  const [recording, setRecording] = React.useState(false);
  const [pendingAudio, setPendingAudio] = React.useState<{ url: string; duration: number } | null>(
    null,
  );
  const recRef = React.useRef<{ rec: MediaRecorder; chunks: Blob[]; startedAt: number } | null>(
    null,
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dur = Date.now() - (recRef.current?.startedAt ?? Date.now());
          setPendingAudio({ url: String(reader.result), duration: dur });
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      recRef.current = { rec, chunks, startedAt: Date.now() };
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    recRef.current?.rec.stop();
    setRecording(false);
  };

  const sendAudio = async () => {
    if (!pendingAudio || !authorId) return;
    toast.error("Envio de áudio ainda não está disponível no core Nexos.");
  };

  return (
    <div className="border-t border-border bg-surface-1 p-3">
      <div className="mx-auto max-w-3xl">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-card">
            <img src={pendingImage} alt="preview" className="h-16 w-16 rounded object-cover" />
            <p className="flex-1 text-xs text-muted-foreground">
              Imagem anexada. Envie para incluir na conversa.
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remover"
              onClick={() => setPendingImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {pendingAudio && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-card">
            <audio src={pendingAudio.url} controls className="h-8" />
            <p className="flex-1 text-xs text-muted-foreground">Áudio pronto. Envie ou descarte.</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Descartar"
              onClick={() => setPendingAudio(null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="sm" onClick={sendAudio}>
              <Send className="h-3.5 w-3.5" /> Enviar áudio
            </Button>
          </div>
        )}

        {showQR && filteredQR.length > 0 && (
          <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-card">
            {filteredQR.slice(0, 8).map((qr) => (
              <button
                key={qr.id}
                type="button"
                onClick={() => applyQR(qr)}
                className="flex w-full items-start gap-3 border-b border-border/60 px-3 py-2 text-left hover:bg-surface-1"
              >
                <span className="font-mono text-xs text-primary">
                  /{qr.atalho.replace(/^\//, "")}
                </span>
                <span className="flex-1 text-xs text-foreground/80 line-clamp-1">{qr.texto}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-card focus-within:border-primary">
          <div className="flex items-center gap-0.5">
            {allowQuickReplies && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mensagens rápidas"
                onClick={() => setShowQR((v) => !v)}
                disabled={disabled}
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Anexar imagem"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFilePick}
            />
          </div>
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              emitTypingStart();
              if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
              typingStopTimerRef.current = window.setTimeout(emitTypingStop, 2500);
            }}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === "Escape") setShowQR(false);
            }}
            disabled={disabled}
            placeholder={
              disabledReason === "closed"
                ? "Conversa encerrada."
                : disabledReason === "lead"
                  ? "Clique em Iniciar acima para responder este lead."
                  : disabledReason === "standby"
                    ? "Clique em Retomar acima para voltar a atender."
                    : disabledReason === "not-mine"
                      ? "Conversa atribuída a outro atendente."
                      : "Escreva uma resposta…  (digite / para atalhos)"
            }
            className="flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-50"
            style={{ minHeight: 32, maxHeight: 5 * 20 + 12 }}
          />

          {allowAudio &&
            (!recording ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Gravar áudio"
                onClick={startRecording}
                disabled={disabled || !!pendingAudio}
              >
                <Mic className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="icon"
                aria-label="Parar gravação"
                onClick={stopRecording}
              >
                <Square className="h-4 w-4" />
              </Button>
            ))}
          <Button variant="primary" size="sm" onClick={handleSend} disabled={disabled}>
            <Send className="h-3.5 w-3.5" /> Enviar
          </Button>
        </div>
        {recording && (
          <p className="mt-2 text-center text-[11px] text-destructive">
            ● Gravando… clique no quadrado para parar.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------- Right panel: contact / customer / tags -------- */
export function ContactPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const perms = useChatPerms();
  const qc = useQueryClient();
  const tagsModal = useDisclosure();

  const renameModal = useDisclosure();

  const { data: contact } = useQuery({
    queryKey: ["nexos", "contacts", contactId],
    queryFn: () => crmApi.getContact(contactId),
  });
  const customerId = contact?.customer_id ?? null;
  const customer = contact?.customer ?? null;
  const contactTags = contact?.tags ?? [];

  const { data: protocolos = [] } = useQuery({
    queryKey: ["nexos", "contact_protocols", contactId],
    queryFn: async () => {
      const page = await conversationApi.list({
        contactId,
        pageSize: 50,
        sort: "createdAt",
        direction: "desc",
      });
      return page.items
        .filter((conversation) => conversation.protocolo)
        .map((conversation) => ({
          id: conversation.id,
          protocolo: conversation.protocolo!,
          status: conversation.status,
          created_at: conversation.created_at,
        }));
    },
  });

  const [protoFilter, setProtoFilter] = React.useState("");
  const filteredProtocolos = React.useMemo(
    () =>
      protocolos.filter((p) =>
        p.protocolo.toLowerCase().includes(protoFilter.trim().toLowerCase()),
      ),
    [protocolos, protoFilter],
  );

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface-1 lg:w-[400px]">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Contato
          </p>
          <div className="flex items-center gap-1">
            {perms.pode_editar_contato && (
              <Button
                variant="ghost"
                size="sm"
                onClick={renameModal.show}
                aria-label="Editar contato"
              >
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar painel">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <p className="mt-2 truncate text-sm font-semibold">{contact?.nome ?? "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {perms.visualiza_numero ? (contact?.telefone ?? "—") : "•••"}
          {contact?.email ? ` - ${contact.email}` : ""}
        </p>

        <dl className="mt-3 space-y-1 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">Instância</dt>
            <dd className="truncate text-right text-foreground/90">{contact?.instancia ?? "—"}</dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">Cliente</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1.5 truncate text-right text-foreground/90">
              {customer?.cor && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: customer.cor }}
                />
              )}
              <span className="truncate">{customer?.nome ?? "—"}</span>
            </dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">Departamento</dt>
            <dd className="truncate text-right text-foreground/90">
              {contact?.departamento ?? "—"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="uppercase tracking-wide text-muted-foreground">Perfil na Empresa</dt>
            <dd className="truncate text-right text-foreground/90">
              {contact?.nivel_gerencia ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Etiquetas
            </p>
            {perms.pode_usar_etiquetas && (
              <Button variant="ghost" size="sm" onClick={tagsModal.show}>
                <TagIcon className="h-3 w-3" /> Etiquetas
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contactTags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                style={{ borderColor: t.cor + "80", color: t.cor, backgroundColor: t.cor + "20" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.cor }} />
                {t.nome}
              </span>
            ))}
            {contactTags.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma etiqueta.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Protocolos
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {protoFilter
                ? `${filteredProtocolos.length}/${protocolos.length}`
                : protocolos.length}
            </span>
          </div>
          {protocolos.length > 0 && (
            <input
              type="text"
              value={protoFilter}
              onChange={(e) => setProtoFilter(e.target.value)}
              placeholder="Filtrar protocolo…"
              className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          )}
          {protocolos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum protocolo registrado.</p>
          ) : filteredProtocolos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum protocolo encontrado.</p>
          ) : (
            <ul className="space-y-1.5">
              {filteredProtocolos.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/inbox/$conversationId"
                    params={{ conversationId: p.id }}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="font-mono text-foreground/90">#{p.protocolo}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {fmtDate(new Date(p.created_at).getTime())}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TagsModal
        open={tagsModal.open}
        onClose={tagsModal.hide}
        contactId={contactId}
        current={contactTags}
        canManageCatalog={perms.pode_editar_etiquetas}
        onChanged={() => qc.invalidateQueries({ queryKey: ["nexos", "contacts", contactId] })}
      />
      <RenameContactModal
        open={renameModal.open}
        onClose={renameModal.hide}
        contactId={contactId}
        initialName={contact?.nome ?? ""}
        initialCustomerId={customerId}
        initialEmail={contact?.email ?? ""}
        initialDepartamento={contact?.departamento ?? ""}
        initialNivel={
          (contact?.nivel_gerencia as
            | "Colaborador"
            | "Supervisor"
            | "Gerente"
            | "Diretoria"
            | null) ?? null
        }
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["nexos", "contacts", contactId] });
          qc.invalidateQueries({ queryKey: ["nexos", "conversations"] });
          qc.invalidateQueries({ queryKey: ["nexos", "contact_protocols", contactId] });
          renameModal.hide();
        }}
      />
    </aside>
  );
}

function RenameContactModal({
  open,
  onClose,
  contactId,
  initialName,
  initialCustomerId,
  initialEmail,
  initialDepartamento,
  initialNivel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  initialName: string;
  initialCustomerId: string | null;
  initialEmail: string;
  initialDepartamento: string;
  initialNivel: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null;
  onSaved: () => void;
}) {
  const perms = useChatPerms();
  const [nome, setNome] = React.useState(initialName);
  const [customerId, setCustomerId] = React.useState<string | null>(initialCustomerId);
  const [email, setEmail] = React.useState(initialEmail);
  const [departamento, setDepartamento] = React.useState(initialDepartamento);
  const [nivel, setNivel] = React.useState<
    "" | "Colaborador" | "Supervisor" | "Gerente" | "Diretoria"
  >(initialNivel ?? "");
  const [busy, setBusy] = React.useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["nexos", "customers", "list-all"],
    queryFn: () => crmApi.listCustomers({ pageSize: 100 }).then((page) => page.items),
    enabled: open,
  });

  React.useEffect(() => {
    if (open) {
      setNome(initialName);
      setCustomerId(initialCustomerId);
      setEmail(initialEmail);
      setDepartamento(initialDepartamento);
      setNivel(initialNivel ?? "");
    }
  }, [open, initialName, initialCustomerId, initialEmail, initialDepartamento, initialNivel]);

  const save = async () => {
    const n = nome.trim();
    if (!n) {
      toast.error("Informe o nome.");
      return;
    }
    const em = email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error("E-mail inválido.");
      return;
    }
    setBusy(true);
    try {
      const patch: Parameters<typeof crmApi.updateContact>[1] = {};
      if (n !== initialName) patch.name = n;
      if ((em || null) !== (initialEmail || null)) patch.email = em || null;
      if ((departamento.trim() || null) !== (initialDepartamento || null))
        patch.departmentName = departamento.trim() || null;
      if ((nivel || null) !== (initialNivel ?? null)) {
        const roleMap = {
          Colaborador: "COLABORADOR",
          Supervisor: "SUPERVISOR",
          Gerente: "GERENTE",
          Diretoria: "DIRETORIA",
        } as const;
        patch.companyRole = nivel ? roleMap[nivel] : null;
      }
      if (
        perms.pode_editar_vinculo_cliente &&
        (customerId ?? null) !== (initialCustomerId ?? null)
      ) {
        patch.customerId = customerId;
      }
      if (Object.keys(patch).length) {
        await crmApi.updateContact(contactId, patch);
      }
      toast.success("Contato atualizado");
      onSaved();
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
      title="Editar contato"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do contato"
          />
        </Field>
        {perms.pode_editar_vinculo_cliente && (
          <Field label="Cliente">
            <Select
              value={customerId ?? ""}
              onChange={(e) => setCustomerId(e.target.value || null)}
            >
              <option value="">Sem vínculo</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Departamento">
          <Input
            value={departamento}
            onChange={(e) => setDepartamento(e.target.value)}
            placeholder="Ex.: Financeiro"
          />
        </Field>
        <Field label="Perfil na Empresa">
          <Select
            value={nivel}
            onChange={(e) =>
              setNivel(
                e.target.value as "" | "Colaborador" | "Supervisor" | "Gerente" | "Diretoria",
              )
            }
          >
            <option value="">— Selecione —</option>
            <option value="Colaborador">Colaborador</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Gerente">Gerente</option>
            <option value="Diretoria">Diretoria</option>
          </Select>
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.com"
          />
        </Field>
      </div>
    </Modal>
  );
}

function TagsModal({
  open,
  onClose,
  contactId,
  current,
  canManageCatalog,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  current: Tag[];
  canManageCatalog: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useQuery({
    queryKey: ["nexos", "tags"],
    queryFn: crmApi.listTags,
    enabled: open,
  });
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState("#6366f1");

  const currentIds = new Set(current.map((t) => t.id));

  const toggle = async (t: Tag) => {
    try {
      if (currentIds.has(t.id)) await crmApi.removeContactTag(contactId, t.id);
      else await crmApi.assignContactTag(contactId, t.id);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const createTag = async () => {
    if (!newName.trim()) return toast.error("Informe o nome.");
    try {
      const t = await crmApi.createTag({ name: newName.trim(), color: newColor });
      await crmApi.assignContactTag(contactId, t.id);
      setNewName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["nexos", "tags"] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Etiquetas do contato"
      description="Selecione as etiquetas cadastradas para este contato."
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {allTags.map((t) => {
          const active = currentIds.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: t.cor + (active ? "" : "60"),
                color: active ? "#fff" : t.cor,
                backgroundColor: active ? t.cor : t.cor + "15",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: active ? "#fff" : t.cor }}
              />
              {t.nome}
            </button>
          );
        })}
        {allTags.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
        )}
      </div>

      {canManageCatalog && !creating ? (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setCreating(true)}>
          <Plus className="h-3 w-3" /> Nova etiqueta
        </Button>
      ) : canManageCatalog && creating ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <Field label="Nome">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="Cor">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-16 rounded-md border border-border bg-surface-1"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={createTag}>
              Criar
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/* -------- Unified Transfer modal (departamento, atendente ou status) -------- */
function TransferModal({
  open,
  onClose,
  onSubmitAgent,
  onSubmitDepartment,
  onSubmitStatus,
  agents,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitAgent: (id: string) => void | Promise<void>;
  onSubmitDepartment: (id: string) => void | Promise<void>;
  onSubmitStatus: (status: "fila" | "standby") => void | Promise<void>;
  agents: { id: string; nome: string }[];
  departments: { id: string; nome: string }[];
}) {
  const [mode, setMode] = React.useState<"department" | "agent" | "status">("department");
  const [selectedAgent, setSelectedAgent] = React.useState("");
  const [selectedDept, setSelectedDept] = React.useState("");
  const [selectedStatus, setSelectedStatus] = React.useState<"fila" | "standby">("fila");
  const queuePrefs = useQueuePrefs();
  const filaLabel = queuePrefs.find((p) => p.id === "fila")?.label ?? "Fila";
  const standbyLabel = queuePrefs.find((p) => p.id === "standby")?.label ?? "Stand By";
  const filaEnabled = queuePrefs.find((p) => p.id === "fila")?.enabled ?? true;
  const standbyEnabled = queuePrefs.find((p) => p.id === "standby")?.enabled ?? true;
  React.useEffect(() => {
    if (open) {
      setMode("department");
      setSelectedAgent(agents[0]?.id ?? "");
      setSelectedDept(departments[0]?.id ?? "");
      setSelectedStatus(filaEnabled ? "fila" : "standby");
    }
  }, [open, agents, departments, filaEnabled]);

  const handleSubmit = () => {
    if (mode === "agent") {
      if (!selectedAgent) return toast.error("Selecione um atendente.");
      return onSubmitAgent(selectedAgent);
    }
    if (mode === "department") {
      if (!selectedDept) return toast.error("Selecione um departamento.");
      return onSubmitDepartment(selectedDept);
    }
    const enabled = selectedStatus === "fila" ? filaEnabled : standbyEnabled;
    if (!enabled) return toast.error("Essa fila está desativada.");
    return onSubmitStatus(selectedStatus);
  };

  const tabBtn = (id: "department" | "agent" | "status", label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === id ? "bg-surface-2 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir atendimento"
      description="Escolha entre mover para outro departamento, transferir para outro atendente ou alterar o status."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="mb-4 inline-flex rounded-lg border border-border bg-surface-1 p-1">
        {tabBtn("department", "Departamento")}
        {tabBtn("agent", "Atendente")}
        {tabBtn("status", "Status")}
      </div>

      {mode === "department" && (
        <Field label="Departamento">
          <Select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
            {departments.length === 0 && <option value="">Nenhum outro departamento</option>}
          </Select>
        </Field>
      )}
      {mode === "agent" && (
        <Field label="Novo atendente">
          <Select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
            {agents.length === 0 && <option value="">Nenhum outro atendente</option>}
          </Select>
        </Field>
      )}
      {mode === "status" &&
        (() => {
          const statusOptions = (["fila", "standby"] as const)
            .map((id) => {
              const p = queuePrefs.find((q) => q.id === id);
              return {
                id,
                label: id === "fila" ? filaLabel : standbyLabel,
                enabled: p?.enabled ?? true,
              };
            })
            .filter((o) => o.enabled);
          return (
            <Field label="Novo status">
              {statusOptions.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Nenhuma fila ativa. Ative uma em Configurações › Geral.
                </div>
              ) : (
                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as "fila" | "standby")}
                >
                  {statusOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          );
        })()}
    </Modal>
  );
}
