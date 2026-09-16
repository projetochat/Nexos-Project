import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcwSquare,
  Forward,
  Reply,
  Download,
  X,
} from "lucide-react";
import { conversationApi, messageApi, type ApiMessage } from "@/lib/trixus-api";
import { Button, SearchInput } from "@/components/ui-kit";

const initialView = { zoom: 1, x: 0, y: 0, rotation: 0, flipX: 1, flipY: 1 };

export function InboxImageViewer({
  src,
  message,
  onClose,
  onReply,
  onDownload,
}: {
  src: string;
  message: ApiMessage;
  onClose: () => void;
  onReply?: () => void;
  onDownload: () => Promise<void>;
}) {
  const [view, setView] = React.useState(initialView);
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null);
  const [forwarding, setForwarding] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const clientIds = React.useRef(new Map<string, string>());
  const qc = useQueryClient();
  const destinations = useQuery({
    queryKey: ["trixus", "conversations", "image-forward", search, page],
    queryFn: () => conversationApi.list({ q: search || undefined, page, pageSize: 50 }),
    enabled: forwarding,
  });
  const caption = message.content && message.content !== "[imagem]" ? message.content : "";

  const zoom = React.useCallback((factor: number, point = { x: 0, y: 0 }) => {
    setView((current) => {
      const next = Math.min(8, Math.max(0.25, current.zoom * factor));
      const ratio = next / current.zoom;
      return {
        ...current,
        zoom: next,
        x: point.x - (point.x - current.x) * ratio,
        y: point.y - (point.y - current.y) * ratio,
      };
    });
  }, []);

  React.useEffect(() => {
    const element = stage;
    if (!element || forwarding) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoom, forwarding, stage]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const forward = () =>
    run(async () => {
      if (!target) return;
      const blob = await messageApi.downloadMedia(message.conversation_id, message.id);
      if (!clientIds.current.has(target)) clientIds.current.set(target, crypto.randomUUID());
      await messageApi.sendMedia(target, blob, {
        fileName: message.media_data?.file_name ?? "imagem.jpg",
        mimeType: blob.type || "image/jpeg",
        mediaType: "image",
        caption,
      clientMessageId: clientIds.current.get(target),
    });
    clientIds.current.delete(target);
      void qc.invalidateQueries({ queryKey: ["trixus", "messages", target] });
      void qc.invalidateQueries({ queryKey: ["trixus", "conversations"] });
      setForwarding(false);
      setTarget("");
      setNotice("Imagem encaminhada para envio.");
    });

  const action = (label: string, Icon: typeof ZoomIn, onClick: () => void, disabled = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 sm:h-11 sm:w-11"
    >
      <Icon className="h-5 w-5" />
    </button>
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busyRef.current) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/85" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[251] flex flex-col text-white outline-none"
          onEscapeKeyDown={(event) => {
            if (forwarding || busy) {
              event.preventDefault();
              if (!busy) setForwarding(false);
            }
          }}
        >
          <Dialog.Title className="sr-only">
            Visualizar imagem: {message.media_data?.file_name ?? "Imagem"}
          </Dialog.Title>
          <div className="z-10 flex shrink-0 flex-wrap justify-between gap-2 p-3">
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Ajustar visualização"
            >
              {action("Aumentar zoom", ZoomIn, () => zoom(1.25), view.zoom >= 8)}
              {action("Diminuir zoom", ZoomOut, () => zoom(0.8), view.zoom <= 0.25)}
              {action("Girar à esquerda", RotateCcw, () =>
                setView((v) => ({ ...v, rotation: v.rotation - 90 })),
              )}
              {action("Girar à direita", RotateCw, () =>
                setView((v) => ({ ...v, rotation: v.rotation + 90 })),
              )}
              {action("Espelhar horizontalmente", FlipHorizontal2, () =>
                setView((v) => ({ ...v, flipX: -v.flipX })),
              )}
              {action("Espelhar verticalmente", FlipVertical2, () =>
                setView((v) => ({ ...v, flipY: -v.flipY })),
              )}
              {action("Restaurar visualização", RotateCcwSquare, () => setView(initialView))}
              <span className="text-xs tabular-nums">{Math.round(view.zoom * 100)}%</span>
            </div>
            <div className="flex gap-2" role="group" aria-label="Ações da imagem">
              {action(
                "Encaminhar",
                Forward,
                () => {
                  setForwarding(true);
                  setNotice("");
                  setError("");
                },
                busy,
              )}
              {onReply &&
                action(
                  "Responder",
                  Reply,
                  () => {
                    onClose();
                    onReply();
                  },
                  busy,
                )}
              {action("Baixar imagem", Download, () => void run(onDownload), busy)}
              {action("Fechar", X, onClose, busy)}
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="z-10 mx-3 rounded-lg bg-red-950 px-4 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mx-3 text-center text-sm">
              {notice}
            </p>
          )}
          {forwarding ? (
            <div className="m-auto flex max-h-[70dvh] w-[min(90vw,480px)] flex-col gap-4 rounded-xl border border-border bg-card p-5 text-foreground">
              <h2 className="font-semibold">Encaminhar imagem</h2>
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                  setTarget("");
                }}
                placeholder="Buscar conversa..."
              />
              <div
                className="min-h-0 overflow-y-auto"
                role="group"
                aria-label="Conversa de destino"
              >
                {destinations.isLoading && <p className="text-sm">Carregando conversas...</p>}
                {destinations.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Não foi possível carregar as conversas.
                  </p>
                )}
                {destinations.data?.items
                  .filter(
                    (item) => item.status !== "fechada" && item.id !== message.conversation_id,
                  )
                  .map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-surface-2"
                    >
                      <input
                        type="radio"
                        name="image-destination"
                        checked={target === item.id}
                        disabled={busy}
                        onChange={() => setTarget(item.id)}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block truncate">{item.contact?.nome ?? "Contato"}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.contact?.telefone} · {item.connection?.name ?? "Sem instância"}
                        </span>
                      </span>
                    </label>
                  ))}
                {destinations.isSuccess &&
                  !destinations.data.items.some(
                    (item) => item.status !== "fechada" && item.id !== message.conversation_id,
                  ) && (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma conversa aberta encontrada.
                    </p>
                  )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <Button
                  variant="outline"
                  disabled={page === 1 || busy}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setTarget("");
                  }}
                >
                  Anterior
                </Button>
                <span>Página {page}</span>
                <Button
                  variant="outline"
                  disabled={busy || !destinations.data || page * 50 >= destinations.data.total}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setTarget("");
                  }}
                >
                  Próxima
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setForwarding(false)}>
                  Cancelar
                </Button>
                <Button disabled={!target || busy} onClick={() => void forward()}>
                  {busy ? "Encaminhando..." : "Encaminhar"}
                </Button>
              </div>
            </div>
          ) : (
            <div
              ref={setStage}
              data-testid="image-stage"
              className={`relative min-h-0 flex-1 touch-none overflow-hidden ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              onDoubleClick={() => setView(initialView)}
              onPointerDown={(event) => {
                if (event.button !== 0 || drag.current) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                setDragging(true);
              }}
              onPointerMove={(event) => {
                const previous = drag.current;
                if (!previous || previous.id !== event.pointerId) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
              }}
              onPointerUp={() => {
                drag.current = null;
                setDragging(false);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(false);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setDragging(false);
              }}
            >
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <img
                  src={src}
                  alt={message.media_data?.file_name ?? "Imagem ampliada"}
                  draggable={false}
                  className="max-h-full max-w-full select-none object-contain"
                  style={{
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${view.rotation}deg) scale(${view.flipX}, ${view.flipY})`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="shrink-0 px-4 py-3 text-center">
            {caption && (
              <p className="max-h-20 overflow-auto whitespace-pre-wrap text-sm">{caption}</p>
            )}
            <p className="mt-1 text-xs text-white/50">
              Use o scroll para ampliar e arraste para mover. Clique duas vezes para restaurar.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
