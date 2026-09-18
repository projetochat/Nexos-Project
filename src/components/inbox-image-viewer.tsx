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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { conversationApi, messageApi, type ApiMessage } from "@/lib/trixus-api";
import { Button, SearchInput } from "@/components/ui-kit";

const initialView = { zoom: 1, x: 0, y: 0, rotation: 0, flipX: 1, flipY: 1 };

export function InboxImageViewer({
  src,
  message,
  images,
  onClose,
  onReply,
  onDownload,
}: {
  src: string;
  message: ApiMessage;
  images?: ApiMessage[];
  onClose: () => void;
  onReply?: (message: ApiMessage) => void;
  onDownload: (message: ApiMessage) => Promise<void>;
}) {
  const [view, setView] = React.useState(initialView);
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    pan: boolean;
  } | null>(null);
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [forwarding, setForwarding] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const gallery = React.useMemo(() => {
    const available = (images ?? []).filter((item) => item.type === "image");
    return available.some((item) => item.id === message.id) ? available : [message];
  }, [images, message]);
  const galleryKey = React.useMemo(() => gallery.map((item) => item.id).join(","), [gallery]);
  const [activeIndex, setActiveIndex] = React.useState(() =>
    Math.max(
      0,
      gallery.findIndex((item) => item.id === message.id),
    ),
  );
  const [galleryUrls, setGalleryUrls] = React.useState<Map<string, string>>(
    () => new Map([[message.id, src]]),
  );
  const clientIds = React.useRef(new Map<string, string>());
  const qc = useQueryClient();
  const destinations = useQuery({
    queryKey: ["trixus", "conversations", "image-forward", search, page],
    queryFn: () =>
      conversationApi.list({
        q: search || undefined,
        page,
        pageSize: 50,
        sort: "lastMessageAt",
        direction: "desc",
      }),
    enabled: forwarding,
  });
  const activeMessage = gallery[activeIndex] ?? message;
  const activeSrc = galleryUrls.get(activeMessage.id);
  const caption =
    activeMessage.content && activeMessage.content !== "[imagem]" ? activeMessage.content : "";

  React.useEffect(() => {
    const nextIndex = gallery.findIndex((item) => item.id === message.id);
    setActiveIndex(Math.max(0, nextIndex));
  }, [galleryKey, gallery, message.id]);

  React.useEffect(() => {
    setView(initialView);
    drag.current = null;
    setDragging(false);
  }, [activeMessage.id]);

  React.useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    setGalleryUrls(new Map([[message.id, src]]));

    const loadGallery = async () => {
      for (const item of gallery) {
        if (item.id === message.id) continue;
        try {
          const blob = await messageApi.downloadMedia(item.conversation_id, item.id, true);
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          setGalleryUrls((current) => new Map(current).set(item.id, objectUrl));
        } catch {
          // Uma foto indisponível não impede a navegação pelas demais imagens.
        }
      }
    };

    void loadGallery();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [gallery, galleryKey, message.id, src]);

  const zoom = React.useCallback((factor: number, point = { x: 0, y: 0 }) => {
    setView((current) => {
      const next = Math.min(8, Math.max(0.25, current.zoom * factor));
      const ratio = next / current.zoom;
      return {
        ...current,
        zoom: next,
        x: next > 1 ? point.x - (point.x - current.x) * ratio : 0,
        y: next > 1 ? point.y - (point.y - current.y) * ratio : 0,
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
      const blob = await messageApi.downloadMedia(activeMessage.conversation_id, activeMessage.id);
      if (!clientIds.current.has(target)) clientIds.current.set(target, crypto.randomUUID());
      await messageApi.sendMedia(target, blob, {
        fileName: activeMessage.media_data?.file_name ?? "imagem.jpg",
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
            Visualizar imagem: {activeMessage.media_data?.file_name ?? "Imagem"}
          </Dialog.Title>
          <div className="z-10 flex shrink-0 flex-wrap justify-between gap-2 p-3">
            <div
              className="hidden flex-wrap items-center gap-2 sm:flex"
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
            <div
              className="relative flex w-full flex-wrap gap-2 pt-12 sm:w-auto sm:flex-nowrap sm:pt-0"
              role="group"
              aria-label="Ações da imagem"
            >
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
                    onReply(activeMessage);
                  },
                  busy,
                )}
              {action(
                "Baixar imagem",
                Download,
                () => void run(() => onDownload(activeMessage)),
                busy,
              )}
              <div className="absolute right-0 top-0 sm:static">
                {action("Fechar", X, onClose, busy)}
              </div>
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
              className={`relative min-h-0 flex-1 touch-none overflow-hidden ${view.zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : gallery.length > 1 ? "cursor-ew-resize" : "cursor-default"}`}
              onDoubleClick={() => setView(initialView)}
              onPointerDown={(event) => {
                if (event.button !== 0 || drag.current) return;
                const imageBounds = imageRef.current?.getBoundingClientRect();
                const clickedOutsideImage =
                  imageBounds &&
                  imageBounds.width > 0 &&
                  imageBounds.height > 0 &&
                  (event.clientX < imageBounds.left ||
                    event.clientX > imageBounds.right ||
                    event.clientY < imageBounds.top ||
                    event.clientY > imageBounds.bottom);
                if (clickedOutsideImage) {
                  if (!busyRef.current) onClose();
                  return;
                }
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  id: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  startX: event.clientX,
                  startY: event.clientY,
                  pan: view.zoom > 1,
                };
                setDragging(true);
              }}
              onPointerMove={(event) => {
                const previous = drag.current;
                if (!previous || previous.id !== event.pointerId) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                drag.current = { ...previous, x: event.clientX, y: event.clientY };
                if (previous.pan)
                  setView((v) => (v.zoom > 1 ? { ...v, x: v.x + dx, y: v.y + dy } : v));
              }}
              onPointerUp={(event) => {
                const gesture = drag.current;
                if (!gesture || gesture.id !== event.pointerId) return;
                if (!gesture.pan) {
                  const dx = event.clientX - gesture.startX;
                  const dy = event.clientY - gesture.startY;
                  if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    setActiveIndex((index) =>
                      Math.max(0, Math.min(gallery.length - 1, index + (dx < 0 ? 1 : -1))),
                    );
                  }
                }
                drag.current = null;
                setDragging(false);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
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
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    title="Foto anterior"
                    disabled={activeIndex === 0}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
                    className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 sm:left-6"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Próxima foto"
                    title="Próxima foto"
                    disabled={activeIndex === gallery.length - 1}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() =>
                      setActiveIndex((current) => Math.min(gallery.length - 1, current + 1))
                    }
                    className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30 sm:right-6"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                {activeSrc ? (
                  <img
                    ref={imageRef}
                    src={activeSrc}
                    alt={activeMessage.media_data?.file_name ?? "Imagem ampliada"}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain"
                    style={{
                      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${view.rotation}deg) scale(${view.flipX}, ${view.flipY})`,
                    }}
                  />
                ) : (
                  <p className="text-sm text-white/70">Carregando imagem...</p>
                )}
              </div>
            </div>
          )}
          {!forwarding && gallery.length > 1 && (
            <div className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-white/10 bg-black/30 px-4 py-3">
              {gallery.map((item, index) => {
                const thumbnail = galleryUrls.get(item.id);
                const selected = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Ver foto ${index + 1} de ${gallery.length}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => setActiveIndex(index)}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-16 sm:w-16 ${
                      selected ? "border-white" : "border-transparent opacity-65 hover:opacity-100"
                    }`}
                  >
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={`Miniatura ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-white/10 text-xs text-white/60">
                        {index + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="shrink-0 px-4 py-3 text-center">
            {caption && (
              <p className="max-h-20 overflow-auto whitespace-pre-wrap text-sm">{caption}</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
