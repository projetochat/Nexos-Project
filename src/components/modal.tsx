import * as React from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "./ui-kit";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  className,
  footer,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  footer?: React.ReactNode;
  initialFocus?: string;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || !initialFocus) return;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(initialFocus)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialFocus]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (e.key === "Escape" && dialogs[dialogs.length - 1] === dialogRef.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-6xl",
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        className={`relative z-10 flex max-h-[calc(100dvh-1rem)] min-w-0 w-full ${widths[size]} flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${className ?? ""}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md border border-border bg-surface-2 p-1.5 text-muted-foreground transition hover:bg-surface-3 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-1 px-4 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive,
  accent,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  accent?: "destructive" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocus={
        destructive || /excluir|remover/i.test(confirmLabel) ? "[data-confirm-action]" : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={accent === "primary" ? "primary" : destructive ? "destructive" : "primary"}
            size="sm"
            autoFocus={destructive || /excluir|remover/i.test(confirmLabel)}
            data-confirm-action
            className="focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-card"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {destructive && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              accent === "primary"
                ? "bg-primary/15 text-primary"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
        )}
        {typeof description === "string" ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{description}</p>
        ) : (
          <div className="min-w-0 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
    </Modal>
  );
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = React.useState(initial);
  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
    set: setOpen,
  };
}
