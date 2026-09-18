import * as React from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui-kit";

export function ProfilePhotoMenuButton({
  icon,
  onClick,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-foreground transition hover:bg-surface-1 ${className}`}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}

export function ProfilePhotoMenu({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: Math.min(window.innerHeight - 220, rect.bottom + 8),
        left: Math.max(12, Math.min(window.innerWidth - 204, rect.left)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [anchorRef, onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[260] w-48 rounded-lg border border-border bg-card py-2 text-sm shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ProfileCameraModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(() => setError("Não foi possível acessar a câmera neste dispositivo."));
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("A câmera ainda não está pronta.");
      return;
    }
    const ratio = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Não foi possível capturar a imagem.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tirar foto"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={capture} disabled={!!error}>
            Capturar
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-video w-full rounded-lg border border-border bg-black object-cover"
        />
      )}
    </Modal>
  );
}

export function ProfilePhotoPreviewModal({
  open,
  src,
  onClose,
}: {
  open: boolean;
  src?: string;
  onClose: () => void;
}) {
  return (
    <Modal open={open && !!src} onClose={onClose} title="Foto de perfil" size="md">
      <div className="flex justify-center">
        {src && (
          <img
            src={src}
            alt="Foto de perfil"
            className="max-h-[70vh] w-full max-w-sm rounded-xl border border-border object-contain"
          />
        )}
      </div>
    </Modal>
  );
}
