import * as React from "react";

export const COLLAPSED_MESSAGE_LINES = 12;

/** Fold only the presentation; the original message and its formatted nodes remain intact. */
export function CollapsibleMessageText({
  content,
  highlighted = false,
  children,
}: {
  content: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const bodyId = React.useId();

  React.useEffect(() => {
    setExpanded(false);
    setOverflowing(false);
  }, [content]);

  // Search/quoted-message navigation must reveal the match even after its highlight expires.
  React.useEffect(() => {
    if (highlighted) setExpanded(true);
  }, [content, highlighted]);

  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      if (body.clientHeight === 0) return;
      if (!expanded) {
        setOverflowing(body.scrollHeight > body.clientHeight + 1);
      } else {
        const style = window.getComputedStyle(body);
        const fontSize = Number.parseFloat(style.fontSize) || 14;
        const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5;
        setOverflowing(body.scrollHeight > lineHeight * COLLAPSED_MESSAGE_LINES + 1);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [content, expanded]);

  return (
    <div className="min-w-0">
      <div
        ref={bodyRef}
        id={bodyId}
        data-collapsible-message-text
        onFocusCapture={() => setExpanded(true)}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: COLLAPSED_MESSAGE_LINES,
                overflow: "hidden",
              }
        }
      >
        {children}
      </div>
      {overflowing && (
        <button
          type="button"
          className="mt-1 block cursor-pointer rounded-sm text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Ler menos" : "Ler mais"}
        </button>
      )}
    </div>
  );
}
