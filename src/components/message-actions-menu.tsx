import { displayDateTime } from "@/lib/format";
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
import { toast } from "sonner";
import { messageApi, type ApiMessage } from "@/lib/trixus-api";
import { canCopyMessage, sendMessageCopy } from "@/lib/copy-message";
import { copyMessageToClipboard } from "@/lib/message-clipboard";
import { invalidateConversationQueries } from "@/lib/realtime/invalidate-conversation";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Modal, ConfirmDialog } from "./modal";
import { MessageReactionPicker } from "./message-reaction-picker";
import { MessageForwardDialog } from "./message-forward-dialog";
import { Button } from "./ui-kit";

export function MessageActionsMenu({
  message,
  onReply,
  onReact,
  onDownload,
  mediaAccessAllowed = true,
  resendRequest = 0,
  openRequest = 0,
  openPosition,
  canEdit = false,
  canDelete = false,
  canSend = false,
  onCopyMessage = copyMessageToClipboard,
}: {
  message: ApiMessage;
  onReply?: () => void;
  onReact: (emoji: string | null) => Promise<void>;
  onDownload?: () => Promise<void>;
  mediaAccessAllowed?: boolean;
  resendRequest?: number;
  openRequest?: number;
  openPosition?: { x: number; y: number } | null;
  canEdit?: boolean;
  canDelete?: boolean;
  canSend?: boolean;
  onCopyMessage?: typeof copyMessageToClipboard;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null);
  const [info, setInfo] = useState(false);
  const [forward, setForward] = useState(false);
  const [resend, setResend] = useState(false);
  const [edit, setEdit] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const resendId = useRef<string | null>(null);
  const handledResendRequest = useRef(0);
  const handledOpenRequest = useRef(0);
  const outgoing = message.sender === "agent" && message.direction === "outbound";
  const canResendMessage = (item: ApiMessage) =>
    item.sender === "agent" &&
    item.direction === "outbound" &&
    item.status === "failed" &&
    !item.sent_at &&
    !item.delivered_at &&
    !item.read_at &&
    !item.deleted_for_everyone;
  const resendEligible = canResendMessage(message);
  const hasBlockedMedia = !!message.media_data && !mediaAccessAllowed;
  useEffect(() => {
    if (!openRequest || openRequest === handledOpenRequest.current) return;
    handledOpenRequest.current = openRequest;
    setError("");
    setContextPosition(openPosition ?? null);
    setOpen(true);
  }, [openPosition, openRequest]);
  useEffect(() => {
    if (!resendRequest || resendRequest === handledResendRequest.current) return;
    handledResendRequest.current = resendRequest;
    if (hasBlockedMedia || !resendEligible) return;
    setError("");
    setResend(true);
  }, [hasBlockedMedia, resendRequest, resendEligible]);
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
  const clipboardMessage =
    message.type === "image" && !mediaAccessAllowed
      ? {
          ...message,
          type: "text" as const,
          content: message.content || message.media_data?.caption || "",
          media_data: null,
        }
      : message;
  const canCopyToClipboard =
    !!clipboardMessage.content ||
    (message.type === "image" && mediaAccessAllowed && mediaReady && !message.deleted_for_everyone);
  return (
    <>
      <div className="absolute right-1 top-1 z-10" onClick={(event) => event.stopPropagation()}>
        <Popover
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) setContextPosition(null);
            setError("");
          }}
        >
          {contextPosition && (
            <PopoverAnchor asChild>
              <span
                aria-hidden="true"
                className="pointer-events-none fixed z-[259] h-px w-px"
                style={{ left: contextPosition.x, top: contextPosition.y }}
              />
            </PopoverAnchor>
          )}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Ações da mensagem"
              title="Ações da mensagem"
              onPointerDown={() => setContextPosition(null)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${open ? "opacity-100" : "opacity-0 pointer-events-none group-hover/message:opacity-100 group-hover/message:pointer-events-auto group-focus-within/message:opacity-100 group-focus-within/message:pointer-events-auto"}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            className="z-[260] w-52 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-1"
            aria-label="Ações da mensagem"
          >
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
              disabled={busy || !canSend || !onReply}
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
              disabled={busy || !canCopyToClipboard}
              onClick={() =>
                void run(async () => {
                  const result = await onCopyMessage(clipboardMessage);
                  if (
                    result.mode === "text-only" &&
                    message.type === "image" &&
                    mediaAccessAllowed
                  ) {
                    toast.warning(
                      "O navegador não permitiu copiar a imagem. Somente o texto foi copiado.",
                    );
                  }
                })
              }
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            <button
              className={itemClass}
              disabled={
                busy ||
                !canSend ||
                (!!message.media_data && !mediaAccessAllowed) ||
                !canCopyMessage(message)
              }
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
              disabled={busy || !mediaAccessAllowed || !mediaReady || !onDownload}
              onClick={() => {
                if (mediaAccessAllowed && onDownload) void run(onDownload);
              }}
            >
              <Download className="h-4 w-4" />
              Baixar
            </button>
            {resendEligible && (
              <button
                className={itemClass}
                disabled={
                  busy ||
                  !canSend ||
                  (!!message.media_data && !mediaAccessAllowed) ||
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
            )}
            {outgoing && <div className="my-1 border-t border-border" />}
            {outgoing && (
              <button
                className={itemClass}
                disabled={
                  busy ||
                  !canEdit ||
                  message.sender !== "agent" ||
                  (message.type !== "text" &&
                    !(message.type === "image" && !!message.content.trim())) ||
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
            )}
            {outgoing && (
              <button
                className={itemClass}
                disabled={
                  busy || !canDelete || message.sender !== "agent" || !!message.deleted_for_everyone
                }
                onClick={() => {
                  setOpen(false);
                  setRemove(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Apagar
              </button>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-border p-2">
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={busy || !canSend}
                  aria-label={`Reagir com ${emoji}`}
                  className="h-8 w-7 rounded hover:bg-surface-2"
                  onClick={() => void run(() => onReact(emoji))}
                >
                  {emoji}
                </button>
              ))}
              <MessageReactionPicker
                disabled={busy || !canSend}
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
      {forward && !hasBlockedMedia && (
        <MessageForwardDialog
          message={message}
          onClose={() => setForward(false)}
          layerClassName="z-[270]"
        />
      )}
      <Modal
        open={info}
        onClose={() => setInfo(false)}
        title="Informações da mensagem"
        layerClassName="z-[270]"
      >
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
              <dd>{value ? displayDateTime(value) : "Sem confirmação"}</dd>
            </div>
          ))}
        </dl>
      </Modal>
      <ConfirmDialog
        open={resend && !hasBlockedMedia && resendEligible}
        layerClassName="z-[270]"
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
            if (hasBlockedMedia) throw new Error("Inicie o atendimento para acessar este arquivo.");
            const current = await messageApi.get(message.conversation_id, message.id);
            if (!canResendMessage(current))
              throw new Error("O status da mensagem mudou. Atualize a conversa antes de reenviar.");
            resendId.current ??= crypto.randomUUID();
            await sendMessageCopy(current, current.conversation_id, resendId.current);
            void invalidateConversationQueries(qc, current.conversation_id);
          })
        }
      />
      <Modal
        open={edit && outgoing}
        onClose={() => !busy && setEdit(false)}
        title="Editar mensagem"
        layerClassName="z-[270]"
      >
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
            <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(false)}>
              Cancelar
            </Button>
            <button
              type="submit"
              className="save-action-button rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              disabled={busy || !editText.trim()}
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={remove && outgoing}
        layerClassName="z-[270]"
        onClose={() => !busy && setRemove(false)}
        title="Apagar Mensagem"
        description="Deseja realmente apagar a mensagem?"
        confirmLabel="Apagar"
        destructive
        onConfirm={() =>
          run(async () => {
            await messageApi.delete(message.conversation_id, message.id);
            await invalidateConversationQueries(qc, message.conversation_id);
            setRemove(false);
          })
        }
      />
    </>
  );
}
