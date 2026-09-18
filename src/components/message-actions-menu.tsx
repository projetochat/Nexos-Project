import { useRef, useState } from "react";
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

export function MessageActionsMenu({
  message,
  onReply,
  onReact,
  onDownload,
}: {
  message: ApiMessage;
  onReply?: () => void;
  onReact: (emoji: string | null) => Promise<void>;
  onDownload: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [forward, setForward] = useState(false);
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const resendId = useRef<string | null>(null);
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
              disabled
              title="A integração atual não permite apagar mensagens no WhatsApp."
            >
              <Trash2 className="h-4 w-4" />
              Apagar
            </button>
            <button
              className={itemClass}
              disabled
              title="A integração atual não permite editar mensagens no WhatsApp."
            >
              <Pencil className="h-4 w-4" />
              Editar
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
    </>
  );
}
