import * as React from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";

export function QrGenerationLoadingOverlay({ open }: { open: boolean }) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-generation-loading-title"
        aria-busy="true"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") event.preventDefault();
        }}
        className="flex min-w-72 flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-7 text-center text-sm font-semibold text-foreground shadow-2xl outline-none"
      >
        <RefreshCw className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span id="qr-generation-loading-title" role="status" aria-live="assertive">
          Aguarde, QR Code está sendo gerado!
        </span>
      </div>
    </div>,
    document.body,
  );
}
