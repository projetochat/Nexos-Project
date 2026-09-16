import * as React from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./ui-kit";
import { cropGeometry } from "@/lib/photo-crop";

export function PhotoCropper({
  source,
  onClose,
  onApply,
}: {
  source: string;
  onClose: () => void;
  onApply: (dataUrl: string) => void | Promise<void>;
}) {
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const drag = React.useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    size: number;
  } | null>(null);
  const ready = dimensions.width > 0 && dimensions.height > 0;
  const geometry = cropGeometry(
    dimensions.width || 1,
    dimensions.height || 1,
    zoom,
    position.x,
    position.y,
  );
  const move = (x: number, y: number, nextZoom = zoom) => {
    const next = cropGeometry(dimensions.width || 1, dimensions.height || 1, nextZoom, x, y);
    setPosition({ x: next.offsetX, y: next.offsetY });
  };
  const changeZoom = (value: number) => {
    const next = Math.max(1, Math.min(4, value));
    setZoom(next);
    move(position.x, position.y, next);
  };
  const confirm = async () => {
    if (!ready || busy || !imageRef.current) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível ajustar a foto.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 512, 512);
      context.drawImage(
        imageRef.current,
        geometry.sourceX,
        geometry.sourceY,
        geometry.side,
        geometry.side,
        0,
        0,
        512,
        512,
      );
      await onApply(canvas.toDataURL("image/jpeg", 0.9));
      onClose();
    } catch (cause) {
      setError((cause as Error).message || "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="Ajustar foto"
      description="Arraste a foto e ajuste o zoom para escolher o enquadramento."
      size="sm"
      initialFocus="[data-photo-crop-frame]"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={!ready || busy} onClick={confirm}>
            {busy ? "Aplicando..." : "Confirmar recorte"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          data-photo-crop-frame
          tabIndex={0}
          role="group"
          aria-label="Enquadramento da foto. Use as setas para reposicionar."
          className="relative mx-auto aspect-square w-full max-w-80 touch-none overflow-hidden rounded-full border-2 border-primary bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-move"
          onPointerDown={(event) => {
            if (!ready || busy || drag.current) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              startX: geometry.offsetX,
              startY: geometry.offsetY,
              size: event.currentTarget.getBoundingClientRect().width,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId || busy) return;
            move(
              start.startX + (event.clientX - start.x) / start.size,
              start.startY + (event.clientY - start.y) / start.size,
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (
              !ready ||
              busy ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
            )
              return;
            event.preventDefault();
            const step = event.shiftKey ? 0.05 : 0.01;
            move(
              geometry.offsetX +
                (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
              geometry.offsetY +
                (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
            );
          }}
        >
          <img
            ref={imageRef}
            src={source}
            alt="Prévia do recorte"
            draggable={false}
            onLoad={(event) =>
              setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => {
              setDimensions({ width: 0, height: 0 });
              setError("Não foi possível abrir esta imagem. Escolha outra foto.");
            }}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: `${geometry.displayWidth * 100}%`,
              height: `${geometry.displayHeight * 100}%`,
              left: `${50 + geometry.offsetX * 100}%`,
              top: `${50 + geometry.offsetY * 100}%`,
              transform: "translate(-50%, -50%)",
              opacity: ready ? 1 : 0,
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Diminuir zoom"
            disabled={!ready || busy || zoom <= 1}
            onClick={() => changeZoom(zoom - 0.1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <label className="flex-1 text-xs">
            Zoom · {Math.round(zoom * 100)}%
            <input
              aria-label="Zoom da foto"
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              disabled={!ready || busy}
              onChange={(event) => changeZoom(Number(event.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Aumentar zoom"
            disabled={!ready || busy || zoom >= 4}
            onClick={() => changeZoom(zoom + 0.1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !ready}
          onClick={() => {
            setZoom(1);
            setPosition({ x: 0, y: 0 });
          }}
        >
          <RotateCcw className="h-4 w-4" /> Centralizar e redefinir
        </Button>
        <p className="text-xs text-muted-foreground">
          O recorte mantém a proporção da foto. Você também pode usar as setas do teclado para
          reposicionar.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
