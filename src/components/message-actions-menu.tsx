import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  Forward,
  Info,
  Pencil,
  RefreshCw,
  Reply,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { messageApi, type ApiMessage } from "@/lib/trixus-api";
import { canCopyMessage, sendMessageCopy } from "@/lib/copy-message";
import { invalidateConversationQueries } from "@/lib/realtime/invalidate-conversation";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Modal, ConfirmDialog } from "./modal";
import { MessageReactionPicker } from "./message-reaction-picker";
import { MessageForwardDialog } from "./message-forward-dialog";
import { schedulesApi } from "@/lib/trixus-api";

export function MessageActionsMenu({
  message,
  onReply,
  onReact,
  onDownload,
  resendRequest = 0,
}: {
  message: ApiMessage;
  onReply?: () => void;
  onReact: (emoji: string | null) => Promise<void>;
  onDownload: () => Promise<void>;
  resendRequest?: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [forward, setForward] = useState(false);
  const [resend, setResend] = useState(false);
  const [edit, setEdit] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [remove, setRemove] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const resendId = useRef<string | null>(null);
  const handledResendRequest = useRef(0);
  useEffect(() => {
    if (!resendRequest || resendRequest === handledResendRequest.current) return;
    handledResendRequest.current = resendRequest;
    setError("");
    setResend(true);
  }, [resendRequest]);
  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      setOpen(false);
      setResend(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const itemClass =
    "flex min-h-10 w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed";
  const mediaReady =
    !!message.media_data && (!message.media_data.state || message.media_data.state === "ready");
  return (
    <>
      <div className="absolute right-1 top-1 z-10" onClick={(event) => event.stopPropagation()}>
        <Popover
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            setError("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Ações da mensagem"
              title="Ações da mensagem"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${open ? "opacity-100" : "opacity-0 pointer-events-none group-hover/message:opacity-100 group-hover/message:pointer-events-auto group-focus-within/message:opacity-100 group-focus-within/message:pointer-events-auto"}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            className="z-[250] w-64 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-1"
            aria-label="Ações da mensagem"
          >
            <button
              className={itemClass}
              disabled={busy || !onReply}
              onClick={() => {
                onReply?.();
                setOpen(false);
              }}
            >
              <Reply className="h-4 w-4" />
              Responder
            </button>
            <button
              className={itemClass}
              disabled={busy || !message.content}
              onClick={() => void run(() => navigator.clipboard.writeText(message.content))}
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            <button
              className={itemClass}
              disabled={busy || !canCopyMessage(message)}
              onClick={() => {
                setOpen(false);
                setForward(true);
              }}
            >
              <Forward className="h-4 w-4" />
              Encaminhar
            </button>
            <button
              className={itemClass}
              disabled={
                busy ||
                message.sender !== "agent" ||
                message.status !== "failed" ||
                !canCopyMessage(message)
              }
              onClick={() => {
                setOpen(false);
                setResend(true);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Reenviar
            </button>
            <div className="my-1 border-t border-border" />
            <button
              className={itemClass}
              disabled={busy || message.sender !== "agent" || !!message.deleted_for_everyone}
              onClick={() => {
                setOpen(false);
                setRemove(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Apagar
            </button>
            <button
              className={itemClass}
              disabled={
                busy ||
                message.sender !== "agent" ||
                message.type !== "text" ||
                !!message.deleted_for_everyone
              }
              onClick={() => {
                setEditText(message.content);
                setOpen(false);
                setEdit(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              className={itemClass}
              disabled={busy || message.sender !== "agent"}
              onClick={() => {
                setOpen(false);
                setSchedule(true);
              }}
            >
              <span className="text-base">◷</span>
              Agendar mensagem
            </button>
            <button
              className={itemClass}
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setInfo(true);
              }}
            >
              <Info className="h-4 w-4" />
              Informações
            </button>
            <button
              className={itemClass}
              disabled={busy || !mediaReady}
              onClick={() => void run(onDownload)}
            >
              <Download className="h-4 w-4" />
              Salvar como…
            </button>
            <div className="mt-1 flex items-center justify-between border-t border-border p-2">
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy}
                  aria-label={`Reagir com ${emoji}`}
                  className="h-8 w-7 rounded hover:bg-surface-2"
                  onClick={() => void run(() => onReact(emoji))}
                >
                  {emoji}
                </button>
              ))}
              <MessageReactionPicker
                onReact={async (emoji) => {
                  await onReact(emoji);
                  setOpen(false);
                }}
              />
            </div>
            {error && (
              <p role="alert" className="p-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {forward && <MessageForwardDialog message={message} onClose={() => setForward(false)} />}
      <Modal open={info} onClose={() => setInfo(false)} title="Informações da mensagem">
        <dl className="space-y-3 text-sm">
          {[
            ["Criada", message.created_at],
            ["Enviada", message.sent_at],
            ["Entregue", message.delivered_at],
            ["Lida", message.read_at],
            ["Falha", message.failed_at],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value ? new Date(value).toLocaleString("pt-BR") : "Sem confirmação"}</dd>
            </div>
          ))}
        </dl>
      </Modal>
      <ConfirmDialog
        open={resend}
        onClose={() => {
          if (!running.current) {
            setResend(false);
            setError("");
          }
        }}
        title="Reenviar mensagem"
        description={
          <>
            <span>Enviar novamente esta mensagem com falha?</span>
            {error && (
              <p role="alert" className="mt-2 text-destructive">
                {error}
              </p>
            )}
          </>
        }
        onConfirm={() =>
          run(async () => {
            const current = await messageApi.get(message.conversation_id, message.id);
            if (current.status !== "failed")
              throw new Error("O status da mensagem mudou. Atualize a conversa antes de reenviar.");
            resendId.current ??= crypto.randomUUID();
            await sendMessageCopy(current, current.conversation_id, resendId.current);
            void invalidateConversationQueries(qc, current.conversation_id);
          })
        }
      />
      <Modal open={edit} onClose={() => !busy && setEdit(false)} title="Editar mensagem">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await messageApi.edit(message.conversation_id, message.id, editText);
              await invalidateConversationQueries(qc, message.conversation_id);
              setEdit(false);
            });
          }}
        >
          <textarea
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            className="min-h-24 w-full rounded-lg border border-border bg-card p-3 text-sm"
            maxLength={4000}
            autoFocus
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => setEdit(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              disabled={busy || !editText.trim()}
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={remove}
        onClose={() => !busy && setRemove(false)}
        title="Apagar mensagem"
        description="A mensagem será sinalizada como apagada para todos."
        onConfirm={() =>
          run(async () => {
            await messageApi.delete(message.conversation_id, message.id);
            await invalidateConversationQueries(qc, message.conversation_id);
            setRemove(false);
          })
        }
      />
      <Modal open={schedule} onClose={() => !busy && setSchedule(false)} title="Agendar mensagem">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (!scheduleAt) throw new Error("Escolha data e horário.");
              const date = new Date(scheduleAt);
              if (date <= new Date()) throw new Error("Escolha um horário futuro.");
              await schedulesApi.save({
                id: crypto.randomUUID(),
                identifier: `msg-${message.id}`,
                type: "message",
                title: "Mensagem agendada",
                destination: "Conversa atual",
                scheduledAt: date.toISOString(),
                recurrence: "once",
                delivery: true,
                status: "pending",
                connectionId: "",
                departmentId: "",
                content: message.content,
                recipientIds: [],
                recipients: [],
                recurrenceDays: [],
                recurrenceLimit: "",
                recurrenceUntil: "",
                assignedMembershipId: "",
                attachmentName: null,
                conversationId: message.conversation_id,
              } as never);
              await invalidateConversationQueries(qc, message.conversation_id);
              setSchedule(false);
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Data e horário</span>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
              className="w-full rounded-lg border border-border bg-card p-2"
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => setSchedule(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              disabled={busy}
            >
              Agendar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
