import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contentId = useId();
  const cancelClose = () => clearTimeout(timer.current);
  const closeAfterHover = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!pinned.current) setOpen(false);
    }, 150);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        pinned.current = false;
        setOpen(next);
      }}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={`Informações sobre ${label}`}
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          aria-haspopup="dialog"
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={closeAfterHover}
          onClick={(event) => {
            event.stopPropagation();
            cancelClose();
            pinned.current = !pinned.current;
            setOpen(pinned.current);
          }}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        id={contentId}
        aria-label={`Informações sobre ${label}`}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={cancelClose}
        onPointerLeave={closeAfterHover}
        onInteractOutside={(event) => {
          // The anchor handles its own click, including closing a pinned note.
          if ((event.target as HTMLElement)?.closest?.(`[aria-controls="${contentId}"]`)) {
            event.preventDefault();
          }
        }}
        className="z-[300] w-max max-w-[min(16rem,calc(100vw-2rem))] break-words bg-primary px-3 py-1.5 text-left text-xs font-normal normal-case tracking-normal text-primary-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
